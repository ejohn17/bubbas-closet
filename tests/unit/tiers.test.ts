import { describe, expect, it, vi } from "vitest";
import {
  PREVIEW_ITEM_LIMIT,
  recommendTierFor,
  TIERS,
  tierFitsBox,
} from "@/lib/config";
import {
  getTier,
  isUpgrade,
  itemLimitFor,
  priceIdForTier,
  purchasableTiers,
  tierForPriceId,
} from "@/lib/tiers";

function tier(id: string) {
  const found = TIERS.find((t) => t.id === id);
  if (!found) throw new Error(`No tier ${id}`);
  return found;
}

describe("tier item limits", () => {
  it.each([
    ["essential", 10],
    ["signature", 20],
    ["premier", 40],
  ])("%s covers %i items", (tierId, items) => {
    expect(itemLimitFor(tierId)).toBe(items);
    expect(getTier(tierId)?.items).toBe(items);
  });

  it("gives an unknown tier no allowance", () => {
    expect(getTier("platinum")).toBeNull();
    expect(itemLimitFor("platinum")).toBe(0);
    expect(itemLimitFor("")).toBe(0);
  });

  it("caps a preview box at the largest plan", () => {
    expect(PREVIEW_ITEM_LIMIT).toBe(40);
    expect(PREVIEW_ITEM_LIMIT).toBe(Math.max(...TIERS.map((t) => t.items)));
  });
});

describe("recommendTierFor", () => {
  it.each([
    [1, "essential"],
    [10, "essential"],
    [11, "signature"],
    [20, "signature"],
    [21, "premier"],
    [40, "premier"],
  ])("a box of %i pieces fits %s", (count, tierId) => {
    expect(recommendTierFor(count)?.id).toBe(tierId);
  });

  it("has nothing to recommend for an empty box", () => {
    expect(recommendTierFor(0)).toBeNull();
    expect(recommendTierFor(-3)).toBeNull();
  });

  it("has nothing to recommend when the box is bigger than every plan", () => {
    expect(recommendTierFor(41)).toBeNull();
  });
});

describe("tierFitsBox", () => {
  it("allows a plan exactly at its limit and rejects one over it", () => {
    expect(tierFitsBox(tier("essential"), 10)).toBe(true);
    expect(tierFitsBox(tier("essential"), 11)).toBe(false);
    expect(tierFitsBox(tier("signature"), 11)).toBe(true);
  });

  it("treats an empty box as fitting any plan", () => {
    for (const t of TIERS) expect(tierFitsBox(t, 0)).toBe(true);
  });
});

describe("isUpgrade", () => {
  it("compares tiers by item allowance", () => {
    expect(isUpgrade("essential", "signature")).toBe(true);
    expect(isUpgrade("signature", "premier")).toBe(true);
    expect(isUpgrade("premier", "essential")).toBe(false);
    expect(isUpgrade("signature", "signature")).toBe(false);
  });

  it("treats moving off an unknown tier as an upgrade", () => {
    expect(isUpgrade("legacy", "essential")).toBe(true);
  });
});

describe("Stripe price mapping", () => {
  it("reads price ids from the environment, in both directions", () => {
    vi.stubEnv("STRIPE_PRICE_ESSENTIAL", "price_ess");
    vi.stubEnv("STRIPE_PRICE_SIGNATURE", "price_sig");
    vi.stubEnv("STRIPE_PRICE_PREMIER", "price_pre");

    expect(priceIdForTier("signature")).toBe("price_sig");
    expect(tierForPriceId("price_pre")?.id).toBe("premier");
    expect(tierForPriceId("price_unknown")).toBeNull();
    expect(priceIdForTier("platinum")).toBeNull();
  });

  it("keeps members on a legacy monthly price on their tier", () => {
    vi.stubEnv("STRIPE_PRICE_ESSENTIAL", "price_ess_35d");
    vi.stubEnv("STRIPE_PRICE_ESSENTIAL_LEGACY", "price_ess_month");
    vi.stubEnv("STRIPE_PRICE_SIGNATURE", "price_sig_35d");
    vi.stubEnv("STRIPE_PRICE_SIGNATURE_LEGACY", "");

    expect(tierForPriceId("price_ess_month")?.id).toBe("essential");
    expect(tierForPriceId("price_ess_35d")?.id).toBe("essential");
    // New checkouts and tier changes only ever use the current price.
    expect(priceIdForTier("essential")).toBe("price_ess_35d");
    expect(tierForPriceId("")).toBeNull();
  });

  it("only offers tiers that have a price configured", () => {
    vi.stubEnv("STRIPE_PRICE_ESSENTIAL", "price_ess");
    vi.stubEnv("STRIPE_PRICE_SIGNATURE", "");
    vi.stubEnv("STRIPE_PRICE_PREMIER", "price_pre");

    expect(purchasableTiers().map((t) => t.id)).toEqual(["essential", "premier"]);
    expect(priceIdForTier("signature")).toBeNull();
  });
});
