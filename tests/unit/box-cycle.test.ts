import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "./support/fake-firestore";
import { DAY, NOW, seedPick, seedSubscription } from "./support/fixtures";
import { resolveBoxCycle } from "@/lib/box-cycle";
import type { PickDoc, SubscriptionDoc } from "@/lib/types";

vi.mock("@/lib/firebase-admin", async () => {
  const { firebaseAdminMock } = await import("./support/fake-firestore");
  return firebaseAdminMock;
});

const RENEWAL = NOW + 35 * DAY;
const CURRENT = `sub_1-${NOW}`;
const NEXT = `sub_1-${RENEWAL}`;
const MID_CYCLE = NOW + 10 * DAY;
const RETURN_WINDOW = NOW + 32 * DAY;

function sub(overrides: Partial<SubscriptionDoc> = {}): SubscriptionDoc {
  return seedSubscription({
    id: "sub_1",
    uid: "member",
    currentPeriodStart: NOW,
    currentPeriodEnd: RENEWAL,
    ...overrides,
  });
}

function pick(overrides: Partial<PickDoc> = {}): PickDoc {
  return seedPick({ id: "p1", cycleKey: CURRENT, status: "shipped", ...overrides });
}

const sentBack = { returnShippedAt: NOW + 5 * DAY, returnTrackingNumber: "CA123456789" };

beforeEach(() => {
  fakeDb.reset();
});

describe("resolveBoxCycle before the box is picked", () => {
  it("opens this cycle's box, due 30 days after it started", () => {
    expect(resolveBoxCycle(sub(), [], MID_CYCLE)).toEqual({
      open: true,
      cycleKey: CURRENT,
      dueAt: NOW + 30 * DAY,
      tierId: "essential",
      notice: null,
    });
  });

  it("isn't blocked by a box still out from an earlier cycle", () => {
    const earlier = pick({ cycleKey: "sub_1-0" });
    expect(resolveBoxCycle(sub(), [earlier], MID_CYCLE)).toMatchObject({
      open: true,
      cycleKey: CURRENT,
    });
  });

  it("ignores a cancelled pick", () => {
    const cancelled = pick({ status: "cancelled" });
    expect(resolveBoxCycle(sub(), [cancelled], MID_CYCLE)).toMatchObject({
      open: true,
      cycleKey: CURRENT,
    });
  });
});

describe("resolveBoxCycle while a box is out", () => {
  it.each(["pending", "shipped", "partially_returned"] as const)(
    "stays locked for a %s box with no return tracking",
    (status) => {
      const out = pick({ status });

      const before = resolveBoxCycle(sub(), [out], MID_CYCLE);
      expect(before.open).toBe(false);
      expect(before.notice?.title).toMatch(/can unlock from/);

      const during = resolveBoxCycle(sub(), [out], RETURN_WINDOW);
      expect(during.open).toBe(false);
      expect(during.notice?.title).toMatch(/on its way back/);
    },
  );

  it("stays locked in the return window when an earlier box is still out", () => {
    const earlier = pick({ cycleKey: "sub_1-0" });
    expect(resolveBoxCycle(sub(), [earlier], RETURN_WINDOW).open).toBe(false);
  });

  it("stays locked until every box out has tracking", () => {
    const earlier = pick({ id: "p0", cycleKey: "sub_1-0" });
    const current = pick(sentBack);
    expect(resolveBoxCycle(sub(), [earlier, current], RETURN_WINDOW).open).toBe(false);
  });
});

describe("resolveBoxCycle once the box is on its way back", () => {
  it("opens the next cycle's box, due 30 days after renewal", () => {
    const cycle = resolveBoxCycle(sub(), [pick(sentBack)], RETURN_WINDOW);
    expect(cycle).toMatchObject({
      open: true,
      cycleKey: NEXT,
      dueAt: RENEWAL + 30 * DAY,
    });
    expect(cycle.notice?.detail).toMatch(/30 days start on/);
  });

  it("stays locked until day 30, however early the box went back", () => {
    const sent = pick(sentBack);

    const before = resolveBoxCycle(sub(), [sent], NOW + 30 * DAY - 1);
    expect(before.open).toBe(false);
    expect(before.notice?.title).toMatch(/opens on/);

    expect(resolveBoxCycle(sub(), [sent], NOW + 30 * DAY)).toMatchObject({
      open: true,
      cycleKey: NEXT,
    });
  });

  it("stays locked until day 30 when admin already received the box", () => {
    const returned = pick({ status: "returned" });
    expect(resolveBoxCycle(sub(), [returned], MID_CYCLE).open).toBe(false);
  });

  it("also opens when admin received the box without any tracking", () => {
    const returned = pick({ status: "returned" });
    expect(resolveBoxCycle(sub(), [returned], RETURN_WINDOW)).toMatchObject({
      open: true,
      cycleKey: NEXT,
    });
  });

  it("opens in the return window when there's nothing to send back", () => {
    expect(resolveBoxCycle(sub(), [], RETURN_WINDOW)).toMatchObject({
      open: true,
      cycleKey: NEXT,
    });
  });

  it("files the box under a scheduled downgrade, which applies at renewal", () => {
    const cycle = resolveBoxCycle(
      sub({ tierId: "premier", pendingTierId: "essential" }),
      [pick(sentBack)],
      RETURN_WINDOW,
    );
    expect(cycle).toMatchObject({ open: true, tierId: "essential" });
  });

  it("allows only one early box", () => {
    const current = pick(sentBack);
    const early = pick({ id: "p2", cycleKey: NEXT, status: "pending" });
    const cycle = resolveBoxCycle(sub(), [current, early], RETURN_WINDOW);
    expect(cycle.open).toBe(false);
    expect(cycle.notice?.title).toMatch(/next box is confirmed/);
  });

  it("gives a membership set to cancel no early box", () => {
    const cycle = resolveBoxCycle(
      sub({ cancelAtPeriodEnd: true }),
      [pick(sentBack)],
      RETURN_WINDOW,
    );
    expect(cycle.open).toBe(false);
    expect(cycle.notice?.title).toMatch(/membership is ending/);
  });
});

describe("resolveBoxCycle after renewal", () => {
  const renewed = () =>
    sub({ currentPeriodStart: RENEWAL, currentPeriodEnd: RENEWAL + 35 * DAY });

  it("treats an early box as the new cycle's box", () => {
    const early = pick({ cycleKey: NEXT });
    const cycle = resolveBoxCycle(renewed(), [early], RENEWAL + DAY);
    expect(cycle.open).toBe(false);
    expect(cycle.notice?.title).toBe("Your next box can unlock from May 5, 2026.");
  });

  it("still opens at renewal for a member whose old box never came back", () => {
    const old = pick();
    expect(resolveBoxCycle(renewed(), [old], RENEWAL + DAY)).toMatchObject({
      open: true,
      cycleKey: NEXT,
      dueAt: RENEWAL + 30 * DAY,
    });
  });
});
