import type { UnitCondition } from "@/lib/types";

/**
 * Business rules for the rental cycle, in one place.
 *
 * These were environment variables; they're constants now because they're
 * product decisions rather than deployment settings, and having them in two
 * places let the code and the wiki drift apart. Changing one is a code edit and
 * a deploy, which is the right friction for a rule that affects members mid-cycle.
 *
 * Item limits per tier live alongside pricing in config.ts.
 * See wiki/decisions.md § C.
 */
export const RULES = {
  /** How long a garment stays reserved while a member builds their box (C.1). */
  holdTtlMinutes: 20,

  /** Days after the cycle ends before a return counts as overdue (C.4). */
  returnGraceDays: 3,

  /** Days before the due date that a return reminder goes out. */
  reminderDaysBefore: 3,

  /** Currency for subscriptions and one-off fees. */
  currency: "usd",

  /**
   * Countries we ship to at all. ISO 3166-1 alpha-2, as Stripe's
   * shipping_address_collection requires. Per-tier subsets come from
   * shippingCountriesForTier() — US is Signature and Premier only (C.7).
   */
  shippingCountries: ["US", "CA"] as const,

  /** Tiers that may ship to the United States. Everyone else is Canada-only. */
  usShippingTiers: ["signature", "premier"] as const,

  /**
   * Tiers that are not billed for outbound shipping. Everyone else pays the
   * label cost when admin marks the box shipped (C.8). Return labels are
   * always on us, emailed by admin with a prepaid label attached.
   */
  freeOutboundShippingTiers: ["premier"] as const,

  /**
   * Conditions a member can rent. Anything outside this list is withheld from
   * the catalogue, and a garment that comes back in one of those conditions is
   * retired rather than cleaned and re-listed (C.6).
   */
  rentableConditions: ["new", "excellent", "good"] as UnitCondition[],
} as const;

export type ShippingCountry = (typeof RULES.shippingCountries)[number];

export const SHIPPING_COUNTRY_LABELS: Record<ShippingCountry, string> = {
  US: "United States",
  CA: "Canada",
};

const SHIPPING_COUNTRY_ALIASES: Record<string, ShippingCountry> = {
  USA: "US",
  "UNITED STATES": "US",
  "UNITED STATES OF AMERICA": "US",
  CANADA: "CA",
};

export function isShippingCountry(value: string): value is ShippingCountry {
  return (RULES.shippingCountries as readonly string[]).includes(value);
}

/** Normalizes a country string to US/CA, or null if we don't ship there. */
export function normalizeShippingCountry(
  value: string | null | undefined,
): ShippingCountry | null {
  const code = value?.trim().toUpperCase();
  if (!code) return null;
  if (isShippingCountry(code)) return code;
  return SHIPPING_COUNTRY_ALIASES[code] ?? null;
}

/** Countries a given membership may ship to. Unknown / Essential → Canada only. */
export function shippingCountriesForTier(
  tierId: string | null | undefined,
): ShippingCountry[] {
  if (
    tierId &&
    (RULES.usShippingTiers as readonly string[]).includes(tierId)
  ) {
    return [...RULES.shippingCountries];
  }
  return ["CA"];
}

export function defaultShippingCountry(
  tierId: string | null | undefined,
): ShippingCountry {
  return shippingCountriesForTier(tierId)[0] ?? "CA";
}

export function isCountryAllowedForTier(
  country: string | null | undefined,
  tierId: string | null | undefined,
): boolean {
  const normalized = normalizeShippingCountry(country);
  return Boolean(
    normalized && shippingCountriesForTier(tierId).includes(normalized),
  );
}

export function resolveShippingCountry(
  country: string | null | undefined,
  tierId: string | null | undefined,
): ShippingCountry {
  const normalized = normalizeShippingCountry(country);
  const allowed = shippingCountriesForTier(tierId);
  if (normalized && allowed.includes(normalized)) return normalized;
  return allowed[0] ?? "CA";
}

export function formatShippingCountries(
  countries: readonly ShippingCountry[],
): string {
  const names = countries.map((code) =>
    code === "US" ? "the United States" : SHIPPING_COUNTRY_LABELS[code],
  );
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function shippingNoteForTier(tierId: string): string {
  const countries = shippingCountriesForTier(tierId);
  const label = formatShippingCountries(countries);
  return countries.length === 1 ? `Ships to ${label} only` : `Ships to ${label}`;
}

export function unsupportedCountryMessage(
  tierId: string | null | undefined,
): string {
  const label = formatShippingCountries(shippingCountriesForTier(tierId));
  if (isCountryAllowedForTier("US", tierId)) {
    return `We currently ship to ${label}.`;
  }
  return `This plan ships to ${label} only. Signature and Premier can ship to the United States.`;
}

/** Premier includes outbound shipping; Essential and Signature pay the label cost. */
export function outboundShippingIsFree(
  tierId: string | null | undefined,
): boolean {
  return Boolean(
    tierId &&
      (RULES.freeOutboundShippingTiers as readonly string[]).includes(tierId),
  );
}

/** Short member-facing line for how outbound vs return shipping is billed. */
export function shippingCostNote(tierId?: string | null): string {
  if (outboundShippingIsFree(tierId)) {
    return "Outbound shipping is included. Return labels are always on us.";
  }
  return "Outbound shipping is billed at the label cost when your box ships. Return labels are always on us.";
}

/** One-line label for tier cards. */
export function outboundShippingShortNote(tierId: string): string {
  return outboundShippingIsFree(tierId)
    ? "Outbound shipping included"
    : "Outbound shipping billed at cost";
}

/** Ordered best to worst, for picking the best available garment to advertise. */
export const CONDITION_ORDER: UnitCondition[] = [
  "new",
  "excellent",
  "good",
  "fair",
];

export function isRentableCondition(condition: UnitCondition): boolean {
  return RULES.rentableConditions.includes(condition);
}

/** Member-facing label, e.g. "Excellent condition". */
export function conditionLabel(condition: UnitCondition): string {
  const labels: Record<UnitCondition, string> = {
    new: "New with tags",
    excellent: "Excellent condition",
    good: "Good condition",
    fair: "Fair condition",
  };
  return labels[condition];
}

/** Short labels for admin controls, flagging the ones that retire a garment. */
export function conditionAdminLabel(condition: UnitCondition): string {
  const base: Record<UnitCondition, string> = {
    new: "New with tags",
    excellent: "Excellent",
    good: "Good",
    fair: "Fair",
  };
  return isRentableCondition(condition)
    ? base[condition]
    : `${base[condition]} — retires garment`;
}

/** Returns the better of two conditions. */
export function bestCondition(
  a: UnitCondition,
  b: UnitCondition,
): UnitCondition {
  return CONDITION_ORDER.indexOf(a) <= CONDITION_ORDER.indexOf(b) ? a : b;
}
