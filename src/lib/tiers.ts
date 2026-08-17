import { TIERS, type Tier } from "@/lib/config";

/**
 * Tier <-> Stripe price mapping.
 *
 * Price ids live in env vars so the same code runs against Stripe test and
 * live mode. Item limits come from `config.ts` but can be overridden without a
 * code change via TIER_LIMITS (e.g. "essential:12,signature:24,premier:48").
 */

const PRICE_ENV: Record<string, string> = {
  essential: "STRIPE_PRICE_ESSENTIAL",
  signature: "STRIPE_PRICE_SIGNATURE",
  premier: "STRIPE_PRICE_PREMIER",
};

function limitOverrides(): Record<string, number> {
  const raw = process.env.TIER_LIMITS;
  if (!raw) return {};
  const out: Record<string, number> = {};
  for (const part of raw.split(",")) {
    const [id, value] = part.split(":");
    const limit = Number(value);
    if (id && Number.isFinite(limit) && limit > 0) out[id.trim()] = limit;
  }
  return out;
}

export function getTier(tierId: string): Tier | null {
  return TIERS.find((t) => t.id === tierId) ?? null;
}

export function itemLimitFor(tierId: string): number {
  const overrides = limitOverrides();
  if (overrides[tierId]) return overrides[tierId];
  return getTier(tierId)?.items ?? 0;
}

export function priceIdForTier(tierId: string): string | null {
  const envKey = PRICE_ENV[tierId];
  if (!envKey) return null;
  return process.env[envKey] || null;
}

export function tierForPriceId(priceId: string): Tier | null {
  for (const tier of TIERS) {
    if (priceIdForTier(tier.id) === priceId) return tier;
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
