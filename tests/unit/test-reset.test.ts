import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "./support/fake-firestore";
import {
  DAY,
  NOW,
  seedHeldUnit,
  seedPick,
  seedUnit,
} from "./support/fixtures";
import { PATCH as orderRoute } from "@/app/api/admin/picks/[id]/route";
import {
  confirmBox,
  markReturned,
  recordPurchase,
  resetTestPick,
} from "@/lib/db/picks";
import { availabilityByProduct } from "@/lib/db/units";
import { getSessionUser, type SessionUser } from "@/lib/session";
import type { PickDoc, PickItem, UnitDoc } from "@/lib/types";

vi.mock("@/lib/firebase-admin", async () => {
  const { firebaseAdminMock } = await import("./support/fake-firestore");
  return firebaseAdminMock;
});
vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));

const TESTER = "tester";
const MEMBER = "member";

const staff = {
  uid: "staff",
  email: "staff@example.com",
  name: "Staff",
  isAdmin: true,
  profile: null,
} as SessionUser;

function item(unitId: string, overrides: Partial<PickItem> = {}): PickItem {
  return {
    unitId,
    productId: "romper",
    productTitle: "Romper",
    size: "6M",
    condition: "excellent",
    returnedAt: null,
    returnCondition: null,
    ...overrides,
  };
}

function unit(id: string): UnitDoc {
  const doc = fakeDb.read<UnitDoc>("units", id);
  if (!doc) throw new Error(`unit ${id} missing`);
  return doc;
}

const ON_SHELF = {
  status: "available",
  holderUid: null,
  holdId: null,
  holdExpiresAt: null,
  pickId: null,
};

/** A shipped three-piece test box on the tester's admin account. */
function testBox(uid = TESTER) {
  fakeDb.seed("users", TESTER, { uid: TESTER, email: "tester@example.com", isAdmin: true });
  fakeDb.seed("users", MEMBER, { uid: MEMBER, email: "member@example.com", isAdmin: false });
  for (const id of ["u1", "u2", "u3"]) {
    seedUnit(id, { status: "out", holderUid: uid, pickId: "p1" });
  }
  return seedPick({
    id: "p1",
    uid,
    status: "shipped",
    dueAt: NOW + 30 * DAY,
    items: [item("u1"), item("u2"), item("u3")],
  });
}

function buy(unitIds: string[], uid = TESTER) {
  return recordPurchase("p1", {
    uid,
    sessionId: "cs_test_1",
    lines: unitIds.map((unitId) => ({ unitId, priceCents: 2500 })),
  });
}

async function reset(id = "p1") {
  const res = await orderRoute(
    new Request("http://test.local", {
      method: "PATCH",
      body: JSON.stringify({ action: "resetTest" }),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  fakeDb.reset();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.mocked(getSessionUser).mockResolvedValue(staff);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("resetTestPick", () => {
  it("puts bought and still-out garments back in the closet and deletes the order", async () => {
    testBox();
    await buy(["u1"]);
    expect(unit("u1").status).toBe("sold");

    const result = await resetTestPick("p1");

    expect(result).toEqual({ restored: ["u1", "u2", "u3"], leftAlone: [] });
    for (const id of ["u1", "u2", "u3"]) {
      expect(unit(id)).toMatchObject(ON_SHELF);
    }
    expect(fakeDb.read("picks", "p1")).toBeNull();
    expect((await availabilityByProduct()).romper.total).toBe(3);
  });

  it("takes received-back garments out of cleaning with the condition they shipped in", async () => {
    testBox();
    await markReturned("p1", { unitIds: ["u1"], condition: "good" });
    await markReturned("p1", { unitIds: ["u2"], condition: "fair" });
    expect(unit("u2").status).toBe("retired");

    const result = await resetTestPick("p1");

    expect(result.restored).toEqual(["u1", "u2", "u3"]);
    expect(unit("u1")).toMatchObject({ ...ON_SHELF, condition: "excellent" });
    expect(unit("u2")).toMatchObject({ ...ON_SHELF, condition: "excellent" });
  });

  it("restores a whole box the tester bought", async () => {
    testBox();
    await buy(["u1", "u2", "u3"]);
    expect(fakeDb.read<PickDoc>("picks", "p1")?.status).toBe("returned");

    const result = await resetTestPick("p1");

    expect(result.restored).toHaveLength(3);
    expect(unit("u3")).toMatchObject(ON_SHELF);
  });

  it("leaves a garment that has since gone out in someone else's box", async () => {
    testBox();
    await markReturned("p1", { unitIds: ["u1"] });
    seedUnit("u1", { status: "out", holderUid: MEMBER, pickId: "real-order" });

    const result = await resetTestPick("p1");

    expect(result).toEqual({ restored: ["u2", "u3"], leftAlone: ["u1"] });
    expect(unit("u1")).toMatchObject({
      status: "out",
      holderUid: MEMBER,
      pickId: "real-order",
    });
  });

  it("leaves a received-back garment that someone has handled since", async () => {
    testBox();
    await markReturned("p1", { unitIds: ["u1"] });
    // Re-rented and returned again: in cleaning, but not from this order.
    seedUnit("u1", { status: "cleaning", updatedAt: NOW + DAY });

    const result = await resetTestPick("p1");

    expect(result.leftAlone).toEqual(["u1"]);
    expect(unit("u1")).toMatchObject({ status: "cleaning", updatedAt: NOW + DAY });
  });

  it("doesn't report a garment that's already back on the shelf", async () => {
    testBox();
    await markReturned("p1", { unitIds: ["u1"] });
    seedUnit("u1", { status: "available", updatedAt: NOW + DAY });

    const result = await resetTestPick("p1");

    expect(result).toEqual({ restored: ["u2", "u3"], leftAlone: [] });
    expect(unit("u1").updatedAt).toBe(NOW + DAY);
  });

  it("lets the tester confirm a new box in the same cycle", async () => {
    fakeDb.seed("users", TESTER, { uid: TESTER, isAdmin: true });
    seedHeldUnit(TESTER, "a");
    const first = await confirmBox({
      uid: TESTER,
      email: "tester@example.com",
      cycleKey: "sub_1-0",
      tierId: "essential",
      itemLimit: 10,
    });

    await resetTestPick(first.id);
    seedHeldUnit(TESTER, "b");

    await expect(
      confirmBox({
        uid: TESTER,
        email: "tester@example.com",
        cycleKey: "sub_1-0",
        tierId: "essential",
        itemLimit: 10,
      }),
    ).resolves.toMatchObject({ status: "pending" });
  });

  it("errors on an unknown order", async () => {
    await expect(resetTestPick("missing")).rejects.toMatchObject({
      code: "pick_not_found",
    });
  });
});

describe("reset test order action", () => {
  it("resets an order placed by an admin account", async () => {
    testBox();
    await buy(["u1"]);

    const res = await reset();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      restored: ["u1", "u2", "u3"],
      leftAlone: [],
    });
    expect(unit("u1")).toMatchObject(ON_SHELF);
  });

  it("refuses a real member's order and changes nothing", async () => {
    testBox(MEMBER);
    await buy(["u1"], MEMBER);

    const res = await reset();

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("not_test_order");
    expect(unit("u1").status).toBe("sold");
    expect(unit("u2").status).toBe("out");
    expect(fakeDb.read("picks", "p1")).not.toBeNull();
  });

  it("refuses an order whose account has no profile", async () => {
    seedUnit("u1", { status: "out", holderUid: "ghost", pickId: "p1" });
    seedPick({ id: "p1", uid: "ghost", status: "shipped", items: [item("u1")] });

    expect((await reset()).status).toBe(403);
    expect(unit("u1").status).toBe("out");
  });

  it("is admin only", async () => {
    testBox();
    vi.mocked(getSessionUser).mockResolvedValue({ ...staff, isAdmin: false });

    const res = await reset();

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden");
    expect(fakeDb.read("picks", "p1")).not.toBeNull();
  });

  it("404s on an unknown order", async () => {
    expect((await reset("missing")).status).toBe(404);
  });
});
