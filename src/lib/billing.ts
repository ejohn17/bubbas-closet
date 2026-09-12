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
import {
  RULES,
  formatShippingCountries,
  isCountryAllowedForTier,
  shippingCountriesForTier,
} from "@/lib/rules";
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

  // Checkout stores the card on the subscription, not the customer's invoice
  // default — copy it so one-off shipping/fee invoices can charge automatically.
  const paymentMethodId = stripeId(sub.default_payment_method);
  if (paymentMethodId) {
    try {
      await requireStripe().customers.update(stripeCustomerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
    } catch (err) {
      console.warn("[billing] could not set default invoice payment method", err);
    }
  }
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

  const profile = await getUser(input.uid);
  if (
    profile?.shippingAddress?.line1 &&
    !isCountryAllowedForTier(profile.shippingAddress.country, input.toTierId)
  ) {
    const toTier = getTier(input.toTierId);
    const dest = formatShippingCountries(shippingCountriesForTier(input.toTierId));
    throw new DomainError(
      "address_not_allowed",
      `${toTier?.name ?? "That plan"} ships to ${dest} only. Update your shipping address before switching.`,
    );
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

function stripeId(
  value: string | { id: string } | null | undefined,
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/** Card Stripe will charge for a one-off invoice (shipping, late fees). */
export async function defaultCardId(
  stripeCustomerId: string,
): Promise<string | null> {
  const stripe = requireStripe();
  const customer = await stripe.customers.retrieve(stripeCustomerId);
  if ((customer as Stripe.DeletedCustomer).deleted) return null;

  const fromCustomer = stripeId(
    (customer as Stripe.Customer).invoice_settings?.default_payment_method,
  );
  if (fromCustomer) return fromCustomer;

  const subs = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: "all",
    limit: 10,
  });
  const rank = (status: string) => {
    const order = ["active", "trialing", "past_due"];
    const i = order.indexOf(status);
    return i === -1 ? 99 : i;
  };
  for (const sub of [...subs.data].sort((a, b) => rank(a.status) - rank(b.status))) {
    const fromSub = stripeId(sub.default_payment_method);
    if (fromSub) return fromSub;
  }

  const cards = await stripe.paymentMethods.list({
    customer: stripeCustomerId,
    type: "card",
    limit: 1,
  });
  return cards.data[0]?.id ?? null;
}

function rethrowStripe(err: unknown): never {
  if (err instanceof DomainError) throw err;
  if (err && typeof err === "object" && "raw" in err && "message" in err) {
    const stripeErr = err as { message: string; code?: string; statusCode?: number };
    throw new DomainError(
      stripeErr.code ?? "stripe_error",
      stripeErr.message || "Stripe could not collect this payment.",
      stripeErr.statusCode && stripeErr.statusCode < 500 ? stripeErr.statusCode : 400,
    );
  }
  throw err;
}

/** One-off late, damage, or shipping charge on the member's saved payment method. */
export async function chargeFee(input: {
  stripeCustomerId: string;
  amountCents: number;
  description: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}): Promise<{ invoiceId: string }> {
  const stripe = requireStripe();

  if (!Number.isFinite(input.amountCents) || input.amountCents < 50) {
    throw new DomainError("invalid_amount", "Fee must be at least $0.50.");
  }

  const paymentMethodId = await defaultCardId(input.stripeCustomerId);
  if (!paymentMethodId) {
    throw new DomainError(
      "no_payment_method",
      "This member has no card on file. Ask them to update billing in the customer portal.",
    );
  }

  const opts = (suffix: string) =>
    input.idempotencyKey
      ? { idempotencyKey: `${input.idempotencyKey}${suffix}` }
      : undefined;

  try {
    const created = await stripe.invoices.create(
      {
        customer: input.stripeCustomerId,
        currency: RULES.currency,
        collection_method: "charge_automatically",
        auto_advance: false,
        pending_invoice_items_behavior: "exclude",
        default_payment_method: paymentMethodId,
        description: input.description,
        metadata: input.metadata,
      },
      opts(""),
    );
    if (!created.id) {
      throw new DomainError("stripe_error", "Stripe did not create an invoice.");
    }

    const withLines = await stripe.invoices.addLines(
      created.id,
      {
        lines: [
          {
            amount: Math.round(input.amountCents),
            description: input.description,
          },
        ],
      },
      opts("-item"),
    );
    if ((withLines.amount_due ?? 0) < 50) {
      throw new DomainError(
        "invoice_empty",
        "Stripe created an invoice without the shipping line. Try again.",
      );
    }

    await stripe.invoices.finalizeInvoice(
      created.id,
      { auto_advance: false },
      opts("-finalize"),
    );

    const paid = await stripe.invoices.pay(
      created.id,
      { payment_method: paymentMethodId, off_session: true },
      opts("-pay"),
    );
    if (paid.status !== "paid") {
      throw new DomainError(
        "payment_incomplete",
        `Stripe did not collect payment (invoice ${paid.status ?? "unknown"}).`,
      );
    }

    return { invoiceId: paid.id };
  } catch (err) {
    rethrowStripe(err);
  }
}
