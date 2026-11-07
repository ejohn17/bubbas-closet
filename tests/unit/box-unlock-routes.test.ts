import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "./support/fake-firestore";
import {
  DAY,
  MINUTE,
  NOW,
  seedHeldUnit,
  seedPick,
  seedSubscription,
} from "./support/fixtures";
import { POST as confirmRoute } from "@/app/api/portal/box/confirm/route";
import { POST as remindersRoute } from "@/app/api/cron/return-reminders/route";
import { POST as returnRoute } from "@/app/api/portal/picks/[id]/return/route";
import { sendOverdueNotice, sendReturnReminder } from "@/lib/email";
import { getSessionUser, type SessionUser } from "@/lib/session";
import type { PickDoc, SubscriptionDoc } from "@/lib/types";

vi.mock("@/lib/firebase-admin", async () => {
  const { firebaseAdminMock } = await import("./support/fake-firestore");
  return firebaseAdminMock;
});
vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/cron", () => ({ assertCronAuthorized: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendPickConfirmation: vi.fn(),
  sendReturnReminder: vi.fn(),
  sendOverdueNotice: vi.fn(),
}));

const RENEWAL = NOW + 35 * DAY;
const TRACKING = "CA123456789";

const member = {
  uid: "member",
  email: "member@example.com",
  name: "Member",
  isAdmin: false,
  profile: {
    shippingAddress: {
      name: "Test Parent",
      line1: "1 Main St",
      city: "Toronto",
      region: "ON",
      postalCode: "M5V 1A1",
      country: "CA",
      phone: "416-555-0100",
    },
  },
} as SessionUser;

function subscribe(overrides: Partial<SubscriptionDoc> = {}) {
  return seedSubscription({
    id: "sub_1",
    uid: member.uid,
    currentPeriodStart: NOW,
    currentPeriodEnd: RENEWAL,
    ...overrides,
  });
}

function outBox(overrides: Partial<PickDoc> = {}) {
  return seedPick({
    id: "old-box",
    uid: member.uid,
    cycleKey: `sub_1-${NOW}`,
    status: "shipped",
    dueAt: NOW + 30 * DAY,
    ...overrides,
  });
}

/** A live hold at the test's clock, which runs well past the fixture default. */
function hold(id: string) {
  seedHeldUnit(member.uid, id, { expiresAt: Date.now() + 10 * MINUTE });
}

async function confirm() {
  const res = await confirmRoute();
  return { status: res.status, body: await res.json() };
}

async function sendBack(trackingNumber: string, id = "old-box") {
  const res = await returnRoute(
    new Request("http://test.local", {
      method: "POST",
      body: JSON.stringify({ trackingNumber }),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  fakeDb.reset();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW + 31 * DAY);
  vi.mocked(getSessionUser).mockResolvedValue(member);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("unlocking the next box with return tracking", () => {
  it("refuses a new box until tracking is added, then files it under the next cycle", async () => {
    subscribe();
    outBox();
    hold("h1");

    const locked = await confirm();
    expect(locked.status).toBe(400);
    expect(locked.body.code).toBe("box_locked");

    expect((await sendBack(TRACKING)).body.ok).toBe(true);

    const confirmed = await confirm();
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.pick).toMatchObject({
      cycleKey: `sub_1-${RENEWAL}`,
      dueAt: RENEWAL + 30 * DAY,
      status: "pending",
    });
  });

  it("refuses a second early box", async () => {
    subscribe();
    outBox();
    hold("h1");
    await sendBack(TRACKING);
    await confirm();

    hold("h2");
    const second = await confirm();
    expect(second.status).toBe(400);
    expect(second.body.message).toMatch(/next box is confirmed/);
  });

  it("holds an early box to the limit of a scheduled downgrade", async () => {
    subscribe({ tierId: "signature", itemLimit: 20, pendingTierId: "essential" });
    outBox();
    for (let i = 0; i < 11; i += 1) hold(`h${i}`);
    await sendBack(TRACKING);

    const over = await confirm();
    expect(over.status).toBe(400);
    expect(over.body.code).toBe("limit_reached");
  });

  it("keeps the current plan's limit for a box in the current cycle", async () => {
    vi.setSystemTime(NOW + DAY);
    subscribe({ tierId: "signature", itemLimit: 20, pendingTierId: "essential" });
    for (let i = 0; i < 11; i += 1) hold(`h${i}`);

    const confirmed = await confirm();
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.pick).toMatchObject({
      cycleKey: `sub_1-${NOW}`,
      tierId: "signature",
      itemLimit: 20,
    });
  });

  it("won't let a member add tracking to someone else's box", async () => {
    subscribe();
    outBox({ uid: "someone-else" });

    const res = await sendBack(TRACKING);
    expect(res.status).toBe(404);
    expect(fakeDb.read<PickDoc>("picks", "old-box")?.returnShippedAt).toBeUndefined();
  });
});

describe("return reminders", () => {
  const sentBack = {
    returnShippedAt: NOW + 27 * DAY,
    returnTrackingNumber: TRACKING,
  };

  it("skips the reminder for a box already sent back", async () => {
    vi.setSystemTime(NOW + 28 * DAY);
    outBox(sentBack);

    await remindersRoute(new Request("http://test.local"));

    expect(sendReturnReminder).not.toHaveBeenCalled();
  });

  it("still reminds a member who hasn't sent their box back", async () => {
    vi.setSystemTime(NOW + 28 * DAY);
    outBox();

    await remindersRoute(new Request("http://test.local"));

    expect(sendReturnReminder).toHaveBeenCalledOnce();
  });

  it.each([
    ["with", sentBack],
    ["without", {}],
  ])("sends the overdue notice %s return tracking", async (_label, tracking) => {
    outBox(tracking);

    await remindersRoute(new Request("http://test.local"));

    expect(sendOverdueNotice).toHaveBeenCalledOnce();
  });
});
