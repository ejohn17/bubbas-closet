import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogPosition } from "@/lib/catalog-return";

type Store = typeof import("@/lib/catalog-return");
let store: Store;

// The store is module state; give each test a fresh copy.
beforeEach(async () => {
  vi.resetModules();
  store = await import("@/lib/catalog-return");
});

const position = (overrides: Partial<CatalogPosition> = {}): CatalogPosition => ({
  listPath: "/portal",
  itemPath: "/portal/item/abc",
  itemId: "abc",
  filters: {
    search: "",
    category: "Dresses",
    brand: "",
    tag: "",
    condition: "",
    size: "3T",
    inStockOnly: false,
  },
  cardTop: 240,
  scrollY: 1800,
  ...overrides,
});

describe("returning to a catalogue list", () => {
  it("restores the list a piece was opened from", () => {
    store.rememberCatalogPosition(position());
    store.markReturningTo("/portal");

    expect(store.pendingCatalogReturn("/portal")).toMatchObject({
      itemId: "abc",
      filters: { category: "Dresses", size: "3T" },
    });
  });

  it("leaves a list at the top when nobody is heading back to it", () => {
    // e.g. opened a piece, then clicked "Browse" in the nav instead of back.
    store.rememberCatalogPosition(position());

    expect(store.pendingCatalogReturn("/portal")).toBeNull();
  });

  it("only restores once per return", () => {
    store.rememberCatalogPosition(position());
    store.markReturningTo("/portal");
    store.clearCatalogReturn();

    expect(store.pendingCatalogReturn("/portal")).toBeNull();
  });

  it("does not restore a different list", () => {
    store.rememberCatalogPosition(position({ listPath: "/portal/favorites" }));
    store.markReturningTo("/portal");

    expect(store.pendingCatalogReturn("/portal")).toBeNull();
  });

  it("knows which list a piece came from, only on that piece's page", () => {
    store.rememberCatalogPosition(position({ listPath: "/portal/favorites" }));

    expect(store.listOpenedFrom("/portal/item/abc")).toBe("/portal/favorites");
    expect(store.listOpenedFrom("/portal/item/other")).toBeNull();
  });
});
