import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "./support/fake-firestore";
import { DAY, NOW, seedPick, seedProduct, seedUnit } from "./support/fixtures";
import { POST as purchaseRoute } from "@/app/api/portal/picks/[id]/purchase/route";
import { POST as webhookRoute } from "@/app/api/stripe/webhook/route";
import { completeCheckoutSession, ensureStripeCustomer } from "@/lib/billing";
import { createProduct, getProduct, updateProduct } from "@/lib/db/products";
import { sendOverdueNotice, sendReturnLabel, sendReturnReminder } from "@/lib/email";
import { markReturned } from "@/lib/db/picks";
import {
  completePurchaseReturn,
  completePurchaseSession,
  purchasableItems,
} from "@/lib/purchases";
import { getSessionUser, type SessionUser } from "@/lib/session";
import type { PickDoc, PickItem, UnitDoc } from "@/lib/types";

const stripe = vi.hoisted(() => ({
  checkout: {
    sessions: {
      create: vi.fn(),
      listLineItems: vi.fn(),
      retrieve: vi.fn(),
    },
  },
  refunds: { list: vi.fn(), create: vi.fn() },
  webhooks: { constructEvent: vi.fn() },
}));

vi.mock("@/lib/firebase-admin", async () => {
  const { firebaseAdminMock } = await import("./support/fake-firestore");
  return firebaseAdminMock;
});
vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/billing", () => ({
  ensureStripeCustomer: vi.fn(),
  completeCheckoutSession: vi.fn(),
  syncSubscription: vi.fn(),
}));
vi.mock("@/lib/stripe", () => ({
  requireStripe: () => stripe,
  siteUrl: () => "https://shop.test",
}));

const UID = "member";
const SESSION = "cs_test_1";
const PRICE = 2500;

const member = {
  uid: UID,
  email: "member@example.com",
  name: "Member",
  isAdmin: false,
  profile: null,
} as SessionUser;

function item(unitId: string, overrides: Partial<PickItem> = {}): PickItem {
  return {
    unitId,
    productId: "romper",
    productTitle: "Romper",
    size: "6M",
    image: "https://img.test/romper.jpg",
    returnedAt: null,
    returnCondition: null,
    ...overrides,
  };
}

/** A shipped two-piece box of a style that's for sale at PRICE. */
function outBox(overrides: Partial<PickDoc> = {}) {
  seedProduct("romper", { purchasePriceCents: PRICE });
  seedUnit("u1", { status: "out", holderUid: UID, pickId: "p1" });
  seedUnit("u2", { status: "out", holderUid: UID, pickId: "p1" });
  return seedPick({
    id: "p1",
    uid: UID,
    status: "shipped",
    dueAt: NOW + 30 * DAY,
    items: [item("u1"), item("u2")],
    ...overrides,
  });
}

function pick(id = "p1"): PickDoc {
  const doc = fakeDb.read<PickDoc>("picks", id);
  if (!doc) throw new Error(`pick ${id} missing`);
  return doc;
}

function unit(id: string): UnitDoc {
  const doc = fakeDb.read<UnitDoc>("units", id);
  if (!doc) throw new Error(`unit ${id} missing`);
  return doc;
}

async function startCheckout(unitIds: unknown, id = "p1") {
  const res = await purchaseRoute(
    new Request("http://test.local", {
      method: "POST",
      body: JSON.stringify({ unitIds }),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { status: res.status, body: await res.json() };
}

function paidSession(
  overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  return {
    id: SESSION,
    payment_status: "paid",
    payment_intent: "pi_test_1",
    metadata: { kind: "purchase", uid: UID, pickId: "p1" },
    ...overrides,
  } as Stripe.Checkout.Session;
}

/** What Stripe reports was on the checkout: one line per unit. */
function paidFor(...unitIds: string[]) {
  stripe.checkout.sessions.listLineItems.mockResolvedValue({
    data: unitIds.map((unitId) => ({
      metadata: { unitId },
      amount_subtotal: PRICE,
      amount_total: PRICE,
    })),
  });
}

beforeEach(() => {
  fakeDb.reset();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.mocked(getSessionUser).mockResolvedValue(member);
  vi.mocked(ensureStripeCustomer).mockResolvedValue("cus_test");
  stripe.checkout.sessions.create.mockResolvedValue({
    url: "https://checkout.stripe.test/pay",
  });
  stripe.refunds.list.mockResolvedValue({ data: [] });
  stripe.refunds.create.mockResolvedValue({ id: "re_test_1" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("purchase price on a style", () => {
  it("stores the price in cents and takes a style off sale when cleared", async () => {
    const product = await createProduct({ title: "Romper", purchasePriceCents: 2499.6 });
    expect((await getProduct(product.id))?.purchasePriceCents).toBe(2500);

    await updateProduct(product.id, { purchasePriceCents: null });
    expect((await getProduct(product.id))?.purchasePriceCents).toBeNull();
  });

  it("leaves the price alone when an edit doesn't mention it", async () => {
    const product = await createProduct({ title: "Romper", purchasePriceCents: PRICE });

    await updateProduct(product.id, { title: "Striped romper" });

    expect((await getProduct(product.id))?.purchasePriceCents).toBe(PRICE);
  });

  it.each([0, 49, -100, Number.NaN])(
    "refuses a price of %s cents, which Stripe couldn't charge",
    async (cents) => {
      await expect(
        createProduct({ title: "Romper", purchasePriceCents: cents }),
      ).rejects.toMatchObject({ code: "invalid_purchase_price" });
    },
  );
});

describe("purchasableItems", () => {
  it("offers the pieces still out, at the style's price", async () => {
    const box = outBox();

    const items = await purchasableItems(box);

    expect(items.map((i) => [i.unitId, i.priceCents])).toEqual([
      ["u1", PRICE],
      ["u2", PRICE],
    ]);
  });

  it("leaves out pieces already returned or bought, and styles with no price", async () => {
    seedProduct("dress");
    const box = outBox({
      items: [
        item("u1", { returnedAt: NOW }),
        item("u2", { purchasedAt: NOW }),
        item("u3", { productId: "dress" }),
        item("u4"),
      ],
    });

    expect((await purchasableItems(box)).map((i) => i.unitId)).toEqual(["u4"]);
  });

  it.each(["pending", "returned", "cancelled"] as const)(
    "offers nothing from a %s box",
    async (status) => {
      expect(await purchasableItems(outBox({ status }))).toEqual([]);
    },
  );
});

describe("starting a purchase checkout", () => {
  it("sends the member to a one-off card payment for the chosen pieces", async () => {
    outBox();

    const res = await startCheckout(["u2"]);

    expect(res.body).toEqual({ ok: true, url: "https://checkout.stripe.test/pay" });
    expect(stripe.checkout.sessions.create).toHaveBeenCalledOnce();
    const params = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(params).toMatchObject({
      mode: "payment",
      customer: "cus_test",
      payment_method_types: ["card"],
      metadata: { kind: "purchase", uid: UID, pickId: "p1" },
      success_url: "https://shop.test/portal/orders?purchase={CHECKOUT_SESSION_ID}",
      cancel_url: "https://shop.test/portal/orders",
    });
    expect(params.line_items).toEqual([
      {
        quantity: 1,
        metadata: { unitId: "u2" },
        price_data: {
          currency: "cad",
          unit_amount: PRICE,
          product_data: {
            name: "Romper (size 6M)",
            images: ["https://img.test/romper.jpg"],
          },
        },
      },
    ]);
    // Short-lived, so an abandoned checkout can't be paid days later.
    expect(params.expires_at).toBeGreaterThanOrEqual(NOW / 1000 + 30 * 60);
    expect(params.expires_at).toBeLessThan(NOW / 1000 + 60 * 60);
  });

  it("records nothing until Stripe confirms the payment", async () => {
    outBox();

    await startCheckout(["u1", "u2"]);

    expect(pick().items.every((i) => !i.purchasedAt)).toBe(true);
    expect(unit("u1").status).toBe("out");
  });

  it("charges each chosen piece once even if it's sent twice", async () => {
    outBox();

    await startCheckout(["u1", "u1"]);

    expect(stripe.checkout.sessions.create.mock.calls[0][0].line_items).toHaveLength(1);
  });

  it.each([
    ["nothing chosen", []],
    ["a malformed selection", "u1"],
  ])("refuses %s", async (_label, unitIds) => {
    outBox();

    const res = await startCheckout(unitIds);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("nothing_selected");
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("refuses a style that isn't for sale", async () => {
    outBox();
    seedProduct("romper");

    const res = await startCheckout(["u1"]);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("item_unavailable");
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("refuses a piece that has already come back", async () => {
    outBox();
    await markReturned("p1", { unitIds: ["u1"] });

    const res = await startCheckout(["u1", "u2"]);

    expect(res.body.code).toBe("item_unavailable");
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("refuses a piece that isn't in the box", async () => {
    outBox();
    seedUnit("stray", { status: "available" });

    expect((await startCheckout(["stray"])).body.code).toBe("item_unavailable");
  });

  it.each(["pending", "returned", "cancelled"] as const)(
    "refuses a %s box",
    async (status) => {
      outBox({ status });

      const res = await startCheckout(["u1"]);

      expect(res.body.code).toBe("not_purchasable");
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    },
  );

  it("treats another member's box as not found", async () => {
    outBox({ uid: "someone-else" });

    const res = await startCheckout(["u1"]);

    expect(res.status).toBe(404);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("needs a signed-in member", async () => {
    outBox();
    vi.mocked(getSessionUser).mockResolvedValue(null);

    expect((await startCheckout(["u1"])).status).toBe(401);
  });
});

describe("completing a paid purchase", () => {
  it("marks the pieces purchased and sells their units", async () => {
    outBox();
    paidFor("u1");

    const outcome = await completePurchaseSession(paidSession());

    expect(outcome?.purchased.map((i) => i.unitId)).toEqual(["u1"]);
    expect(outcome?.refundedCents).toBe(0);
    expect(pick().status).toBe("shipped");
    expect(pick().items[0]).toMatchObject({
      purchasedAt: NOW,
      purchasePriceCents: PRICE,
      purchaseSessionId: SESSION,
    });
    expect(unit("u1").status).toBe("sold");
    expect(unit("u2").status).toBe("out");
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it("closes the box when every piece is bought", async () => {
    outBox();
    paidFor("u1", "u2");

    await completePurchaseSession(paidSession());

    expect(pick()).toMatchObject({ status: "returned", returnedAt: NOW });
  });

  it("applies once when both the webhook and the return page run", async () => {
    outBox();
    paidFor("u1");

    await completePurchaseSession(paidSession());
    vi.setSystemTime(NOW + DAY);
    const replay = await completePurchaseSession(paidSession());

    expect(replay?.purchased.map((i) => i.unitId)).toEqual(["u1"]);
    expect(pick().items[0].purchasedAt).toBe(NOW);
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it.each([
    ["an unpaid session", { payment_status: "unpaid" as const }],
    ["a membership checkout", { metadata: { uid: UID, tierId: "essential" } }],
    ["a session with no order", { metadata: { kind: "purchase", uid: UID } }],
  ])("ignores %s", async (_label, overrides) => {
    outBox();
    paidFor("u1");

    expect(await completePurchaseSession(paidSession(overrides))).toBeNull();
    expect(unit("u1").status).toBe("out");
    expect(stripe.checkout.sessions.listLineItems).not.toHaveBeenCalled();
  });

  it("refunds a piece that was received back while the member was paying", async () => {
    outBox();
    await markReturned("p1", { unitIds: ["u1"] });
    paidFor("u1", "u2");

    const outcome = await completePurchaseSession(paidSession());

    expect(outcome?.purchased.map((i) => i.unitId)).toEqual(["u2"]);
    expect(outcome?.refundedCents).toBe(PRICE);
    expect(unit("u1").status).toBe("cleaning");
    expect(unit("u2").status).toBe("sold");
    expect(stripe.refunds.create).toHaveBeenCalledExactlyOnceWith(
      {
        payment_intent: "pi_test_1",
        amount: PRICE,
        metadata: { kind: "purchase", pickId: "p1", purchaseSessionId: SESSION },
      },
      { idempotencyKey: `purchase-refund-${SESSION}` },
    );
  });

  it("refunds a second checkout that pays for the same piece", async () => {
    outBox();
    paidFor("u1");
    await completePurchaseSession(paidSession());

    const second = await completePurchaseSession(
      paidSession({ id: "cs_test_2", payment_intent: "pi_test_2" }),
    );

    expect(second).toEqual({ purchased: [], refundedCents: PRICE });
    expect(stripe.refunds.create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ payment_intent: "pi_test_2", amount: PRICE }),
      { idempotencyKey: "purchase-refund-cs_test_2" },
    );
    expect(pick().items[0].purchaseSessionId).toBe(SESSION);
  });

  it("doesn't refund again when the session is replayed later", async () => {
    outBox();
    await markReturned("p1", { unitIds: ["u1"] });
    paidFor("u1");
    stripe.refunds.list.mockResolvedValue({
      data: [{ id: "re_test_1", metadata: { purchaseSessionId: SESSION } }],
    });

    const outcome = await completePurchaseSession(paidSession());

    expect(outcome?.refundedCents).toBe(PRICE);
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it("refunds a line it can't match to a garment rather than keep the money", async () => {
    outBox();
    stripe.checkout.sessions.listLineItems.mockResolvedValue({
      data: [{ metadata: null, amount_subtotal: PRICE, amount_total: PRICE }],
    });

    const outcome = await completePurchaseSession(paidSession());

    expect(outcome).toEqual({ purchased: [], refundedCents: PRICE });
    expect(stripe.refunds.create).toHaveBeenCalledOnce();
    expect(unit("u1").status).toBe("out");
  });
});

describe("returning from checkout", () => {
  it("applies the member's own paid purchase", async () => {
    outBox();
    paidFor("u1");
    stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession());

    const outcome = await completePurchaseReturn(SESSION, UID);

    expect(outcome?.purchased.map((i) => i.unitId)).toEqual(["u1"]);
    expect(unit("u1").status).toBe("sold");
  });

  it("ignores a session that belongs to someone else", async () => {
    outBox();
    paidFor("u1");
    stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession());

    expect(await completePurchaseReturn(SESSION, "someone-else")).toBeNull();
    expect(unit("u1").status).toBe("out");
  });
});

describe("emails after a purchase", () => {
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

  const sentText = () => JSON.parse(fetchMock.mock.calls[0][1].body).text as string;

  /** A box where the member bought the first piece and still has the second. */
  function boughtOne(): PickDoc {
    return {
      ...outBox(),
      items: [
        item("u1", { productTitle: "Bought romper", purchasedAt: NOW }),
        item("u2", { productTitle: "Rented romper" }),
      ],
    };
  }

  it("leaves bought pieces out of the return reminder", async () => {
    await sendReturnReminder(boughtOne());

    expect(sentText()).toContain("Rented romper");
    expect(sentText()).not.toContain("Bought romper");
  });

  it("leaves bought pieces out of the return label email", async () => {
    await sendReturnLabel({
      pick: boughtOne(),
      to: "member@example.com",
      label: { filename: "label.pdf", content: "JVBERi0=" },
    });

    expect(sentText()).toContain("Rented romper");
    expect(sentText()).not.toContain("Bought romper");
  });

  it("leaves bought pieces out of the overdue notice", async () => {
    await sendOverdueNotice(boughtOne());

    expect(sentText()).not.toContain("Bought romper");
  });
});

describe("stripe webhook", () => {
  async function deliver(session: Stripe.Checkout.Session) {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    stripe.webhooks.constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: session },
    });
    return webhookRoute(
      new Request("http://test.local", {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: "{}",
      }),
    );
  }

  it("records a purchase checkout without treating it as a signup", async () => {
    outBox();
    paidFor("u1");

    const res = await deliver(paidSession());

    expect(res.status).toBe(200);
    expect(unit("u1").status).toBe("sold");
    expect(completeCheckoutSession).not.toHaveBeenCalled();
  });

  it("still hands membership checkouts to the subscription sync", async () => {
    const session = paidSession({ metadata: { uid: UID, tierId: "essential" } });

    await deliver(session);

    expect(completeCheckoutSession).toHaveBeenCalledExactlyOnceWith(session);
    expect(stripe.checkout.sessions.listLineItems).not.toHaveBeenCalled();
  });
});
