import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "./support/fake-firestore";
import { NOW, seedSubscription } from "./support/fixtures";
import { getPortalAccess, portalModeFor } from "@/lib/portal";
import { cycleKeyFor, getEntitlement } from "@/lib/db/subscriptions";
import type { SessionUser } from "@/lib/session";
import type { SubscriptionStatus } from "@/lib/types";

vi.mock("@/lib/firebase-admin", async () => {
  const { firebaseAdminMock } = await import("./support/fake-firestore");
  return firebaseAdminMock;
});

const user: SessionUser = {
  uid: "member",
  email: "member@example.com",
  name: "Member",
  isAdmin: false,
  profile: null,
};

beforeEach(() => {
  fakeDb.reset();
});

describe("getPortalAccess", () => {
  it("lets a visitor with no membership preview up to the largest plan", async () => {
    const access = await getPortalAccess(user);
    expect(access.mode).toBe("preview");
    expect(access.itemLimit).toBe(40);
    expect(access.entitlement.entitled).toBe(false);
    expect(access.entitlement.cycleKey).toBeNull();
  });

  it.each([
    ["essential", 10],
    ["signature", 20],
    ["premier", 40],
  ])("caps an active %s member at %i items", async (tierId, itemLimit) => {
    seedSubscription({ id: "sub_1", uid: user.uid, tierId, itemLimit });
    const access = await getPortalAccess(user);
    expect(access.mode).toBe("member");
    expect(access.itemLimit).toBe(itemLimit);
  });

  it("treats a trialing membership as active", async () => {
    seedSubscription({ id: "sub_1", uid: user.uid, status: "trialing" });
    expect((await getPortalAccess(user)).mode).toBe("member");
  });

  it.each<SubscriptionStatus>(["past_due", "unpaid"])(
    "pauses a %s membership with no allowance",
    async (status) => {
      seedSubscription({ id: "sub_1", uid: user.uid, status });
      const access = await getPortalAccess(user);
      expect(access.mode).toBe("paused");
      expect(access.itemLimit).toBe(0);
    },
  );

  it.each<SubscriptionStatus>(["canceled", "incomplete", "incomplete_expired"])(
    "drops a %s membership back to preview",
    async (status) => {
      seedSubscription({ id: "sub_1", uid: user.uid, status });
      const access = await getPortalAccess(user);
      expect(access.mode).toBe("preview");
      expect(access.itemLimit).toBe(40);
    },
  );

  it("uses the best membership when a member has several", async () => {
    seedSubscription({
      id: "sub_old",
      uid: user.uid,
      status: "canceled",
      tierId: "premier",
      itemLimit: 40,
      updatedAt: NOW,
    });
    seedSubscription({
      id: "sub_new",
      uid: user.uid,
      status: "active",
      tierId: "signature",
      itemLimit: 20,
      updatedAt: NOW - 1000,
    });

    const access = await getPortalAccess(user);
    expect(access.mode).toBe("member");
    expect(access.itemLimit).toBe(20);
    expect(access.entitlement.subscription?.id).toBe("sub_new");
  });

  it("ignores other members' subscriptions", async () => {
    seedSubscription({ id: "sub_other", uid: "someone-else" });
    expect((await getPortalAccess(user)).mode).toBe("preview");
  });
});

describe("billing cycle key", () => {
  it("is stable within a cycle and changes when the period rolls over", async () => {
    const sub = seedSubscription({ id: "sub_1", uid: user.uid, currentPeriodStart: 1000 });
    expect(cycleKeyFor(sub)).toBe("sub_1-1000");
    expect((await getEntitlement(user.uid)).cycleKey).toBe("sub_1-1000");
    expect(cycleKeyFor({ ...sub, currentPeriodStart: 2000 })).not.toBe(cycleKeyFor(sub));
  });
});

describe("portalModeFor", () => {
  it("prefers entitlement over billing problems", () => {
    expect(
      portalModeFor({ entitled: true, subscription: null, itemLimit: 10, cycleKey: null }),
    ).toBe("member");
  });
});
