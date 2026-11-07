/**
 * Central brand + content config for the pre-launch landing page.
 * Edit copy, tiers, and steps here rather than in the components.
 * Tier pricing/limits mirror the confirmed plan: $49.99/10, $89.99/20, $149.99/40,
 * each charged once per cycle (RULES.cycleDays).
 */

import { RULES } from "@/lib/rules";

/** The membership cycle for copy, e.g. "35 days". Each cycle is one box. */
export const CYCLE_LABEL = `${RULES.cycleDays} days`;

export const BRAND = {
  name: "Bubbas Closet",
  tagline: "Dress them in something new every month",
  description:
    "Rent quality toddler clothes & accessories, swap your wardrobe monthly, we handle the laundry.",
  /** Second hero paragraph on the landing page. */
  howItFits:
    "Build a box full of your favourite items, then choose the membership that matches your picks (10, 20 or 40 items).",
  /** Small print under the hero. */
  heroFinePrint:
    "Skip or cancel anytime, no commitment required. Prepaid return shipping + packaging included.",
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
  price: number;
  items: number;
  /** One-line "who it's for" shown under the item count. */
  tagline: string;
  blurb: string;
  featured?: boolean;
};

export const TIERS: Tier[] = [
  {
    id: "essential",
    name: "Essential",
    price: 49.99,
    items: 10,
    tagline: "Perfect for 1 outfit a week + accessories.",
    blurb: "A great way to try out our brand!",
  },
  {
    id: "signature",
    name: "Signature",
    price: 89.99,
    items: 20,
    tagline: "A real working wardrobe.",
    blurb: "Room to mix occasion outfits with everyday staples.",
    featured: true,
  },
  {
    id: "premier",
    name: "Premier",
    price: 149.99,
    items: 40,
    tagline: "A full wardrobe restock each month.",
    blurb: "Room for everyday basics, accessories, seasonal, holiday & event picks.",
  },
];

/** Effective price per item at a full box, e.g. 89.99 / 20 → 4.5. */
export function pricePerItem(tier: Tier): number {
  return Math.round((tier.price / tier.items) * 100) / 100;
}

/**
 * How many pieces a visitor can hold before choosing a plan: as many as our
 * largest plan covers, so the box they build always maps onto a membership.
 */
export const PREVIEW_ITEM_LIMIT = Math.max(...TIERS.map((t) => t.items));

/**
 * The cheapest tier whose per-box allotment fits a box of `itemCount` pieces.
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

/** Whether a plan's per-box allotment can cover a box of this size. */
export function tierFitsBox(tier: Tier, itemCount: number): boolean {
  return itemCount <= 0 || tier.items >= itemCount;
}

export type Step = {
  title: string;
  body: string;
};

export const STEPS: Step[] = [
  {
    title: "Browse the closet",
    body: "Add whatever you like to your box. Looking is free, and each piece is held for you while you decide.",
  },
  {
    title: "Pick your membership",
    body: "Select the membership size you want to rent for the month: 10, 20 or 40 items.",
  },
  {
    title: "Wear, play, repeat",
    body: "Stains and spills are part of toddlerhood. We expect them.",
  },
  {
    title: "Send it back",
    body: `Toss everything in the return packaging and attach the prepaid return label we sent you. Add your tracking number and you can pick your next batch once your ${RULES.rentalDays} days are up.`,
  },
];
