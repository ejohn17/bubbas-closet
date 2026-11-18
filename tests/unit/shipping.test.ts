import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "./support/fake-firestore";
import { NOW, seedPick } from "./support/fixtures";
import { PATCH as orderRoute } from "@/app/api/admin/picks/[id]/route";
import { chargeFee } from "@/lib/billing";
import { sendPickConfirmation } from "@/lib/email";
import {
  describeOutboundRates,
  estimateOutboundShippingCents,
  flatOutboundShippingCents,
  outboundShippingRate,
  outboundShippingShortNote,
  outboundShippingSummary,
  shippingCostNote,
} from "@/lib/rules";
import { getSessionUser, type SessionUser } from "@/lib/session";
import type { Address, PickDoc } from "@/lib/types";

vi.mock("@/lib/firebase-admin", async () => {
  const { firebaseAdminMock } = await import("./support/fake-firestore");
  return firebaseAdminMock;
});
vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/billing", () => ({
  chargeFee: vi.fn(),
  ensureStripeCustomer: vi.fn(),
}));

const TORONTO: Address = {
  name: "Test Parent",
  line1: "1 Main St",
  city: "Toronto",
  region: "ON",
  postalCode: "M5V 1A1",
  country: "CA",
};
const SEATTLE: Address = {
  name: "Test Parent",
  line1: "1 Pike St",
  city: "Seattle",
  region: "WA",
  postalCode: "98101",
  country: "US",
};

const items = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    unitId: `u${i}`,
    productId: "romper",
    productTitle: "Romper",
    size: "6M",
  }));

describe("outbound shipping rate", () => {
  it("is a flat $25 CAD to Canada on plans that pay for shipping", () => {
    expect(outboundShippingRate({ tierId: "essential", country: "CA" })).toEqual({
      kind: "flat",
      cents: 2500,
      country: "CA",
    });
    expect(flatOutboundShippingCents({ tierId: "signature", country: "Canada" })).toBe(2500);
  });

  it("stays at the label cost to the United States", () => {
    expect(outboundShippingRate({ tierId: "signature", country: "US" })).toEqual({
      kind: "label",
      country: "US",
    });
    expect(flatOutboundShippingCents({ tierId: "signature", country: "US" })).toBeNull();
  });

  it("is still included on Premier, in Canada too", () => {
    expect(outboundShippingRate({ tierId: "premier", country: "CA" })).toEqual({
      kind: "included",
    });
    expect(flatOutboundShippingCents({ tierId: "premier", country: "CA" })).toBeNull();
  });

  it.each([1, 10, 11, 25, 40])(
    "charges Canada $25 whatever the box holds (%i pieces)",
    (itemCount) => {
      expect(
        estimateOutboundShippingCents({ tierId: "essential", country: "CA", itemCount }),
      ).toBe(2500);
    },
  );

  it.each([
    [1, 2200],
    [15, 3200],
    [40, 4800],
  ])("keeps the US estimate brackets (%i pieces → %i)", (itemCount, cents) => {
    expect(
      estimateOutboundShippingCents({ tierId: "signature", country: "US", itemCount }),
    ).toBe(cents);
  });

  it("estimates nothing for Premier or an empty box", () => {
    expect(
      estimateOutboundShippingCents({ tierId: "premier", country: "CA", itemCount: 5 }),
    ).toBe(0);
    expect(
      estimateOutboundShippingCents({ tierId: "essential", country: "CA", itemCount: 0 }),
    ).toBe(0);
  });
});

describe("outboundShippingSummary", () => {
  const pick = (overrides: Partial<PickDoc>) =>
    ({
      tierId: "essential",
      status: "pending",
      shippingAddress: TORONTO,
      items: items(3),
      ...overrides,
    }) as PickDoc;

  it("shows the flat rate on a pending Canadian box, even one confirmed under the old estimate", () => {
    expect(outboundShippingSummary(pick({ estimatedShippingCents: 1400 }))).toEqual({
      kind: "flat",
      cents: 2500,
    });
  });

  it("shows what was charged once the box ships", () => {
    expect(
      outboundShippingSummary(pick({ status: "shipped", shippingCents: 1400 })),
    ).toEqual({ kind: "charged", cents: 1400 });
  });

  it("keeps showing an estimate for a pending US box", () => {
    expect(
      outboundShippingSummary(
        pick({ tierId: "signature", shippingAddress: SEATTLE, estimatedShippingCents: 2200 }),
      ),
    ).toEqual({ kind: "estimated", cents: 2200 });
  });

  it("shows Premier as included", () => {
    expect(outboundShippingSummary(pick({ tierId: "premier" }))).toEqual({
      kind: "included",
      cents: 0,
    });
  });
});

describe("shipping copy", () => {
  it("describes each plan's outbound shipping on the plan cards", () => {
    expect(outboundShippingShortNote("essential")).toBe("Outbound shipping $25 CAD flat");
    expect(outboundShippingShortNote("signature")).toBe(
      "Outbound shipping $25 CAD flat in Canada, at cost to the US",
    );
    expect(outboundShippingShortNote("premier")).toBe("Outbound shipping included");
  });

  it("spells out the rates on the account page", () => {
    expect(shippingCostNote("essential")).toBe(
      "Outbound shipping is a flat $25 CAD within Canada, charged when your box ships. Return labels are always on us.",
    );
    expect(shippingCostNote("signature")).toBe(
      "Outbound shipping is a flat $25 CAD within Canada and the label cost to the United States, charged when your box ships. Return labels are always on us.",
    );
  });

  it("lists the flat-rate destination first", () => {
    expect(describeOutboundRates(["US", "CA"])).toBe(
      "a flat $25 CAD within Canada and the label cost to the United States",
    );
  });
});

describe("shipping a box from admin", () => {
  const staff = {
    uid: "staff",
    email: "staff@example.com",
    name: "Staff",
    isAdmin: true,
    profile: null,
  } as SessionUser;

  async function ship(shippingCents?: number) {
    const res = await orderRoute(
      new Request("http://test.local", {
        method: "PATCH",
        body: JSON.stringify({ action: "ship", trackingNumber: "CA123456789", shippingCents }),
      }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    return { status: res.status, body: await res.json() };
  }

  beforeEach(() => {
    fakeDb.reset();
    vi.clearAllMocks();
    vi.mocked(getSessionUser).mockResolvedValue(staff);
    vi.mocked(chargeFee).mockResolvedValue({ invoiceId: "in_test" });
    fakeDb.seed("users", "member", { uid: "member", stripeCustomerId: "cus_test" });
  });

  it("charges a Canadian box the flat rate, whatever amount was sent", async () => {
    seedPick({ id: "p1", tierId: "essential", shippingAddress: TORONTO, items: items(12) });

    const res = await ship(1234);

    expect(res.status).toBe(200);
    expect(chargeFee).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ stripeCustomerId: "cus_test", amountCents: 2500 }),
    );
    expect(fakeDb.read<PickDoc>("picks", "p1")).toMatchObject({
      status: "shipped",
      shippingCents: 2500,
    });
  });

  it("charges a Canadian box without an amount being typed", async () => {
    seedPick({ id: "p1", tierId: "signature", shippingAddress: TORONTO, items: items(2) });

    expect((await ship()).status).toBe(200);
    expect(chargeFee).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 2500 }));
  });

  it("charges a US box the label cost admin enters", async () => {
    seedPick({ id: "p1", tierId: "signature", shippingAddress: SEATTLE, items: items(2) });

    await ship(3150);

    expect(chargeFee).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 3150 }));
    expect(fakeDb.read<PickDoc>("picks", "p1")?.shippingCents).toBe(3150);
  });

  it("still needs a label cost for a US box", async () => {
    seedPick({ id: "p1", tierId: "signature", shippingAddress: SEATTLE, items: items(2) });

    const res = await ship();

    expect(res.body.code).toBe("invalid_amount");
    expect(chargeFee).not.toHaveBeenCalled();
  });

  it("doesn't charge Premier", async () => {
    seedPick({ id: "p1", tierId: "premier", shippingAddress: TORONTO, items: items(2) });

    await ship(2500);

    expect(chargeFee).not.toHaveBeenCalled();
    expect(fakeDb.read<PickDoc>("picks", "p1")?.shippingCents).toBe(0);
  });
});

describe("box confirmation email", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("WAITLIST_FROM_EMAIL", "hello@example.com");
    fetchMock.mockReset().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function emailText(pick: Partial<PickDoc>): Promise<string> {
    await sendPickConfirmation({
      id: "p1",
      uid: "member",
      email: "member@example.com",
      cycleKey: "sub_1-0",
      tierId: "essential",
      itemLimit: 10,
      items: items(3),
      status: "pending",
      shippingAddress: TORONTO,
      createdAt: NOW,
      ...pick,
    });
    return JSON.parse(fetchMock.mock.calls[0][1].body).text as string;
  }

  it("tells a Canadian member the flat rate", async () => {
    const text = await emailText({ estimatedShippingCents: 2500 });
    expect(text).toContain(
      "Shipping is a flat $25.00 CAD, charged to your card when your box ships.",
    );
    expect(text).not.toContain("estimate");
  });

  it("still gives a US member an estimate", async () => {
    const text = await emailText({
      tierId: "signature",
      shippingAddress: SEATTLE,
      estimatedShippingCents: 2200,
    });
    expect(text).toContain("Estimated outbound shipping is $22.00 CAD");
  });
});
