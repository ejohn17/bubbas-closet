import { TIERS, type Tier } from "@/lib/config";

/**
 * Tier <-> Stripe price mapping.
 *
 * Price ids live in env vars so the same code runs against Stripe test and
 * live mode. Pricing and item limits are product decisions and live in
 * `config.ts`; other cycle rules live in `rules.ts`.
 *
 * `STRIPE_PRICE_<TIER>_LEGACY` holds the price a tier used before the move to
 * 35-day cycles. Members still on it keep their tier and item limit until
 * `scripts/migrate-cycle-prices.mjs` moves them over at their next renewal;
 * new checkouts and tier changes only ever use the current price.
 */

const PRICE_ENV: Record<string, string> = {
  essential: "STRIPE_PRICE_ESSENTIAL",
  signature: "STRIPE_PRICE_SIGNATURE",
  premier: "STRIPE_PRICE_PREMIER",
};

function legacyPriceIdForTier(tierId: string): string | null {
  const envKey = PRICE_ENV[tierId];
  if (!envKey) return null;
  return process.env[`${envKey}_LEGACY`] || null;
}

export function getTier(tierId: string): Tier | null {
  return TIERS.find((t) => t.id === tierId) ?? null;
}

export function itemLimitFor(tierId: string): number {
  return getTier(tierId)?.items ?? 0;
}

export function priceIdForTier(tierId: string): string | null {
  const envKey = PRICE_ENV[tierId];
  if (!envKey) return null;
  return process.env[envKey] || null;
}

export function tierForPriceId(priceId: string): Tier | null {
  if (!priceId) return null;
  for (const tier of TIERS) {
    if (
      priceIdForTier(tier.id) === priceId ||
      legacyPriceIdForTier(tier.id) === priceId
    ) {
      return tier;
    }
  }
  return null;
}

/** Tiers that are fully wired up in Stripe — used to gate the signup UI. */
export function purchasableTiers(): Tier[] {
  return TIERS.filter((t) => Boolean(priceIdForTier(t.id)));
}

/**
 * Upgrades take effect immediately with proration; downgrades are scheduled
 * for the next cycle (decisions B.2).
 */
export function isUpgrade(fromTierId: string, toTierId: string): boolean {
  return itemLimitFor(toTierId) > itemLimitFor(fromTierId);
}
