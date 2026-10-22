import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "./support/fake-firestore";
import {
  holds,
  MINUTE,
  NOW,
  seedHeldUnit,
  seedProduct,
  seedUnit,
  units,
} from "./support/fixtures";
import {
  addToBox,
  getBox,
  listHolds,
  refreshHolds,
  releaseExpiredHolds,
  removeFromBox,
} from "@/lib/db/holds";
import { DomainError } from "@/lib/db/base";
import { RULES } from "@/lib/rules";
import type { HoldDoc, UnitDoc } from "@/lib/types";

vi.mock("@/lib/firebase-admin", async () => {
  const { firebaseAdminMock } = await import("./support/fake-firestore");
  return firebaseAdminMock;
});

const UID = "member";
const HOLD_TTL = RULES.holdTtlMinutes * MINUTE;

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

async function expectDomainError(promise: Promise<unknown>, code: string) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(DomainError);
  expect((err as DomainError).code).toBe(code);
  return err as DomainError;
}

describe("addToBox", () => {
  it("reserves an available unit and creates a hold that expires after the TTL", async () => {
    seedProduct("romper");
    seedUnit("u1");

    const hold = await addToBox({ uid: UID, productId: "romper", size: "6M", itemLimit: 10 });

    expect(hold).toMatchObject({
      uid: UID,
      unitId: "u1",
      productId: "romper",
      size: "6M",
      condition: "excellent",
      createdAt: NOW,
      expiresAt: NOW + HOLD_TTL,
    });
    expect(unit("u1")).toMatchObject({
      status: "reserved",
      holderUid: UID,
      holdId: hold.id,
      holdExpiresAt: NOW + HOLD_TTL,
    });
    expect(holds()).toHaveLength(1);
  });

  it("refuses to go past the tier limit and leaves the unit on the shelf", async () => {
    seedHeldUnit(UID, "h1");
    seedHeldUnit(UID, "h2");
    seedProduct("romper");
    seedUnit("u1");

    const err = await expectDomainError(
      addToBox({ uid: UID, productId: "romper", size: "6M", itemLimit: 2 }),
      "limit_reached",
    );

    expect(err.status).toBe(409);
    expect(err.message).toContain("covers 2 items");
    expect(unit("u1").status).toBe("available");
    expect(holds()).toHaveLength(2);
  });

  it("uses the caller's wording when the box is full", async () => {
    seedHeldUnit(UID, "h1");
    seedProduct("romper");
    seedUnit("u1");

    const err = await expectDomainError(
      addToBox({
        uid: UID,
        productId: "romper",
        size: "6M",
        itemLimit: 1,
        limitMessage: "That's as many pieces as our biggest plan covers (1).",
      }),
      "limit_reached",
    );
    expect(err.message).toBe("That's as many pieces as our biggest plan covers (1).");
  });

  it("allows filling the box exactly to the limit", async () => {
    seedHeldUnit(UID, "h1");
    seedProduct("romper");
    seedUnit("u1");

    await addToBox({ uid: UID, productId: "romper", size: "6M", itemLimit: 2 });
    expect(holds()).toHaveLength(2);
  });

  it("does not count expired holds toward the limit", async () => {
    seedHeldUnit(UID, "stale", { expiresAt: NOW - 1 });
    seedProduct("romper");
    seedUnit("u1");

    await addToBox({ uid: UID, productId: "romper", size: "6M", itemLimit: 1 });
    expect(unit("u1").status).toBe("reserved");
  });

  it("does not count another member's holds toward the limit", async () => {
    seedHeldUnit("someone-else", "h1");
    seedProduct("romper");
    seedUnit("u1");

    await addToBox({ uid: UID, productId: "romper", size: "6M", itemLimit: 1 });
    expect(unit("u1").holderUid).toBe(UID);
  });

  it("restarts the hold window for every piece already in the box", async () => {
    const { hold: older } = seedHeldUnit(UID, "h1", { expiresAt: NOW + 2 * MINUTE });
    seedProduct("romper");
    seedUnit("u1");

    const added = await addToBox({ uid: UID, productId: "romper", size: "6M", itemLimit: 10 });

    expect(fakeDb.read<HoldDoc>("holds", older.id)?.expiresAt).toBe(NOW + HOLD_TTL);
    expect(unit(older.unitId).holdExpiresAt).toBe(NOW + HOLD_TTL);
    expect(added.expiresAt).toBe(NOW + HOLD_TTL);
  });

  it("allows only one piece per style in the box", async () => {
    seedProduct("romper");
    seedUnit("u1");
    seedUnit("u2");
    await addToBox({ uid: UID, productId: "romper", size: "6M", itemLimit: 10 });

    await expectDomainError(
      addToBox({ uid: UID, productId: "romper", size: "6M", itemLimit: 10 }),
      "already_in_box",
    );
    expect(unit("u2").status).toBe("available");
  });

  it("only offers units in the requested size", async () => {
    seedProduct("romper");
    seedUnit("u-12m", { size: "12M" });

    await expectDomainError(
      addToBox({ uid: UID, productId: "romper", size: "6M", itemLimit: 10 }),
      "size_unavailable",
    );
  });

  it("never hands out a garment graded below the rentable conditions", async () => {
    seedProduct("romper");
    seedUnit("worn", { condition: "fair" });

    await expectDomainError(
      addToBox({ uid: UID, productId: "romper", size: "6M", itemLimit: 10 }),
      "size_unavailable",
    );
    expect(unit("worn").status).toBe("available");
  });

  it.each(["reserved", "out", "cleaning", "retired"] as const)(
    "skips units that are %s",
    async (status) => {
      seedProduct("romper");
      seedUnit("busy", { status });

      await expectDomainError(
        addToBox({ uid: UID, productId: "romper", size: "6M", itemLimit: 10 }),
        "size_unavailable",
      );
    },
  );

  it("rejects a style that has been taken off the shelf", async () => {
    seedProduct("romper", { active: false });
    seedUnit("u1");

    const err = await expectDomainError(
      addToBox({ uid: UID, productId: "romper", size: "6M", itemLimit: 10 }),
      "product_unavailable",
    );
    expect(err.status).toBe(404);
  });

  it("falls through to the next unit when another member wins the race", async () => {
    seedProduct("romper");
    seedUnit("u1");
    seedUnit("u2");
    fakeDb.beforeNextTransaction(() => {
      fakeDb.seed("units", "u1", { ...unit("u1"), status: "reserved", holderUid: "rival" });
    });

    const hold = await addToBox({ uid: UID, productId: "romper", size: "6M", itemLimit: 10 });

    expect(hold.unitId).toBe("u2");
    expect(unit("u1").holderUid).toBe("rival");
    expect(unit("u2").holderUid).toBe(UID);
  });

  it("reports the piece as taken when every candidate is lost to a race", async () => {
    seedProduct("romper");
    seedUnit("u1");
    fakeDb.beforeNextTransaction(() => {
      fakeDb.seed("units", "u1", { ...unit("u1"), status: "reserved" });
    });

    await expectDomainError(
      addToBox({ uid: UID, productId: "romper", size: "6M", itemLimit: 10 }),
      "unit_taken",
    );
  });
});

describe("removeFromBox", () => {
  it("deletes the hold and returns the unit to the catalogue", async () => {
    const { hold, unit: held } = seedHeldUnit(UID, "h1");

    await removeFromBox(UID, hold.id);

    expect(holds()).toHaveLength(0);
    expect(unit(held.id)).toMatchObject({
      status: "available",
      holderUid: null,
      holdId: null,
      holdExpiresAt: null,
    });
  });

  it("won't let a member remove someone else's piece", async () => {
    const { hold, unit: held } = seedHeldUnit("someone-else", "h1");

    const err = await expectDomainError(removeFromBox(UID, hold.id), "forbidden");

    expect(err.status).toBe(403);
    expect(unit(held.id).status).toBe("reserved");
    expect(holds()).toHaveLength(1);
  });

  it("leaves a unit alone if it has since been re-held under a different hold", async () => {
    const { hold, unit: held } = seedHeldUnit(UID, "h1");
    fakeDb.seed("units", held.id, { ...held, holdId: "newer-hold", holderUid: "rival" });

    await removeFromBox(UID, hold.id);

    expect(holds()).toHaveLength(0);
    expect(unit(held.id)).toMatchObject({ status: "reserved", holderUid: "rival" });
  });

  it("is a no-op for a hold that no longer exists", async () => {
    await expect(removeFromBox(UID, "missing")).resolves.toBeUndefined();
  });
});

describe("getBox and listHolds", () => {
  it("shows only live holds, oldest first, with what's left of the allowance", async () => {
    seedHeldUnit(UID, "second", { createdAt: NOW - MINUTE, expiresAt: NOW + 5 * MINUTE });
    seedHeldUnit(UID, "first", { createdAt: NOW - 2 * MINUTE, expiresAt: NOW + 3 * MINUTE });
    seedHeldUnit(UID, "expired", { expiresAt: NOW });

    expect((await listHolds(UID)).map((h) => h.id)).toEqual(["first", "second"]);

    const box = await getBox(UID, 10);
    expect(box.remaining).toBe(8);
    expect(box.expiresAt).toBe(NOW + 3 * MINUTE);
  });

  it("never reports a negative allowance after a downgrade", async () => {
    seedHeldUnit(UID, "h1");
    seedHeldUnit(UID, "h2");
    seedHeldUnit(UID, "h3");

    expect((await getBox(UID, 2)).remaining).toBe(0);
  });

  it("has no countdown for an empty box", async () => {
    expect(await getBox(UID, 10)).toEqual({
      holds: [],
      itemLimit: 10,
      remaining: 10,
      expiresAt: null,
    });
  });
});

describe("refreshHolds", () => {
  it("restarts the window for every live piece", async () => {
    const { unit: a } = seedHeldUnit(UID, "a", { expiresAt: NOW + MINUTE });
    const { unit: b } = seedHeldUnit(UID, "b", { expiresAt: NOW + 2 * MINUTE });

    expect(await refreshHolds(UID)).toBe(NOW + HOLD_TTL);
    expect(holds().map((h) => h.expiresAt)).toEqual([NOW + HOLD_TTL, NOW + HOLD_TTL]);
    expect(unit(a.id).holdExpiresAt).toBe(NOW + HOLD_TTL);
    expect(unit(b.id).holdExpiresAt).toBe(NOW + HOLD_TTL);
  });

  it("does not revive holds that already expired", async () => {
    seedHeldUnit(UID, "stale", { expiresAt: NOW - 1 });

    expect(await refreshHolds(UID)).toBeNull();
    expect(holds()[0].expiresAt).toBe(NOW - 1);
  });
});

describe("releaseExpiredHolds", () => {
  it("returns expired pieces to the closet and keeps live ones", async () => {
    const { unit: stale } = seedHeldUnit(UID, "stale", { expiresAt: NOW - MINUTE });
    const { unit: live } = seedHeldUnit(UID, "live", { expiresAt: NOW + MINUTE });

    expect(await releaseExpiredHolds()).toBe(1);

    expect(holds().map((h) => h.id)).toEqual(["live"]);
    expect(unit(stale.id).status).toBe("available");
    expect(unit(live.id).status).toBe("reserved");
  });

  it("frees reserved units whose hold document is already gone", async () => {
    seedUnit("orphan", { status: "reserved", holderUid: UID, holdId: "deleted", holdExpiresAt: NOW - MINUTE });
    seedUnit("orphan-no-expiry", { status: "reserved", holderUid: UID, holdId: null, holdExpiresAt: null });

    expect(await releaseExpiredHolds()).toBe(2);
    expect(units().map((u) => u.status)).toEqual(["available", "available"]);
  });

  it("waits out the window on an orphaned unit whose hold hasn't expired yet", async () => {
    seedUnit("orphan", { status: "reserved", holderUid: UID, holdId: "deleted", holdExpiresAt: NOW + MINUTE });

    expect(await releaseExpiredHolds()).toBe(0);
    expect(unit("orphan").status).toBe("reserved");
  });

  it("sweeps against the time it's given", async () => {
    seedUnit("lagging", { status: "reserved", holdId: "h-old", holdExpiresAt: NOW + MINUTE });
    fakeDb.seed("holds", "h-old", {
      id: "h-old",
      uid: UID,
      unitId: "lagging",
      productId: "romper",
      productTitle: "Romper",
      size: "6M",
      createdAt: NOW - HOLD_TTL,
      expiresAt: NOW,
    });

    await releaseExpiredHolds(NOW + 1);

    expect(unit("lagging").status).toBe("available");
    expect(holds()).toHaveLength(0);
  });

  it("leaves units that are out on loan alone", async () => {
    seedUnit("rented", { status: "out", holderUid: UID, pickId: "p1" });

    expect(await releaseExpiredHolds()).toBe(0);
    expect(unit("rented").status).toBe("out");
  });
});
