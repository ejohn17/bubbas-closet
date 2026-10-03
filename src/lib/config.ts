/**
 * Central brand + content config for the pre-launch landing page.
 * Edit copy, tiers, and steps here rather than in the components.
 * Tier pricing/limits mirror the confirmed plan: $49.99/10, $89.99/20, $149.99/40.
 */

export const BRAND = {
  name: "Bubbas Closet",
  tagline: "Rent a rotating children's wardrobe, monthly",
  description:
    "A subscription clothing rental for kids. Browse the closet, build a box of pieces that fit, then choose a monthly membership that covers what you picked.",
  // Placeholder — swap for the real launch email once available.
  contactEmail: "hello@mybubbascloset.ca",
};

/** Closet size range shown on the landing and subscribe pages. */
export const SIZE_RANGE = {
  label: "0M–3T",
  min: "0 months",
  max: "3T",
};

export type Tier = {
  id: string;
  name: string;
  priceMonthly: number;
  items: number;
  blurb: string;
  featured?: boolean;
};

export const TIERS: Tier[] = [
  {
    id: "essential",
    name: "Essential",
    priceMonthly: 49.99,
    items: 10,
    blurb: "A curated capsule to refresh their everyday looks.",
  },
  {
    id: "signature",
    name: "Signature",
    priceMonthly: 89.99,
    items: 20,
    blurb: "Room to mix occasion outfits with the everyday staples.",
    featured: true,
  },
  {
    id: "premier",
    name: "Premier",
    priceMonthly: 149.99,
    items: 40,
    blurb: "A full rotating kids' closet for families who love variety.",
  },
];

/**
 * How many pieces a visitor can hold before choosing a plan: as many as our
 * largest plan covers, so the box they build always maps onto a membership.
 */
export const PREVIEW_ITEM_LIMIT = Math.max(...TIERS.map((t) => t.items));

/**
 * The cheapest tier whose monthly allotment fits a box of `itemCount` pieces.
 * Null for an empty box (nothing to size against) or a box larger than any plan.
 */
export function recommendTierFor(itemCount: number): Tier | null {
  if (itemCount <= 0) return null;
  return (
    [...TIERS]
      .sort((a, b) => a.items - b.items)
      .find((tier) => tier.items >= itemCount) ?? null
  );
}

/** Whether a plan's monthly allotment can cover a box of this size. */
export function tierFitsBox(tier: Tier, itemCount: number): boolean {
  return itemCount <= 0 || tier.items >= itemCount;
}

export type Step = {
  title: string;
  body: string;
};

export const STEPS: Step[] = [
  {
    title: "Build your box",
    body: "Browse the whole closet before you pay. Create a free account and add the children's pieces you love — each one is held for you while you decide.",
  },
  {
    title: "Pick the plan that fits",
    body: "We suggest the membership that covers everything in your box. Subscribe and your box is ready to confirm.",
  },
  {
    title: "Wear it all month",
    body: "Your pieces ship to you. Premier includes outbound shipping; other plans are billed the label cost. Return labels are always on us.",
  },
  {
    title: "Send back & swap",
    body: "Return everything with the prepaid label and choose a fresh set for the next month.",
  },
];
