import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { completeCheckoutSession, syncSubscription } from "@/lib/billing";
import { setPendingTier } from "@/lib/db/subscriptions";
import { requireStripe } from "@/lib/stripe";

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
        // The /subscribe/complete return page runs the same sync so the member
        // isn't waiting on webhook delivery; both paths are idempotent.
        await completeCheckoutSession(event.data.object);
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
