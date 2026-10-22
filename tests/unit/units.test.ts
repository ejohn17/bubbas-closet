import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "./support/fake-firestore";
import { seedUnit } from "./support/fixtures";
import { availabilityByProduct, updateUnit } from "@/lib/db/units";
import { bestCondition, isRentableCondition } from "@/lib/rules";
import type { UnitDoc } from "@/lib/types";

vi.mock("@/lib/firebase-admin", async () => {
  const { firebaseAdminMock } = await import("./support/fake-firestore");
  return firebaseAdminMock;
});

beforeEach(() => {
  fakeDb.reset();
});

function unit(id: string): UnitDoc {
  const doc = fakeDb.read<UnitDoc>("units", id);
  if (!doc) throw new Error(`unit ${id} missing`);
  return doc;
}

describe("rentable conditions", () => {
  it("rents new, excellent, and good garments but not fair ones", () => {
    expect(isRentableCondition("new")).toBe(true);
    expect(isRentableCondition("excellent")).toBe(true);
    expect(isRentableCondition("good")).toBe(true);
    expect(isRentableCondition("fair")).toBe(false);
  });

  it("ranks conditions best to worst", () => {
    expect(bestCondition("good", "new")).toBe("new");
    expect(bestCondition("excellent", "fair")).toBe("excellent");
  });
});

describe("updateUnit", () => {
  it.each(["available", "cleaning"] as const)(
    "retires a %s garment graded below rentable",
    async (status) => {
      seedUnit("u1", { status });
      await updateUnit("u1", { condition: "fair" });
      expect(unit("u1")).toMatchObject({ status: "retired", condition: "fair" });
    },
  );

  it.each(["out", "reserved"] as const)(
    "doesn't retire a garment that is %s with a member",
    async (status) => {
      seedUnit("u1", { status, holderUid: "member", holdId: "h1" });
      await updateUnit("u1", { condition: "fair" });
      expect(unit("u1")).toMatchObject({ status, condition: "fair", holderUid: "member" });
    },
  );

  it("clears the member link when a garment is put back on the shelf", async () => {
    seedUnit("u1", {
      status: "reserved",
      holderUid: "member",
      holdId: "h1",
      holdExpiresAt: 123,
      pickId: "p1",
    });

    await updateUnit("u1", { status: "available" });

    expect(unit("u1")).toMatchObject({
      status: "available",
      holderUid: null,
      holdId: null,
      holdExpiresAt: null,
      pickId: null,
    });
  });

  it("keeps the member link when only the notes change", async () => {
    seedUnit("u1", { status: "out", holderUid: "member", pickId: "p1" });
    await updateUnit("u1", { notes: "small stain on cuff" });
    expect(unit("u1")).toMatchObject({ status: "out", holderUid: "member", pickId: "p1" });
  });
});

describe("availabilityByProduct", () => {
  it("counts only available, rentable units and advertises the best condition", async () => {
    seedUnit("a", { size: "6M", condition: "good" });
    seedUnit("b", { size: "6M", condition: "new" });
    seedUnit("c", { size: "12M", condition: "fair" });
    seedUnit("d", { size: "12M", status: "reserved" });
    seedUnit("e", { size: "12M", status: "out" });
    seedUnit("f", { productId: "dress", size: "2T" });

    expect(await availabilityByProduct()).toEqual({
      romper: { total: 2, sizes: { "6M": { count: 2, condition: "new" } } },
      dress: { total: 1, sizes: { "2T": { count: 1, condition: "excellent" } } },
    });
  });
});
