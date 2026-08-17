import Stripe from "stripe";
import { DomainError } from "@/lib/db/base";

/**
 * Stripe client + helpers.
 *
 * Stripe is the source of truth for billing; Firestore holds a synced copy of
 * subscription state (written by the webhook) so page loads never wait on a
 * Stripe round trip.
 */

let cached: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe | null {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  cached = new Stripe(key, { typescript: true });
  return cached;
}

export function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) {
    throw new DomainError(
      "stripe_not_configured",
      "Payments aren't configured yet. Set STRIPE_SECRET_KEY.",
      503,
    );
  }
  return stripe;
}

export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

/**
 * Period boundaries moved from the subscription to its items in newer Stripe
 * API versions, so read whichever the account returns and fall back to a
 * month from now if neither is present.
 */
export function subscriptionPeriod(sub: Stripe.Subscription): {
  start: number;
  end: number;
} {
  const loose = sub as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };
  const item = sub.items?.data?.[0] as unknown as
    | { current_period_start?: number; current_period_end?: number }
    | undefined;

  const startSec =
    loose.current_period_start ?? item?.current_period_start ?? sub.start_date;
  const endSec =
    loose.current_period_end ??
    item?.current_period_end ??
    startSec + 30 * 24 * 60 * 60;

  return { start: startSec * 1000, end: endSec * 1000 };
}

export function customerIdOf(sub: Stripe.Subscription): string {
  return typeof sub.customer === "string" ? sub.customer : sub.customer.id;
}

export function priceIdOf(sub: Stripe.Subscription): string {
  return sub.items.data[0]?.price?.id ?? "";
}
