import type Stripe from "stripe";
import { DomainError } from "@/lib/db/base";
import {
  getSubscription,
  upsertSubscription,
  setPendingTier,
} from "@/lib/db/subscriptions";
import {
  findUserByStripeCustomerId,
  getUser,
  setStripeCustomerId,
} from "@/lib/db/users";
import {
  getTier,
  isUpgrade,
  itemLimitFor,
  priceIdForTier,
  tierForPriceId,
} from "@/lib/tiers";
import type { SubscriptionStatus } from "@/lib/types";
import { RULES } from "@/lib/rules";
import {
  customerIdOf,
  priceIdOf,
  requireStripe,
  subscriptionPeriod,
} from "@/lib/stripe";

/** Billing operations shared by checkout, the webhook, and tier changes. */

/** Finds or creates the Stripe customer for a member, remembering the id. */
export async function ensureStripeCustomer(input: {
  uid: string;
  email: string | null;
  name?: string | null;
}): Promise<string> {
  const stripe = requireStripe();
  const profile = await getUser(input.uid);

  if (profile?.stripeCustomerId) {
    // Guard against a customer deleted in the Stripe dashboard.
    try {
      const existing = await stripe.customers.retrieve(profile.stripeCustomerId);
      if (!(existing as Stripe.DeletedCustomer).deleted) {
        return profile.stripeCustomerId;
      }
    } catch {
      // Fall through and create a fresh customer.
    }
  }

  const customer = await stripe.customers.create({
    email: input.email ?? undefined,
    name: input.name ?? undefined,
    metadata: { uid: input.uid },
  });

  await setStripeCustomerId(input.uid, customer.id);
  return customer.id;
}

/** Mirrors a Stripe subscription into Firestore. Idempotent. */
export async function syncSubscription(
  sub: Stripe.Subscription,
): Promise<void> {
  const stripeCustomerId = customerIdOf(sub);
  const metaUid = sub.metadata?.uid;
  const uid =
    metaUid || (await findUserByStripeCustomerId(stripeCustomerId))?.uid || null;

  if (!uid) {
    console.warn(
      `[billing] no member matched Stripe customer ${stripeCustomerId}; skipping sync`,
    );
    return;
  }

  const priceId = priceIdOf(sub);
  const tier = tierFor(priceId, sub.metadata?.tierId);
  const { start, end } = subscriptionPeriod(sub);

  await upsertSubscription({
    id: sub.id,
    uid,
    stripeCustomerId,
    status: sub.status as SubscriptionStatus,
    priceId,
    tierId: tier?.id ?? "unknown",
    itemLimit: tier ? itemLimitFor(tier.id) : 0,
    currentPeriodStart: start,
    currentPeriodEnd: end,
    cancelAtPeriodEnd: sub.cancel_at_period_end === true,
  });
}

/** Price id is authoritative; checkout metadata is the fallback. */
function tierFor(priceId: string, metadataTierId?: string) {
  return (
    tierForPriceId(priceId) ?? (metadataTierId ? getTier(metadataTierId) : null)
  );
}

/**
 * Applies a tier change per decisions B.2: upgrades take effect immediately
 * with proration, downgrades are scheduled for the start of the next cycle.
 */
export async function changeTier(input: {
  uid: string;
  subscriptionId: string;
  toTierId: string;
}): Promise<{ applied: "immediate" | "scheduled" }> {
  const stripe = requireStripe();
  const record = await getSubscription(input.subscriptionId);
  if (!record || record.uid !== input.uid) {
    throw new DomainError("subscription_not_found", "Membership not found.", 404);
  }
  if (record.tierId === input.toTierId) {
    throw new DomainError("same_tier", "You're already on that plan.");
  }

  const newPriceId = priceIdForTier(input.toTierId);
  if (!newPriceId) {
    throw new DomainError("tier_unavailable", "That plan isn't available yet.");
  }

  const sub = await stripe.subscriptions.retrieve(input.subscriptionId);
  const itemId = sub.items.data[0]?.id;
  if (!itemId) {
    throw new DomainError("subscription_invalid", "Membership has no billable item.");
  }

  if (isUpgrade(record.tierId, input.toTierId)) {
    const updated = await stripe.subscriptions.update(input.subscriptionId, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: "create_prorations",
      metadata: { ...sub.metadata, uid: input.uid, tierId: input.toTierId },
    });
    await syncSubscription(updated);
    await setPendingTier(input.subscriptionId, null);
    return { applied: "immediate" };
  }

  // Downgrade: keep the current price until the cycle ends, then switch.
  const schedule = await stripe.subscriptionSchedules.create({
    from_subscription: input.subscriptionId,
  });
  const currentPhase = schedule.phases[0];

  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    phases: [
      {
        items: [{ price: record.priceId, quantity: 1 }],
        start_date: currentPhase.start_date,
        end_date: currentPhase.end_date,
      },
      {
        items: [{ price: newPriceId, quantity: 1 }],
        metadata: { uid: input.uid, tierId: input.toTierId },
      },
    ],
  });

  await setPendingTier(input.subscriptionId, input.toTierId);
  return { applied: "scheduled" };
}

/** One-off late or damage fee charged to the member's saved payment method. */
export async function chargeFee(input: {
  stripeCustomerId: string;
  amountCents: number;
  description: string;
  metadata?: Record<string, string>;
}): Promise<{ invoiceId: string }> {
  const stripe = requireStripe();

  if (!Number.isFinite(input.amountCents) || input.amountCents < 50) {
    throw new DomainError("invalid_amount", "Fee must be at least $0.50.");
  }

  const invoice = await stripe.invoices.create({
    customer: input.stripeCustomerId,
    collection_method: "charge_automatically",
    auto_advance: true,
    description: input.description,
    metadata: input.metadata,
  });

  await stripe.invoiceItems.create({
    customer: input.stripeCustomerId,
    amount: Math.round(input.amountCents),
    currency: RULES.currency,
    description: input.description,
    invoice: invoice.id,
  });

  if (invoice.id) {
    await stripe.invoices.finalizeInvoice(invoice.id);
  }

  return { invoiceId: invoice.id ?? "" };
}
