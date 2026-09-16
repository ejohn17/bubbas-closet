/**
 * Central brand + content config for the pre-launch landing page.
 * Edit copy, tiers, and steps here rather than in the components.
 * Tier pricing/limits mirror the confirmed plan: $49.99/10, $89.99/20, $149.99/40.
 */

export const BRAND = {
  name: "Bubbas Closet",
  tagline: "Rent a rotating children's wardrobe, monthly",
  description:
    "A subscription clothing rental for kids. Pick a monthly membership, choose pieces that fit, wear them, and swap for something new next month.",
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

export type Step = {
  title: string;
  body: string;
};

export const STEPS: Step[] = [
  {
    title: "Choose your tier",
    body: "Pick the monthly membership that fits your budget and how much you like to switch things up.",
  },
  {
    title: "Build your box",
    body: "Browse the members-only closet and add children's pieces to your box, up to your tier's monthly item count.",
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
