import {
  expect,
  test,
  type APIRequestContext,
  type Frame,
  type Page,
} from "@playwright/test";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import Stripe from "stripe";
import type { PickDoc, ProductDoc, UnitDoc } from "../../src/lib/types";
import { BASE_URL, PROJECT_ID, requireE2eEnv, SEED, WEBHOOK_SECRET } from "./env";

const env = requireE2eEnv();
const stripe = new Stripe(env.stripeKey);

/**
 * Stripe's hosted Checkout page runs bot protection that silently blocks
 * automated payments from CI runners, so CI completes each payment through the
 * Stripe API instead. Set E2E_CHECKOUT_UI=1 to drive the page anyway.
 */
const driveCheckoutPage = !process.env.CI || process.env.E2E_CHECKOUT_UI === "1";

const ADDRESS = {
  name: "E2E Parent",
  line1: "1 Main St",
  city: "Toronto",
  province: "ON",
  postalCode: "M5V 1A1",
  phone: "416 555 0123",
};

/** Flat outbound shipping within Canada, in CAD cents (RULES.flatOutboundShippingCents). */
const CANADA_SHIPPING_CENTS = 2500;
/** What staff price the seeded style at for members to buy. */
const PURCHASE_PRICE = { dollars: "30", cents: 3000, label: "$30.00 CAD" };

/**
 * One member's whole journey, in order: subscribe, confirm a box at the flat
 * Canadian shipping rate, have staff ship it, buy the piece instead of
 * returning it, then reset the order the way staff do after testing. Each
 * test picks up where the last left off, in the same signed-in browser.
 */
test.describe.configure({ mode: "serial" });

let page: Page;
let adminApp: App;
let db: Firestore;
let uid = "";
let customerToCleanUp: string | null = null;
let pickId = "";
let unitId = "";

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  // The suite's own view of the emulator, for setup and for checking what the
  // app wrote. The app under test never sees this.
  adminApp = initializeApp({ projectId: PROJECT_ID }, "e2e-spec");
  db = getFirestore(adminApp);
});

test.afterAll(async () => {
  await page?.close();
  if (adminApp) await deleteApp(adminApp);
  // Deleting the test customer also cancels its subscription.
  if (customerToCleanUp) await stripe.customers.del(customerToCleanUp);
});

test("a visitor browses the closet, builds a box, and subscribes", async ({
  request,
}) => {
  const email = `e2e+${Date.now()}@example.com`;
  const startedAt = Math.floor(Date.now() / 1000) - 60;

  await test.step("browse the public closet", async () => {
    await page.goto("/closet");
    await page.getByRole("link", { name: SEED.title }).first().click();
    await expect(
      page.getByRole("heading", { level: 1, name: SEED.title }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Sign up to add" }).click();
  });

  await test.step("create an account", async () => {
    await page.getByLabel("Name", { exact: true }).fill("E2E Parent");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("e2e-password");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(new RegExp(`/portal/item/${SEED.productId}$`));
  });

  await test.step("add a piece to the box", async () => {
    await page.getByRole("button", { name: SEED.size, exact: true }).click();
    await page
      .getByRole("button", { name: `Add size ${SEED.size} to box` })
      .click();
    const main = page.getByRole("main");
    await expect(main.getByText(/In your box · saved for/)).toBeVisible();

    await main.getByRole("link", { name: "Review box" }).click();
    await expect(page.getByRole("heading", { name: "My box" })).toBeVisible();
    await expect(page.getByText(SEED.title)).toBeVisible();
    await expect(page.getByText("1 piece picked", { exact: true })).toBeVisible();
  });

  await test.step("pick the plan that fits the box", async () => {
    await page
      .getByRole("main")
      .getByRole("link", { name: "Choose a plan" })
      .click();
    await expect(page).toHaveURL(/\/subscribe$/);
    await expect(page.getByText(/Your box has 1 piece\. Essential\b/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Fits your box Essential\b/ }),
    ).toHaveAttribute("aria-pressed", "true");
    // Essential ships to Canada only, at the flat rate.
    await expect(
      page.getByRole("button", { name: /^Fits your box Essential\b/ }),
    ).toContainText("Outbound shipping $25 CAD flat");

    const [checkout] = await Promise.all([
      page.waitForResponse("**/api/stripe/checkout"),
      page.getByRole("button", { name: "Continue to checkout" }).click(),
    ]);
    // On success the page leaves for Stripe and the body is gone; on failure
    // it stays put, so the error message is still readable.
    if (checkout.status() !== 200) {
      throw new Error(`Checkout failed (${checkout.status()}): ${await checkout.text()}`);
    }
  });

  const session = await test.step("land on a test-mode Stripe Checkout for Essential", async () => {
    const created = await checkoutSessionOnPage();
    customerToCleanUp = idOf(created.customer);
    uid = created.metadata?.uid ?? "";

    expect(created.mode).toBe("subscription");
    expect(created.line_items?.data[0]?.price?.id).toBe(env.prices.essential);
    expect(created.metadata).toMatchObject({ tierId: "essential" });
    expect(uid).toBeTruthy();
    expect(created.shipping_address_collection?.allowed_countries).toEqual(["CA"]);
    expect(created.success_url).toBe(`${BASE_URL}/portal?welcome=1`);
    return created;
  });

  const completed = await test.step(
    driveCheckoutPage ? "pay on the Checkout page with the 4242 card" : "pay through the Stripe API",
    async () => {
      if (!driveCheckoutPage) {
        const event = await subscribeWithoutCheckoutPage(session);
        await page.goto(session.success_url as string);
        return event;
      }

      await payForSubscription(page);
      try {
        await page.waitForURL(/\/portal\?welcome=1$/, { timeout: 90_000 });
      } catch (err) {
        throw new Error(`Stripe never redirected back. ${await describeCheckout(page)}`, {
          cause: err,
        });
      }
      return findCompletedEvent(session.id, startedAt);
    },
  );

  await test.step("Stripe's webhook activates the membership", async () => {
    await deliverWebhook(request, completed);

    await page.reload();
    await expect(page.getByText("You're in.")).toBeVisible();
    await expect(page.getByText("Essential · 1 of 10 picked")).toBeVisible();
  });

  await test.step("the box carries over and is ready to confirm", async () => {
    await page.goto("/portal/box");
    await expect(page.getByText(SEED.title)).toBeVisible();
    await expect(page.getByText("1 of 10 items")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirm my box" }),
    ).toBeEnabled();
  });
});

test("the member confirms the box at the flat Canadian shipping rate", async () => {
  await test.step("the box shows $25 shipping, not an estimate", async () => {
    await page.goto("/portal/box");
    await expect(
      page.getByText("Shipping $25.00 CAD flat rate, charged when your box ships."),
    ).toBeVisible();
    await expect(page.getByText(/Estimated shipping/)).toHaveCount(0);
  });

  await test.step("confirm the box", async () => {
    await page.getByRole("button", { name: "Confirm my box" }).click();
    await page.waitForURL(/\/portal\/orders\?confirmed=1$/);
    await expect(page.getByText("Box confirmed.")).toBeVisible();
    await expect(
      page.getByText("Flat rate, charged to the card on file when your box ships."),
    ).toBeVisible();
    await expect(page.getByText("$25.00 CAD", { exact: true })).toBeVisible();
  });

  await test.step("the order records the flat rate", async () => {
    const picks = await db.collection("picks").where("uid", "==", uid).get();
    expect(picks.size).toBe(1);
    const pick = picks.docs[0].data() as PickDoc;
    pickId = picks.docs[0].id;
    unitId = pick.items[0]?.unitId ?? "";

    expect(pick.status).toBe("pending");
    expect(pick.estimatedShippingCents).toBe(CANADA_SHIPPING_CENTS);
    expect(pick.shippingAddress?.country).toBe("CA");
    expect(unitId).toBeTruthy();
  });
});

test("staff price the style for sale and ship the box at the flat rate", async () => {
  await test.step("make the test account an admin", async () => {
    // Staff test from admin accounts; that's also what makes the order
    // resettable at the end.
    await db.collection("users").doc(uid).set({ isAdmin: true }, { merge: true });
  });

  await test.step("set a purchase price on the style", async () => {
    await page.goto(`/admin/products/${SEED.productId}`);
    await page.getByLabel("Purchase price (CAD $)").fill(PURCHASE_PRICE.dollars);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved.", { exact: true })).toBeVisible();

    const product = (await db.collection("products").doc(SEED.productId).get()).data() as ProductDoc;
    expect(product.purchasePriceCents).toBe(PURCHASE_PRICE.cents);
  });

  await test.step("ship with the flat $25 charge and no amount to type", async () => {
    await page.goto(`/admin/orders/${pickId}`);
    await expect(page.getByText("Admin test order", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Shipping (CAD $)")).toHaveCount(0);

    await page.getByLabel("Tracking number").fill("E2E123456789CA");
    await page.getByRole("button", { name: "Ship and charge $25.00 CAD" }).click();
    await expect(page.getByRole("heading", { name: "Ship this box" })).toHaveCount(0, {
      timeout: 60_000,
    });

    const pick = await readPick();
    expect(pick).toMatchObject({ status: "shipped", shippingCents: CANADA_SHIPPING_CENTS });
  });

  await test.step("Stripe billed the member $25 CAD for shipping", async () => {
    const { data } = await stripe.invoices.list({ customer: customerToCleanUp ?? "", limit: 20 });
    const invoice = data.find((i) => i.metadata?.pickId === pickId);
    expect(invoice, "shipping invoice for this order").toBeTruthy();
    expect(invoice).toMatchObject({
      status: "paid",
      currency: "cad",
      amount_paid: CANADA_SHIPPING_CENTS,
      metadata: { kind: "shipping" },
    });
  });
});

test("the member buys the piece instead of returning it", async ({ request }) => {
  const startedAt = Math.floor(Date.now() / 1000) - 60;

  await test.step("choose the piece to keep", async () => {
    await page.goto("/portal/orders");
    await page.getByText("Want to keep something? Buy pieces from this box").click();
    const choice = page.getByRole("checkbox", { name: new RegExp(SEED.title) });
    await expect(page.getByText(PURCHASE_PRICE.label, { exact: true })).toBeVisible();
    await choice.check();

    const [started] = await Promise.all([
      page.waitForResponse(`**/api/portal/picks/${pickId}/purchase`),
      page.getByRole("button", { name: `Buy 1 piece for ${PURCHASE_PRICE.label}` }).click(),
    ]);
    if (started.status() !== 200) {
      throw new Error(`Purchase checkout failed (${started.status()}): ${await started.text()}`);
    }
  });

  const session = await test.step("land on a one-off card payment for that piece", async () => {
    const created = await checkoutSessionOnPage();

    expect(created.mode).toBe("payment");
    expect(created.payment_method_types).toEqual(["card"]);
    expect(created.metadata).toEqual({ kind: "purchase", uid, pickId });
    expect(created.currency).toBe("cad");
    expect(created.amount_total).toBe(PURCHASE_PRICE.cents);
    expect(created.line_items?.data).toHaveLength(1);
    expect(created.line_items?.data[0]?.metadata).toEqual({ unitId });
    expect(created.success_url).toContain("/portal/orders?purchase=");
    return created;
  });

  await test.step("nothing is recorded before the payment goes through", async () => {
    expect((await readUnit()).status).toBe("out");
  });

  await test.step(
    driveCheckoutPage ? "pay on the Checkout page with the 4242 card" : "pay through the Stripe API",
    async () => {
      if (!driveCheckoutPage) {
        await deliverWebhook(request, await purchaseWithoutCheckoutPage(session));
        await page.goto("/portal/orders");
        return;
      }

      await payForPurchase(page);
      try {
        await page.waitForURL(/\/portal\/orders\?purchase=cs_test_/, { timeout: 90_000 });
      } catch (err) {
        throw new Error(`Stripe never redirected back. ${await describeCheckout(page)}`, {
          cause: err,
        });
      }
      // The return page records the purchase without waiting for Stripe.
      await expect(page.getByText("That piece is yours.")).toBeVisible();

      // Stripe's webhook then arrives for the same checkout and changes nothing.
      await deliverWebhook(request, await findCompletedEvent(session.id, startedAt));
      await page.goto("/portal/orders");
    },
  );

  await test.step("the piece is the member's, and nothing is left to return", async () => {
    await expect(page.getByText(`Size ${SEED.size} · purchased`)).toBeVisible();
    await expect(page.getByText("Purchased", { exact: true })).toBeVisible();
    await expect(page.getByText(/Want to keep something\?/)).toHaveCount(0);

    const pick = await readPick();
    expect(pick.status).toBe("returned");
    expect(pick.items).toHaveLength(1);
    expect(pick.items[0]).toMatchObject({
      purchasePriceCents: PURCHASE_PRICE.cents,
      purchaseSessionId: session.id,
    });
    expect(pick.items[0]?.purchasedAt).toBeGreaterThan(0);
  });

  await test.step("the garment is sold out of inventory", async () => {
    expect(await readUnit()).toMatchObject({ status: "sold", pickId, holderUid: null });

    await page.goto("/admin/units?status=sold");
    await expect(page.getByText(new RegExp(`^E2E-${SEED.size}-\\d+$`))).toHaveCount(1);
    await page.goto(`/admin/orders/${pickId}`);
    await expect(page.getByRole("heading", { name: "Purchased" })).toBeVisible();
  });
});

test("staff reset the test order and the garment goes back in the closet", async () => {
  await test.step("reset the order from the admin screen", async () => {
    await page.goto(`/admin/orders/${pickId}`);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Reset test order" }).click();

    await page.waitForURL(/\/admin\/orders\?reset=1&skipped=0$/);
    await expect(
      page.getByRole("status").filter({ hasText: "Test order reset." }),
    ).toContainText("Test order reset. 1 garment is back in the closet.");
  });

  await test.step("the garment is available again and the order is gone", async () => {
    expect(await readUnit()).toMatchObject({
      status: "available",
      condition: "excellent",
      holderUid: null,
      pickId: null,
    });
    expect((await db.collection("picks").doc(pickId).get()).exists).toBe(false);

    await page.goto("/admin/products");
    await expect(
      page.getByRole("link", { name: new RegExp(SEED.title) }),
    ).toContainText(`${SEED.units} available`);
  });

  await test.step("the order is gone from the member's rentals", async () => {
    await page.goto("/portal/orders");
    await expect(page.getByText("No rentals yet.", { exact: false })).toBeVisible();
  });
});

async function readPick(): Promise<PickDoc> {
  const snap = await db.collection("picks").doc(pickId).get();
  if (!snap.exists) throw new Error(`Order ${pickId} is missing`);
  return snap.data() as PickDoc;
}

async function readUnit(): Promise<UnitDoc> {
  const snap = await db.collection("units").doc(unitId).get();
  if (!snap.exists) throw new Error(`Unit ${unitId} is missing`);
  return snap.data() as UnitDoc;
}

/** Waits for the browser to reach Stripe Checkout and returns that session. */
async function checkoutSessionOnPage(): Promise<Stripe.Checkout.Session> {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  const id = page.url().match(/cs_test_[A-Za-z0-9]+/)?.[0];
  expect(id, "Checkout should be a test-mode session").toBeTruthy();
  return stripe.checkout.sessions.retrieve(id as string, {
    expand: ["line_items"],
  });
}

/**
 * Stripe's hosted Checkout comes in two layouts. The older one puts the form
 * on the page itself with ids like `#shippingName`; the newer one renders it
 * in a Stripe Elements iframe with ids like `#shippingAddress-nameInput`.
 * Selectors list both, newer first.
 */
const CHECKOUT = {
  submit:
    '[data-testid="payment-form-submit-button"], [data-testid="hosted-payment-submit-button"]',
  shippingName: "#shippingAddress-nameInput, #shippingName",
  shippingCountry: "#shippingAddress-countryInput, #shippingCountry",
  addressLine1: "#shippingAddress-addressLine1Input, #shippingAddressLine1",
  city: "#shippingAddress-localityInput, #shippingLocality",
  province: "#shippingAddress-administrativeAreaInput, #shippingAdministrativeArea",
  postalCode: "#shippingAddress-postalCodeInput, #shippingPostalCode",
  phone: "#shippingAddress-phoneInput, #phoneNumber",
  cardNumber: "#payment-numberInput, #cardNumber",
  cardExpiry: "#payment-expiryInput, #cardExpiry",
  cardCvc: "#payment-cvcInput, #cardCvc",
  billingName: "#payment-nameInput, #billingName",
  billingCountry: "#payment-countryInput, #billingCountry",
  billingPostalCode: "#payment-postalCodeInput, #billingPostalCode",
};

/** The frame holding Checkout's payment form, in whichever layout Stripe served. */
async function checkoutForm(page: Page): Promise<Frame> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const found = await frame
        .locator(CHECKOUT.submit)
        .count()
        .catch(() => 0);
      if (found) return frame;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Stripe Checkout's payment form never loaded. ${await describeCheckout(page)}`);
}

/** Fills Stripe's hosted subscription Checkout with a Canadian address and the 4242 card. */
async function payForSubscription(page: Page) {
  const form = await checkoutForm(page);
  await form.locator(CHECKOUT.shippingName).fill(ADDRESS.name);

  // Locked to Canada (and disabled) when the plan only ships there.
  const country = form.locator(CHECKOUT.shippingCountry);
  if ((await country.isVisible()) && (await country.isEnabled())) {
    await country.selectOption("CA");
  }

  // The address box is an autocomplete; skip the suggestions and type it all.
  const line1 = form.locator(CHECKOUT.addressLine1);
  await line1.fill(ADDRESS.line1);
  await enterAddressManually(page);
  await line1.fill(ADDRESS.line1);
  await form.locator(CHECKOUT.city).fill(ADDRESS.city);
  await form.locator(CHECKOUT.province).selectOption(ADDRESS.province);
  await form.locator(CHECKOUT.postalCode).fill(ADDRESS.postalCode);
  await form.locator(CHECKOUT.phone).fill(ADDRESS.phone);

  await fillTestCard(form);
  await form.locator(CHECKOUT.submit).click();
}

/**
 * Clicks "Enter address manually" once Checkout offers it. In the newer
 * layout it sits in a separate suggestions frame and appears after typing.
 */
async function enterAddressManually(page: Page) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    for (const frame of page.frames()) {
      const manual = frame.getByText(/enter address manually/i).first();
      if (await manual.isVisible().catch(() => false)) {
        await manual.click();
        return;
      }
    }
    await page.waitForTimeout(500);
  }
}

/** Pays a one-off garment purchase on Stripe's hosted Checkout with the 4242 card. */
async function payForPurchase(page: Page) {
  const form = await checkoutForm(page);
  await fillTestCard(form);
  await form.locator(CHECKOUT.submit).click();
}

async function fillTestCard(form: Frame) {
  // With several payment methods, card sits in an accordion row. In the older
  // layout it's covered by a transparent "Pay with card" button that
  // Playwright never considers visible, so the click is forced, landing where
  // a user's would. A card-only Checkout shows the card fields straight away.
  const card = form
    .getByRole("button", { name: "Card", exact: true })
    .or(form.getByText("Card", { exact: true }))
    .first();
  if (await card.isVisible()) await card.click({ force: true });

  await form.locator(CHECKOUT.cardNumber).fill("4242 4242 4242 4242");
  await form.locator(CHECKOUT.cardExpiry).fill("12 / 34");
  await form.locator(CHECKOUT.cardCvc).fill("123");

  const billingName = form.locator(CHECKOUT.billingName);
  if (await billingName.isVisible()) await billingName.fill(ADDRESS.name);

  // A payment-only Checkout asks for the card's country, then its postal code.
  const billingCountry = form.locator(CHECKOUT.billingCountry);
  if ((await billingCountry.isVisible()) && (await billingCountry.isEnabled())) {
    await billingCountry.selectOption("CA");
  }
  const billingPostalCode = form.locator(CHECKOUT.billingPostalCode);
  if (await billingPostalCode.isVisible()) await billingPostalCode.fill(ADDRESS.postalCode);
}

/** What Checkout is showing instead of redirecting, for the failure message. */
async function describeCheckout(page: Page): Promise<string> {
  const errors: string[] = [];
  for (const frame of page.frames()) {
    const texts = await frame
      .locator('[role="alert"], .FieldError, .p-FieldError')
      .allInnerTexts()
      .catch(() => [] as string[]);
    errors.push(...texts.filter((t) => t.trim()));
  }
  return [
    `Still on ${page.url()}.`,
    errors.length
      ? `Messages on the page: ${errors.join(" | ")}`
      : "No error messages on the page (bot protection blocks silently).",
  ].join(" ");
}

/**
 * Does what a successful subscription Checkout does, through the API:
 * subscribes the session's customer to the session's price with the 4242 test
 * card, carrying the same metadata, and returns the `checkout.session.completed`
 * event Stripe would send. The open session is expired so it can't be paid later.
 */
async function subscribeWithoutCheckoutPage(
  session: Stripe.Checkout.Session,
): Promise<Stripe.Event> {
  const customer = idOf(session.customer);
  const priceId = session.line_items?.data[0]?.price?.id;
  if (!customer || !priceId) throw new Error("Checkout session has no customer or price");

  const card = await stripe.paymentMethods.attach("pm_card_visa", { customer });
  const subscription = await stripe.subscriptions.create({
    customer,
    items: [{ price: priceId }],
    default_payment_method: card.id,
    metadata: session.metadata ?? {},
  });
  expect(subscription.status).toBe("active");
  await stripe.checkout.sessions.expire(session.id);

  return completedEvent({
    ...session,
    line_items: undefined,
    status: "complete",
    payment_status: "paid",
    subscription: subscription.id,
    // Checkout collects the phone (phone_number_collection) into
    // customer_details, which is where the webhook reads it from.
    customer_details: {
      ...session.customer_details,
      name: ADDRESS.name,
      phone: "+14165550123",
    },
    collected_information: {
      shipping_details: {
        name: ADDRESS.name,
        address: {
          line1: ADDRESS.line1,
          line2: null,
          city: ADDRESS.city,
          state: ADDRESS.province,
          postal_code: ADDRESS.postalCode,
          country: "CA",
        },
      },
    },
  });
}

/**
 * Does what a paid purchase Checkout does, through the API: takes the
 * session's total from the 4242 test card and returns the
 * `checkout.session.completed` event Stripe would send. The app still reads
 * the line items from the real session, so the unit ids come from Stripe.
 */
async function purchaseWithoutCheckoutPage(
  session: Stripe.Checkout.Session,
): Promise<Stripe.Event> {
  const payment = await stripe.paymentIntents.create({
    amount: session.amount_total ?? 0,
    currency: session.currency ?? "cad",
    customer: idOf(session.customer) ?? undefined,
    payment_method: "pm_card_visa",
    payment_method_types: ["card"],
    confirm: true,
    metadata: session.metadata ?? {},
  });
  expect(payment.status).toBe("succeeded");
  await stripe.checkout.sessions.expire(session.id);

  return completedEvent({
    ...session,
    line_items: undefined,
    status: "complete",
    payment_status: "paid",
    payment_intent: payment.id,
  });
}

function completedEvent(object: unknown): Stripe.Event {
  return {
    id: `evt_e2e_${Date.now()}`,
    object: "event",
    type: "checkout.session.completed",
    api_version: null,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: { object },
  } as unknown as Stripe.Event;
}

/** The real `checkout.session.completed` event for a session paid on the page. */
async function findCompletedEvent(sessionId: string, since: number): Promise<Stripe.Event> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const { data } = await stripe.events.list({
      type: "checkout.session.completed",
      created: { gte: since },
      limit: 50,
    });
    const event = data.find(
      (e) => (e.data.object as Stripe.Checkout.Session).id === sessionId,
    );
    if (event) return event;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Stripe never reported checkout.session.completed for ${sessionId}`);
}

/**
 * Posts the event to the app's webhook, signed the way Stripe signs it. A CI
 * runner has no public URL for Stripe to call, so the suite does the delivery;
 * the handler still verifies the signature and reads from Stripe as it does in
 * production.
 */
async function deliverWebhook(request: APIRequestContext, event: Stripe.Event) {
  const payload = JSON.stringify(event);
  const res = await request.post("/api/stripe/webhook", {
    data: payload,
    headers: {
      "content-type": "application/json",
      "stripe-signature": stripe.webhooks.generateTestHeaderString({
        payload,
        secret: WEBHOOK_SECRET,
      }),
    },
  });
  expect(res.status(), await res.text()).toBe(200);
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
