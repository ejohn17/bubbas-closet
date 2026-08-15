/**
 * Central brand + content config for the pre-launch landing page.
 * Edit copy, tiers, and steps here rather than in the components.
 * Tier pricing/limits mirror the confirmed plan: $50/10, $90/20, $150/40.
 */

export const BRAND = {
  name: "Bubbas Closet",
  tagline: "Rent a rotating wardrobe, monthly",
  description:
    "A tiered subscription clothing rental. Pick a monthly membership, choose your pieces, wear them, and swap for something new next month.",
  // Placeholder — swap for the real launch email once available.
  contactEmail: "hello@bubbascloset.com",
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
    priceMonthly: 50,
    items: 10,
    blurb: "A curated capsule to refresh the everyday.",
  },
  {
    id: "signature",
    name: "Signature",
    priceMonthly: 90,
    items: 20,
    blurb: "Room to mix occasion pieces with the staples.",
    featured: true,
  },
  {
    id: "premier",
    name: "Premier",
    priceMonthly: 150,
    items: 40,
    blurb: "A full rotating wardrobe for those who love variety.",
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
    body: "Browse the members-only portal and add pieces to your box, up to your tier's monthly item count.",
  },
  {
    title: "Wear it all month",
    body: "Your pieces ship to you. Enjoy them for the month with shipping included both ways.",
  },
  {
    title: "Send back & swap",
    body: "Return everything with the prepaid label and choose a fresh set for the next month.",
  },
];
