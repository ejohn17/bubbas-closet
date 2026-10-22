import type {
  HoldDoc,
  PickDoc,
  ProductDoc,
  SubscriptionDoc,
  UnitDoc,
} from "@/lib/types";
import { fakeDb } from "./fake-firestore";

/** Fixed clock for every test: 2026-03-01T12:00:00Z. */
export const NOW = Date.UTC(2026, 2, 1, 12, 0, 0);
export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;

export function seedProduct(
  id = "romper",
  overrides: Partial<ProductDoc> = {},
): ProductDoc {
  const doc: ProductDoc = {
    id,
    title: `Product ${id}`,
    description: "",
    tags: [],
    images: [`https://img.test/${id}.jpg`],
    sizes: ["6M"],
    active: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
  fakeDb.seed("products", id, doc);
  return doc;
}

export function seedUnit(id: string, overrides: Partial<UnitDoc> = {}): UnitDoc {
  const productId = overrides.productId ?? "romper";
  const doc: UnitDoc = {
    id,
    productId,
    productTitle: `Product ${productId}`,
    size: "6M",
    sku: `SKU-${id}`,
    condition: "excellent",
    status: "available",
    holderUid: null,
    holdId: null,
    holdExpiresAt: null,
    pickId: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
  fakeDb.seed("units", id, doc);
  return doc;
}

/**
 * A live hold plus the reserved unit backing it, as `addToBox` would leave
 * them. Each hold gets its own product so the one-per-style rule never trips.
 */
export function seedHeldUnit(
  uid: string,
  holdId: string,
  overrides: { expiresAt?: number; createdAt?: number } = {},
): { hold: HoldDoc; unit: UnitDoc } {
  const productId = `product-${holdId}`;
  const expiresAt = overrides.expiresAt ?? NOW + 10 * MINUTE;
  seedProduct(productId);
  const unit = seedUnit(`unit-${holdId}`, {
    productId,
    status: "reserved",
    holderUid: uid,
    holdId,
    holdExpiresAt: expiresAt,
  });
  const hold: HoldDoc = {
    id: holdId,
    uid,
    unitId: unit.id,
    productId,
    productTitle: unit.productTitle,
    size: unit.size,
    condition: unit.condition,
    image: `https://img.test/${productId}.jpg`,
    createdAt: overrides.createdAt ?? NOW - MINUTE,
    expiresAt,
  };
  fakeDb.seed("holds", holdId, hold);
  return { hold, unit };
}

export function seedSubscription(
  overrides: Partial<SubscriptionDoc> & Pick<SubscriptionDoc, "id" | "uid">,
): SubscriptionDoc {
  const doc: SubscriptionDoc = {
    stripeCustomerId: "cus_test",
    status: "active",
    priceId: "price_essential",
    tierId: "essential",
    itemLimit: 10,
    currentPeriodStart: NOW - DAY,
    currentPeriodEnd: NOW + 29 * DAY,
    cancelAtPeriodEnd: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
  fakeDb.seed("subscriptions", doc.id, doc);
  return doc;
}

export function seedPick(overrides: Partial<PickDoc> & Pick<PickDoc, "id">): PickDoc {
  const doc: PickDoc = {
    uid: "member",
    email: "member@example.com",
    cycleKey: "sub_1-0",
    tierId: "essential",
    itemLimit: 10,
    items: [],
    status: "pending",
    createdAt: NOW,
    ...overrides,
  };
  fakeDb.seed("picks", doc.id, doc);
  return doc;
}

export function units(): UnitDoc[] {
  return fakeDb.all<UnitDoc>("units");
}

export function holds(): HoldDoc[] {
  return fakeDb.all<HoldDoc>("holds");
}
