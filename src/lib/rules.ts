import { formatCadCompact } from "@/lib/format";
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
  /**
   * Length of a membership cycle. Stripe prices recur every `cycleDays` days
   * (interval "day"), so send-out and return dates line up the same way each
   * cycle instead of drifting with month lengths. Stripe's period dates stay
   * authoritative; this is the fallback and the number shown in copy (C.11).
   */
  cycleDays: 35,

  /**
   * Days a box is rented for, counted from the start of the billing cycle.
   * Garments are due back on this day with no extra grace; the remaining
   * `cycleDays - rentalDays` days before renewal are the return window. In
   * that window a member who has sent their box back can confirm the next one
   * early, and its rental days start at renewal (C.4).
   */
  rentalDays: 30,

  /** How long a garment stays reserved while a member builds their box (C.1). */
  holdTtlMinutes: 20,

  /** Days past the due date before a late fee may be charged (C.10). */
  lateFeeAfterDays: 7,

  /** One-time late fee cap per overdue garment, in cents (C.10). */
  lateFeeCents: 500,

  /** Replacement charge when a garment is damaged beyond repair or lost (C.10). */
  replacementFeeCents: 1000,

  /** Days before the due date that a return reminder goes out. */
  reminderDaysBefore: 3,

  /**
   * Currency for one-off charges: outbound shipping, late fees, and
   * replacement fees. We operate from Canada, so these are CAD whatever the
   * destination. Subscription prices carry their own currency in Stripe.
   */
  currency: "cad",

  /**
   * Countries we ship to at all. ISO 3166-1 alpha-2, as Stripe's
   * shipping_address_collection requires. Per-tier subsets come from
   * shippingCountriesForTier() — US is Signature and Premier only (C.7).
   */
  shippingCountries: ["US", "CA"] as const,

  /** Tiers that may ship to the United States. Everyone else is Canada-only. */
  usShippingTiers: ["signature", "premier"] as const,

  /**
   * Tiers that are not billed for outbound shipping. Everyone else pays when
   * admin marks the box shipped (C.8): the flat rate below where there is one,
   * otherwise the label cost. Return labels are always on us, emailed by admin
   * with a prepaid label attached.
   */
  freeOutboundShippingTiers: ["premier"] as const,

  /**
   * Flat outbound shipping by destination, in CAD cents. A box to one of these
   * countries costs this whatever is in it, so the member knows the amount
   * when they confirm and admin doesn't type it at ship time. Destinations
   * not listed are billed the label cost. Client request 2026-11-18 (C.8).
   */
  flatOutboundShippingCents: { CA: 2500 } as FlatRates,

  /**
   * Estimated outbound postage for destinations billed at the label cost,
   * using item count as a stand-in for package weight — the same idea as
   * Shopify shipping zones + weight brackets. Shown on confirmed orders until
   * the real label is billed (C.9). Amounts are CAD cents and defaults
   * pending typical-label confirmation.
   */
  outboundShippingEstimateBrackets: {
    US: [
      { maxItems: 10, cents: 2200 },
      { maxItems: 20, cents: 3200 },
      { maxItems: 40, cents: 4800 },
    ],
  } as EstimateBrackets,

  /**
   * Conditions a member can rent. Anything outside this list is withheld from
   * the catalogue, and a garment that comes back in one of those conditions is
   * retired rather than cleaned and re-listed (C.6).
   */
  rentableConditions: ["new", "excellent", "good"] as UnitCondition[],
} as const;

/**
 * Stripe won't charge less than this in CAD, so a garment's purchase price
 * can't be set lower: a member may buy a single piece on its own.
 */
export const MIN_PURCHASE_PRICE_CENTS = 50;

/** A style is for sale once admin has given it a chargeable purchase price. */
export function isForSale(product: {
  purchasePriceCents?: number | null;
}): product is { purchasePriceCents: number } {
  return (
    typeof product.purchasePriceCents === "number" &&
    product.purchasePriceCents >= MIN_PURCHASE_PRICE_CENTS
  );
}

export type ShippingCountry = (typeof RULES.shippingCountries)[number];

/** Spelled out because RULES can't refer to its own type. */
type FlatRates = Partial<Record<"US" | "CA", number>>;
type EstimateBrackets = Partial<Record<"US" | "CA", ShippingEstimateBracket[]>>;

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

/** How outbound shipping to one destination is charged on a given plan. */
export type OutboundShippingRate =
  | { kind: "included" }
  | { kind: "flat"; cents: number; country: ShippingCountry }
  | { kind: "label"; country: ShippingCountry };

/**
 * Included on Premier; otherwise the destination's flat rate, or the label
 * cost where it has none. A missing country is treated as Canada, the same
 * default the estimate has always used; confirm requires an address anyway.
 */
export function outboundShippingRate(input: {
  tierId?: string | null;
  country?: string | null;
}): OutboundShippingRate {
  if (outboundShippingIsFree(input.tierId)) return { kind: "included" };
  const country = normalizeShippingCountry(input.country) ?? "CA";
  const cents = RULES.flatOutboundShippingCents[country];
  return cents === undefined
    ? { kind: "label", country }
    : { kind: "flat", cents, country };
}

/** The flat amount to charge at ship time, or null if admin enters the label cost. */
export function flatOutboundShippingCents(input: {
  tierId?: string | null;
  country?: string | null;
}): number | null {
  const rate = outboundShippingRate(input);
  return rate.kind === "flat" ? rate.cents : null;
}

/** Flat-rate destinations first, which reads better in copy. */
function byFlatFirst(countries: readonly ShippingCountry[]): ShippingCountry[] {
  const flat = (c: ShippingCountry) =>
    RULES.flatOutboundShippingCents[c] === undefined ? 1 : 0;
  return [...countries].sort((a, b) => flat(a) - flat(b));
}

/**
 * How outbound shipping is charged across some destinations, e.g. "a flat
 * $25 CAD within Canada and the label cost to the United States".
 */
export function describeOutboundRates(
  countries: readonly ShippingCountry[],
): string {
  const parts = byFlatFirst(countries).map((country) => {
    const cents = RULES.flatOutboundShippingCents[country];
    const place = formatShippingCountries([country]);
    return cents === undefined
      ? `the label cost to ${place}`
      : `a flat ${formatCadCompact(cents)} within ${place}`;
  });
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Short member-facing line for how outbound vs return shipping is billed. */
export function shippingCostNote(tierId?: string | null): string {
  if (outboundShippingIsFree(tierId)) {
    return "Outbound shipping is included. Return labels are always on us.";
  }
  return `Outbound shipping is ${describeOutboundRates(shippingCountriesForTier(tierId))}, charged when your box ships. Return labels are always on us.`;
}

const SHORT_COUNTRY: Record<ShippingCountry, string> = {
  CA: "Canada",
  US: "the US",
};

/** One-line label for tier cards, e.g. "Outbound shipping $25 CAD flat". */
export function outboundShippingShortNote(tierId: string): string {
  if (outboundShippingIsFree(tierId)) return "Outbound shipping included";

  const countries = byFlatFirst(shippingCountriesForTier(tierId));
  const several = countries.length > 1;
  const parts = countries.map((country) => {
    const cents = RULES.flatOutboundShippingCents[country];
    return cents === undefined
      ? `at cost${several ? ` to ${SHORT_COUNTRY[country]}` : ""}`
      : `${formatCadCompact(cents)} flat${several ? ` in ${SHORT_COUNTRY[country]}` : ""}`;
  });
  return `Outbound shipping ${parts.join(", ")}`;
}

export type ShippingEstimateBracket = {
  maxItems: number;
  cents: number;
};

/**
 * What outbound shipping will cost for a box, before it ships: the flat rate
 * where the destination has one, otherwise a postage estimate from the piece
 * count. Stored on the pick at confirm time.
 */
export function estimateOutboundShippingCents(input: {
  tierId?: string | null;
  country?: string | null;
  itemCount: number;
}): number {
  if (input.itemCount <= 0) return 0;

  const rate = outboundShippingRate(input);
  if (rate.kind === "included") return 0;
  if (rate.kind === "flat") return rate.cents;

  const brackets = RULES.outboundShippingEstimateBrackets[rate.country] ?? [];
  const match =
    brackets.find((bracket) => input.itemCount <= bracket.maxItems) ??
    brackets[brackets.length - 1];
  return match?.cents ?? 0;
}

export type OutboundShippingKind = "included" | "flat" | "estimated" | "charged";

export type OutboundShippingSummary = {
  kind: OutboundShippingKind;
  cents: number;
};

/**
 * What to show for outbound shipping on an order: included (Premier), the
 * amount billed at ship time, or before that the flat rate or an estimate.
 * The flat rate is read from the current rules rather than the stored
 * estimate, so a box confirmed before the rate changed shows what it will be
 * charged. Older picks without a stored estimate are computed from the table.
 */
export function outboundShippingSummary(pick: {
  tierId: string;
  status: string;
  shippingCents?: number;
  estimatedShippingCents?: number;
  shippingAddress?: { country?: string } | null;
  items: { unitId: string }[];
}): OutboundShippingSummary {
  if (outboundShippingIsFree(pick.tierId)) {
    return { kind: "included", cents: 0 };
  }

  const billed =
    pick.status !== "pending" &&
    pick.status !== "cancelled" &&
    typeof pick.shippingCents === "number";
  if (billed) {
    return { kind: "charged", cents: pick.shippingCents ?? 0 };
  }

  const flat = flatOutboundShippingCents({
    tierId: pick.tierId,
    country: pick.shippingAddress?.country,
  });
  if (flat !== null) return { kind: "flat", cents: flat };

  const estimated =
    typeof pick.estimatedShippingCents === "number"
      ? pick.estimatedShippingCents
      : estimateOutboundShippingCents({
          tierId: pick.tierId,
          country: pick.shippingAddress?.country,
          itemCount: pick.items.length,
        });
  return { kind: "estimated", cents: estimated };
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
