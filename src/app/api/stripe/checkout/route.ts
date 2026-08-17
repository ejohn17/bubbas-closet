import { ok, readJson, requireApiUser, toErrorResponse } from "@/lib/api";
import { DomainError } from "@/lib/db/base";
import { getEntitlement } from "@/lib/db/subscriptions";
import { ensureStripeCustomer } from "@/lib/billing";
import { requireStripe, siteUrl } from "@/lib/stripe";
import { priceIdForTier } from "@/lib/tiers";

/** Starts a Stripe Checkout session for a membership tier. */
export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const { tierId } = await readJson<{ tierId: string }>(request);

    if (!tierId) {
      throw new DomainError("missing_tier", "Choose a membership first.");
    }
    const priceId = priceIdForTier(tierId);
    if (!priceId) {
      throw new DomainError(
        "tier_unavailable",
        "That membership isn't set up in Stripe yet.",
      );
    }

    const { entitled } = await getEntitlement(user.uid);
    if (entitled) {
      throw new DomainError(
        "already_subscribed",
        "You already have an active membership. Change your plan from your account instead.",
      );
    }

    const stripe = requireStripe();
    const customerId = await ensureStripeCustomer({
      uid: user.uid,
      email: user.email,
      name: user.name,
    });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.uid,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      // Shipping is included both ways, so collect the address at signup.
      shipping_address_collection: {
        allowed_countries: ["US"],
      },
      subscription_data: {
        metadata: { uid: user.uid, tierId },
      },
      metadata: { uid: user.uid, tierId },
      success_url: `${siteUrl()}/portal?welcome=1`,
      cancel_url: `${siteUrl()}/subscribe?cancelled=1`,
    });

    if (!session.url) {
      throw new DomainError("checkout_failed", "Could not start checkout.", 502);
    }

    return ok({ url: session.url });
  } catch (err) {
    return toErrorResponse(err);
  }
}
