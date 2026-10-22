import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "./support/fake-firestore";
import {
  DAY,
  holds,
  MINUTE,
  NOW,
  seedHeldUnit,
  seedPick,
  seedUnit,
} from "./support/fixtures";
import {
  cancelPick,
  confirmBox,
  isOverdue,
  markReturned,
  outstandingItems,
} from "@/lib/db/picks";
import { DomainError } from "@/lib/db/base";
import type { Address, PickDoc, PickItem, UnitDoc } from "@/lib/types";

vi.mock("@/lib/firebase-admin", async () => {
  const { firebaseAdminMock } = await import("./support/fake-firestore");
  return firebaseAdminMock;
});

const UID = "member";
const CYCLE = "sub_1-1000";
const ADDRESS: Address = {
  name: "Test Parent",
  line1: "1 Main St",
  city: "Toronto",
  region: "ON",
  postalCode: "M5V 1A1",
  country: "CA",
};

beforeEach(() => {
  fakeDb.reset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function unit(id: string): UnitDoc {
  const doc = fakeDb.read<UnitDoc>("units", id);
  if (!doc) throw new Error(`unit ${id} missing`);
  return doc;
}

function pick(id: string): PickDoc {
  const doc = fakeDb.read<PickDoc>("picks", id);
  if (!doc) throw new Error(`pick ${id} missing`);
  return doc;
}

async function expectDomainError(promise: Promise<unknown>, code: string) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(DomainError);
  expect((err as DomainError).code).toBe(code);
}

function confirm(overrides: Partial<Parameters<typeof confirmBox>[0]> = {}) {
  return confirmBox({
    uid: UID,
    email: "member@example.com",
    cycleKey: CYCLE,
    tierId: "essential",
    itemLimit: 10,
    shippingAddress: ADDRESS,
    dueAt: NOW + 30 * DAY,
    ...overrides,
  });
}

function item(unitId: string, overrides: Partial<PickItem> = {}): PickItem {
  return {
    unitId,
    productId: "romper",
    productTitle: "Romper",
    size: "6M",
    returnedAt: null,
    returnCondition: null,
    ...overrides,
  };
}

describe("confirmBox", () => {
  it("turns live holds into a pending pick and moves every unit out", async () => {
    const a = seedHeldUnit(UID, "a", { createdAt: NOW - 2 * MINUTE });
    const b = seedHeldUnit(UID, "b", { createdAt: NOW - MINUTE });

    const created = await confirm();

    expect(created).toMatchObject({
      uid: UID,
      cycleKey: CYCLE,
      tierId: "essential",
      itemLimit: 10,
      status: "pending",
      shippingAddress: ADDRESS,
      dueAt: NOW + 30 * DAY,
      createdAt: NOW,
    });
    expect(created.items.map((i) => i.unitId)).toEqual([a.unit.id, b.unit.id]);
    expect(created.items[0]).toMatchObject({ sku: a.unit.sku, condition: "excellent", returnedAt: null });
    expect(created.estimatedShippingCents).toBe(1400);

    expect(pick(created.id).status).toBe("pending");
    expect(holds()).toHaveLength(0);
    for (const { unit: u } of [a, b]) {
      expect(unit(u.id)).toMatchObject({
        status: "out",
        holderUid: UID,
        holdId: null,
        holdExpiresAt: null,
        pickId: created.id,
      });
    }
  });

  it("enforces the tier limit at confirm time, e.g. a preview box bigger than the plan bought", async () => {
    seedHeldUnit(UID, "a");
    seedHeldUnit(UID, "b");
    seedHeldUnit(UID, "c");

    await expectDomainError(confirm({ itemLimit: 2 }), "limit_reached");

    expect(fakeDb.all("picks")).toHaveLength(0);
    expect(holds()).toHaveLength(3);
    expect(unit("unit-a").status).toBe("reserved");
  });

  it("confirms a box exactly at the limit", async () => {
    seedHeldUnit(UID, "a");
    seedHeldUnit(UID, "b");

    await expect(confirm({ itemLimit: 2 })).resolves.toMatchObject({ status: "pending" });
  });

  it("refuses an empty box, ignoring expired holds", async () => {
    seedHeldUnit(UID, "stale", { expiresAt: NOW - 1 });

    await expectDomainError(confirm(), "empty_box");
    expect(unit("unit-stale").status).toBe("reserved");
  });

  it("allows only one pick per billing cycle", async () => {
    seedPick({ id: "earlier", uid: UID, cycleKey: CYCLE, status: "shipped" });
    seedHeldUnit(UID, "a");

    await expectDomainError(confirm(), "already_picked");
    expect(unit("unit-a").status).toBe("reserved");
  });

  it("lets a member pick again after this cycle's pick was cancelled", async () => {
    seedPick({ id: "cancelled", uid: UID, cycleKey: CYCLE, status: "cancelled" });
    seedHeldUnit(UID, "a");

    await expect(confirm()).resolves.toMatchObject({ status: "pending" });
  });

  it("lets a member pick in a new cycle", async () => {
    seedPick({ id: "last-month", uid: UID, cycleKey: "sub_1-0", status: "returned" });
    seedHeldUnit(UID, "a");

    await expect(confirm()).resolves.toMatchObject({ cycleKey: CYCLE });
  });

  it("aborts the whole pick if any unit was released before confirming", async () => {
    seedHeldUnit(UID, "a");
    const { unit: lost } = seedHeldUnit(UID, "b");
    fakeDb.seed("units", lost.id, { ...lost, status: "available", holdId: null, holderUid: null });

    await expectDomainError(confirm(), "hold_expired");

    expect(fakeDb.all("picks")).toHaveLength(0);
    expect(unit("unit-a").status).toBe("reserved");
    expect(holds()).toHaveLength(2);
  });

  it("records no shipping estimate for Premier", async () => {
    seedHeldUnit(UID, "a");
    const created = await confirm({ tierId: "premier", itemLimit: 40 });
    expect(created.estimatedShippingCents).toBe(0);
  });
});

describe("markReturned", () => {
  function shippedPick() {
    seedUnit("u1", { status: "out", holderUid: UID, pickId: "p1" });
    seedUnit("u2", { status: "out", holderUid: UID, pickId: "p1" });
    return seedPick({
      id: "p1",
      uid: UID,
      status: "shipped",
      items: [item("u1"), item("u2")],
    });
  }

  it("moves a partial return to partially_returned and the garment to cleaning", async () => {
    shippedPick();

    const updated = await markReturned("p1", { unitIds: ["u1"] });

    expect(updated.status).toBe("partially_returned");
    expect(pick("p1").returnedAt).toBeNull();
    expect(outstandingItems(pick("p1")).map((i) => i.unitId)).toEqual(["u2"]);
    expect(unit("u1")).toMatchObject({ status: "cleaning", holderUid: null, pickId: null });
    expect(unit("u2").status).toBe("out");
  });

  it("closes the order when the last piece comes back", async () => {
    shippedPick();
    await markReturned("p1", { unitIds: ["u1"] });
    vi.setSystemTime(NOW + DAY);

    await markReturned("p1");

    expect(pick("p1")).toMatchObject({ status: "returned", returnedAt: NOW + DAY });
    expect(pick("p1").items.map((i) => i.returnedAt)).toEqual([NOW, NOW + DAY]);
    expect(unit("u2").status).toBe("cleaning");
  });

  it("receives the whole order when no units are named", async () => {
    shippedPick();

    await markReturned("p1");

    expect(pick("p1").status).toBe("returned");
    expect(unit("u1").status).toBe("cleaning");
    expect(unit("u2").status).toBe("cleaning");
  });

  it("retires a garment graded below rentable on return", async () => {
    shippedPick();

    await markReturned("p1", { unitIds: ["u1"], condition: "fair" });

    expect(unit("u1")).toMatchObject({ status: "retired", condition: "fair" });
    expect(pick("p1").items[0].returnCondition).toBe("fair");
  });

  it("re-grades a garment that comes back in rentable condition", async () => {
    shippedPick();

    await markReturned("p1", { unitIds: ["u1"], condition: "good" });

    expect(unit("u1")).toMatchObject({ status: "cleaning", condition: "good" });
  });

  it("errors on an unknown order", async () => {
    await expectDomainError(markReturned("missing"), "pick_not_found");
  });
});

describe("cancelPick", () => {
  it("cancels a pending order and puts every unit back on the shelf", async () => {
    seedUnit("u1", { status: "out", holderUid: UID, pickId: "p1" });
    seedPick({ id: "p1", uid: UID, status: "pending", items: [item("u1")] });

    await cancelPick("p1");

    expect(pick("p1").status).toBe("cancelled");
    expect(unit("u1")).toMatchObject({
      status: "available",
      holderUid: null,
      holdId: null,
      holdExpiresAt: null,
      pickId: null,
    });
  });

  it.each(["shipped", "partially_returned", "returned", "cancelled"] as const)(
    "refuses to cancel an order that is %s",
    async (status) => {
      seedUnit("u1", { status: "out", holderUid: UID, pickId: "p1" });
      seedPick({ id: "p1", uid: UID, status, items: [item("u1")] });

      await expectDomainError(cancelPick("p1"), "not_cancellable");
      expect(unit("u1").status).toBe("out");
    },
  );
});

describe("isOverdue", () => {
  const due = NOW;

  it.each(["shipped", "partially_returned"] as const)(
    "flags a %s order once the due date passes",
    (status) => {
      const p = { id: "p", status, dueAt: due } as PickDoc;
      expect(isOverdue(p, due - 1)).toBe(false);
      expect(isOverdue(p, due)).toBe(false);
      expect(isOverdue(p, due + 1)).toBe(true);
    },
  );

  it.each(["pending", "returned", "cancelled"] as const)(
    "never flags a %s order",
    (status) => {
      expect(isOverdue({ id: "p", status, dueAt: due } as PickDoc, due + DAY)).toBe(false);
    },
  );

  it("never flags an order without a due date", () => {
    expect(isOverdue({ id: "p", status: "shipped", dueAt: null } as PickDoc, due)).toBe(false);
  });
});
