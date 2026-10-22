import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import Stripe from "stripe";
import { requireE2eEnv, SEED, WEBHOOK_SECRET } from "./env";

const env = requireE2eEnv();
const stripe = new Stripe(env.stripeKey);

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

  const sessionId = await test.step("pay on Stripe Checkout (test mode)", async () => {
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
    const id = page.url().match(/cs_test_[A-Za-z0-9]+/)?.[0];
    expect(id, "Checkout should be a test-mode session").toBeTruthy();

    await payWithTestCard(page);
    await page.waitForURL(/\/portal\?welcome=1$/, { timeout: 90_000 });
    return id as string;
  });

  await test.step("Stripe's webhook activates the membership", async () => {
    customerToCleanUp = await deliverCheckoutCompleted(request, sessionId, startedAt);

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
  await shippingName.fill("E2E Parent");

  // Locked to Canada (and disabled) when the plan only ships there.
  const country = page.locator("#shippingCountry");
  if ((await country.isVisible()) && (await country.isEnabled())) {
    await country.selectOption("CA");
  }

  const manualEntry = page.getByText(/enter address manually/i);
  if (await manualEntry.isVisible()) await manualEntry.click();

  await page.locator("#shippingAddressLine1").fill("1 Main St");
  await page.locator("#shippingLocality").fill("Toronto");
  await page.locator("#shippingPostalCode").fill("M5V 1A1");
  await page.locator("#shippingAdministrativeArea").selectOption("ON");

  // With more than one payment method enabled, card has to be chosen first.
  // With several payment methods, card sits in an accordion row covered by a
  // transparent "Pay with card" button that Playwright never considers
  // visible. A forced click at the label lands on that button, as a user's would.
  const cardLabel = page.getByText("Card", { exact: true });
  if (await cardLabel.isVisible()) await cardLabel.click({ force: true });

  await page.locator("#cardNumber").fill("4242 4242 4242 4242");
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");

  const billingName = page.locator("#billingName");
  if (await billingName.isVisible()) await billingName.fill("E2E Parent");

  await page.locator('[data-testid="hosted-payment-submit-button"]').click();
}

/**
 * Forwards the real `checkout.session.completed` event to the app's webhook,
 * signed the way Stripe signs it. A CI runner has no public URL for Stripe to
 * call, so the suite does the delivery; the handler still verifies the
 * signature and fetches the subscription from Stripe as it does in production.
 */
async function deliverCheckoutCompleted(
  request: APIRequestContext,
  sessionId: string,
  since: number,
): Promise<string | null> {
  let event: Stripe.Event | undefined;
  for (let attempt = 0; attempt < 30 && !event; attempt += 1) {
    const { data } = await stripe.events.list({
      type: "checkout.session.completed",
      created: { gte: since },
      limit: 50,
    });
    event = data.find(
      (e) => (e.data.object as Stripe.Checkout.Session).id === sessionId,
    );
    if (!event) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!event) {
    throw new Error(`Stripe never reported checkout.session.completed for ${sessionId}`);
  }

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

  const session = event.data.object as Stripe.Checkout.Session;
  return typeof session.customer === "string"
    ? session.customer
    : (session.customer?.id ?? null);
}
