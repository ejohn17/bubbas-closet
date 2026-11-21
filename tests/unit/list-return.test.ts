import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListPosition } from "@/lib/list-return";

type Store = typeof import("@/lib/list-return");
let store: Store;

// The store is module state; give each test a fresh copy.
beforeEach(async () => {
  vi.resetModules();
  store = await import("@/lib/list-return");
});

const position = (overrides: Partial<ListPosition> = {}): ListPosition => ({
  listUrl: "/portal",
  itemPath: "/portal/item/abc",
  linkIndex: 0,
  linkTop: 240,
  scrollY: 1800,
  ...overrides,
});

describe("returning to a list", () => {
  it("restores the list a link was followed from", () => {
    store.rememberListPosition(
      position({
        filters: {
          search: "",
          category: "Dresses",
          brand: "",
          tag: "",
          condition: "",
          size: "3T",
          inStockOnly: false,
        },
      }),
    );
    store.markReturningTo("/portal");

    expect(store.pendingListReturn("/portal")).toMatchObject({
      itemPath: "/portal/item/abc",
      linkTop: 240,
      filters: { category: "Dresses", size: "3T" },
    });
  });

  it("leaves a list at the top when nobody is heading back to it", () => {
    // e.g. opened a piece, then clicked "Browse" in the nav instead of back.
    store.rememberListPosition(position());

    expect(store.pendingListReturn("/portal")).toBeNull();
  });

  it("only restores once per return", () => {
    store.rememberListPosition(position());
    store.markReturningTo("/portal");
    store.clearListReturn();

    expect(store.pendingListReturn("/portal")).toBeNull();
  });

  it("treats the same path with different filters as a different list", () => {
    store.rememberListPosition(position({ listUrl: "/admin/orders?status=pending" }));
    store.markReturningTo("/admin/orders");

    expect(store.pendingListReturn("/admin/orders")).toBeNull();
  });

  it("keeps each list's spot, so going back two levels still lands right", () => {
    // Members → a filtered orders list → an order, then Back, Back.
    store.rememberListPosition(
      position({ listUrl: "/admin/members", itemPath: "/admin/orders?status=shipped", linkTop: 500 }),
    );
    store.rememberListPosition(
      position({ listUrl: "/admin/orders?status=shipped", itemPath: "/admin/orders/x1", linkTop: 120 }),
    );

    store.markReturningTo("/admin/orders?status=shipped");
    expect(store.pendingListReturn("/admin/orders?status=shipped")?.linkTop).toBe(120);
    store.clearListReturn();

    store.markReturningTo("/admin/members");
    expect(store.pendingListReturn("/admin/members")?.linkTop).toBe(500);
  });

  it("forgets a list that was left some other way", () => {
    store.rememberListPosition(position());
    store.forgetListPosition("/portal");
    store.markReturningTo("/portal");

    expect(store.pendingListReturn("/portal")).toBeNull();
  });
});

describe("the back link on a detail page", () => {
  it("knows the list it came from, only on that page", () => {
    store.rememberListPosition(
      position({ listUrl: "/admin/units?status=out", itemPath: "/admin/products/p1" }),
    );

    expect(store.listOpenedFrom("/admin/products/p1")).toBe("/admin/units?status=out");
    expect(store.listOpenedFrom("/admin/products/other")).toBeNull();
  });

  it("follows the most recent list, not the first", () => {
    store.rememberListPosition(position({ listUrl: "/admin/products", itemPath: "/admin/products/p1" }));
    store.rememberListPosition(position({ listUrl: "/admin/units", itemPath: "/admin/products/p1" }));

    expect(store.listOpenedFrom("/admin/products/p1")).toBe("/admin/units");
  });
});

describe("list URLs", () => {
  it("spell the same query the same way whichever API produced it", () => {
    const fromLocation = store.listUrlOf("/admin/orders", "?search=jane%20doe&status=shipped");
    const fromRouter = store.listUrlOf(
      "/admin/orders",
      new URLSearchParams({ search: "jane doe", status: "shipped" }).toString(),
    );

    expect(fromLocation).toBe(fromRouter);
    expect(store.listUrlOf("/admin/orders", "")).toBe("/admin/orders");
  });
});
