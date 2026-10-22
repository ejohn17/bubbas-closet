import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import Stripe from "stripe";
import { BASE_URL, requireE2eEnv, SEED, WEBHOOK_SECRET } from "./env";

const env = requireE2eEnv();
const stripe = new Stripe(env.stripeKey);

/**
 * Stripe's hosted Checkout page runs bot protection that silently blocks
 * automated payments from CI runners, so CI completes the purchase through the
 * Stripe API instead. Set E2E_CHECKOUT_UI=1 to drive the page anyway.
 */
const driveCheckoutPage = !process.env.CI || process.env.E2E_CHECKOUT_UI === "1";

const ADDRESS = {
  name: "E2E Parent",
  line1: "1 Main St",
  city: "Toronto",
  province: "ON",
  postalCode: "M5V 1A1",
};

let customerToCleanUp: string | null = null;

test.afterAll(async () => {
  // Deleting the test customer also cancels its subscription.
  if (customerToCleanUp) await stripe.customers.del(customerToCleanUp);
});

test("a visitor browses the closet, builds a box, and subscribes", async ({
  page,
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
    await expect(page.getByText(/Your box has 1 piece\. Essential/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Fits your box Essential/ }),
    ).toHaveAttribute("aria-pressed", "true");

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
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
    const id = page.url().match(/cs_test_[A-Za-z0-9]+/)?.[0];
    expect(id, "Checkout should be a test-mode session").toBeTruthy();

    const created = await stripe.checkout.sessions.retrieve(id as string, {
      expand: ["line_items"],
    });
    customerToCleanUp = idOf(created.customer);

    expect(created.mode).toBe("subscription");
    expect(created.line_items?.data[0]?.price?.id).toBe(env.prices.essential);
    expect(created.metadata).toMatchObject({ tierId: "essential" });
    expect(created.metadata?.uid).toBeTruthy();
    expect(created.shipping_address_collection?.allowed_countries).toEqual(["CA"]);
    expect(created.success_url).toBe(`${BASE_URL}/portal?welcome=1`);
    return created;
  });

  const completed = await test.step(
    driveCheckoutPage ? "pay on the Checkout page with the 4242 card" : "pay through the Stripe API",
    async () => {
      if (!driveCheckoutPage) {
        const event = await completeWithoutCheckoutPage(session);
        await page.goto(session.success_url as string);
        return event;
      }

      await payWithTestCard(page);
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

/** Fills Stripe's hosted Checkout with a Canadian address and the 4242 test card. */
async function payWithTestCard(page: Page) {
  const shippingName = page.locator("#shippingName");
  await shippingName.waitFor({ timeout: 60_000 });
  await shippingName.fill(ADDRESS.name);

  // Locked to Canada (and disabled) when the plan only ships there.
  const country = page.locator("#shippingCountry");
  if ((await country.isVisible()) && (await country.isEnabled())) {
    await country.selectOption("CA");
  }

  const manualEntry = page.getByText(/enter address manually/i);
  if (await manualEntry.isVisible()) await manualEntry.click();

  await page.locator("#shippingAddressLine1").fill(ADDRESS.line1);
  await page.locator("#shippingLocality").fill(ADDRESS.city);
  await page.locator("#shippingPostalCode").fill(ADDRESS.postalCode);
  await page.locator("#shippingAdministrativeArea").selectOption(ADDRESS.province);

  // With several payment methods, card sits in an accordion row covered by a
  // transparent "Pay with card" button that Playwright never considers
  // visible. A forced click at the label lands on that button, as a user's would.
  const cardLabel = page.getByText("Card", { exact: true });
  if (await cardLabel.isVisible()) await cardLabel.click({ force: true });

  await page.locator("#cardNumber").fill("4242 4242 4242 4242");
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");

  const billingName = page.locator("#billingName");
  if (await billingName.isVisible()) await billingName.fill(ADDRESS.name);

  await page.locator('[data-testid="hosted-payment-submit-button"]').click();
}

/** What Checkout is showing instead of redirecting, for the failure message. */
async function describeCheckout(page: Page): Promise<string> {
  const errors = (
    await page
      .locator('[role="alert"], .FieldError')
      .allInnerTexts()
      .catch(() => [])
  ).filter((t) => t.trim());
  return [
    `Still on ${page.url()}.`,
    errors.length
      ? `Messages on the page: ${errors.join(" | ")}`
      : "No error messages on the page (bot protection blocks silently).",
  ].join(" ");
}

/**
 * Does what a successful Checkout does, through the API: subscribes the
 * session's customer to the session's price with the 4242 test card, carrying
 * the same metadata, and returns the `checkout.session.completed` event Stripe
 * would send. The open session is expired so it can't be paid later.
 */
async function completeWithoutCheckoutPage(
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

  const object = {
    ...session,
    line_items: undefined,
    status: "complete",
    payment_status: "paid",
    subscription: subscription.id,
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
  };
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
 * the handler still verifies the signature and fetches the subscription from
 * Stripe as it does in production.
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
