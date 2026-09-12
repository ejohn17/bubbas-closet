import { ok, requireApiUser, toErrorResponse } from "@/lib/api";
import { DomainError } from "@/lib/db/base";
import { getPrimarySubscription } from "@/lib/db/subscriptions";
import { requireStripe, siteUrl } from "@/lib/stripe";

/**
 * Opens the Stripe Customer Portal for payment method updates, invoices, and
 * cancellation. Tier changes are handled in-app so our item limits stay in
 * step with the plan.
 */
export async function POST() {
  try {
    const user = await requireApiUser();
    const customerId =
      user.profile?.stripeCustomerId ??
      (await getPrimarySubscription(user.uid))?.stripeCustomerId;

    if (!customerId) {
      throw new DomainError(
        "no_customer",
        "There's no billing record for this account yet.",
      );
    }

    const stripe = requireStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteUrl()}/portal/account`,
    });

    return ok({ url: session.url });
  } catch (err) {
    return toErrorResponse(err);
  }
}
