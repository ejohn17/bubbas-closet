import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { syncSubscription } from "@/lib/billing";
import { setPendingTier } from "@/lib/db/subscriptions";
import { updateShippingAddress } from "@/lib/db/users";
import { requireStripe } from "@/lib/stripe";
import type { Address } from "@/lib/types";

/**
 * Stripe webhook: the only writer of subscription state in Firestore.
 *
 * Configure the endpoint at /api/stripe/webhook for at least:
 *   checkout.session.completed, customer.subscription.created,
 *   customer.subscription.updated, customer.subscription.deleted,
 *   invoice.payment_failed, invoice.paid
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");

  if (!secret || !signature) {
    return NextResponse.json(
      { ok: false, message: "Webhook is not configured." },
      { status: 503 },
    );
  }

  const stripe = requireStripe();
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid signature";
    return NextResponse.json(
      { ok: false, message: `Signature check failed: ${message}` },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.subscription) {
          const subId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncSubscription(sub);
        }
        const uid = session.metadata?.uid || session.client_reference_id;
        const address = shippingAddressFrom(session);
        if (uid && address) {
          await updateShippingAddress(uid, address);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncSubscription(event.data.object);
        break;
      }

      case "subscription_schedule.released": {
        // A scheduled downgrade has taken effect; the subscription.updated
        // event carries the new price, so just clear the pending marker.
        const schedule = event.data.object;
        const subId =
          typeof schedule.subscription === "string"
            ? schedule.subscription
            : schedule.subscription?.id;
        if (subId) await setPendingTier(subId, null);
        break;
      }

      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice & {
          subscription?: string | Stripe.Subscription | null;
        };
        const subRef = invoice.subscription;
        const subId = typeof subRef === "string" ? subRef : subRef?.id;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncSubscription(sub);
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    // Return 500 so Stripe retries rather than dropping the event.
    console.error(`[stripe-webhook] ${event.type} failed`, err);
    return NextResponse.json(
      { ok: false, message: "Handler failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}

type ShippingDetails = {
  name?: string | null;
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
  } | null;
};

function shippingAddressFrom(
  session: Stripe.Checkout.Session,
): Address | null {
  // Stripe moved shipping_details under collected_information; support both.
  const loose = session as unknown as {
    collected_information?: { shipping_details?: ShippingDetails | null };
    shipping_details?: ShippingDetails | null;
  };
  const details =
    loose.collected_information?.shipping_details ?? loose.shipping_details ?? null;
  const address = details?.address;
  if (!address?.line1 || !address.city) return null;

  return {
    name: details?.name ?? session.customer_details?.name ?? "",
    line1: address.line1,
    line2: address.line2 ?? undefined,
    city: address.city,
    region: address.state ?? "",
    postalCode: address.postal_code ?? "",
    country: address.country ?? "US",
  };
}
