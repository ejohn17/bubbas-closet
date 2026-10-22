/**
 * Runs the Playwright suite against the Firebase emulators and Stripe test mode.
 *
 *   npm run test:e2e                 # headless
 *   npm run test:e2e -- --headed     # extra args go to `playwright test`
 *
 * Needs STRIPE_TEST_SECRET_KEY (a sk_test_ key) in the environment or in a
 * gitignored `.env.e2e` file, Java 21+ for the Firestore emulator, and the
 * Playwright browser (`npx playwright install chromium`).
 *
 * Creates the three membership prices in Stripe test mode on first run (found
 * again by lookup key afterwards), then starts the Auth + Firestore emulators
 * under the `demo-bubbas` project and runs Playwright inside them.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import Stripe from "stripe";

const FIREBASE_TOOLS = "firebase-tools@15";
const PROJECT_ID = "demo-bubbas";
/** Must match the emulator ports in firebase.json. */
const EMULATOR_PORTS = [8080, 9099];

const TIERS = [
  { id: "essential", env: "STRIPE_PRICE_ESSENTIAL", cents: 4999 },
  { id: "signature", env: "STRIPE_PRICE_SIGNATURE", cents: 8999 },
  { id: "premier", env: "STRIPE_PRICE_PREMIER", cents: 14999 },
];

if (existsSync(".env.e2e")) process.loadEnvFile(".env.e2e");

const key = process.env.STRIPE_TEST_SECRET_KEY ?? "";
if (!/^(sk|rk)_test_/.test(key)) {
  console.error(
    "STRIPE_TEST_SECRET_KEY must be set to a Stripe *test-mode* secret key (sk_test_…).\n" +
      "Find it in the Stripe dashboard with Test mode on, then either export it or put\n" +
      "STRIPE_TEST_SECRET_KEY=sk_test_… in landing/.env.e2e (gitignored).",
  );
  process.exit(1);
}

const prices = await ensureTestPrices(new Stripe(key));
const playwrightArgs = process.argv.slice(2).map(quote).join(" ");

const child = spawn(
  "npx",
  [
    "--yes",
    FIREBASE_TOOLS,
    "emulators:exec",
    "--project",
    PROJECT_ID,
    "--only",
    "auth,firestore",
    quote(`npx playwright test ${playwrightArgs}`.trim()),
  ],
  { stdio: "inherit", shell: true, env: { ...process.env, ...prices } },
);
child.on("exit", (code) => {
  stopOrphanedEmulators();
  process.exit(code ?? 1);
});

/**
 * On Windows, emulators:exec can exit while the Firestore emulator's Java
 * process keeps listening, which makes the next run fail with "port taken".
 */
function stopOrphanedEmulators() {
  if (process.platform !== "win32") return;
  spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Get-NetTCPConnection -LocalPort ${EMULATOR_PORTS.join(",")} -State Listen -ErrorAction SilentlyContinue | ` +
        "ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }",
    ],
    { stdio: "ignore" },
  );
}

/** Finds the e2e membership prices by lookup key, creating any that are missing. */
async function ensureTestPrices(stripe) {
  const lookupKey = (tierId) => `bubbas_e2e_${tierId}`;
  const { data: existing } = await stripe.prices.list({
    lookup_keys: TIERS.map((t) => lookupKey(t.id)),
    active: true,
    limit: TIERS.length,
  });

  let productId =
    typeof existing[0]?.product === "string" ? existing[0].product : undefined;
  const env = {};

  for (const tier of TIERS) {
    let price = existing.find((p) => p.lookup_key === lookupKey(tier.id));
    if (!price) {
      productId ??= (
        await stripe.products.create({
          name: "Bubbas Closet membership (e2e)",
          metadata: { purpose: "e2e" },
        })
      ).id;
      price = await stripe.prices.create({
        product: productId,
        currency: "cad",
        unit_amount: tier.cents,
        recurring: { interval: "month" },
        lookup_key: lookupKey(tier.id),
        nickname: `${tier.id} (e2e)`,
      });
      console.log(`Created Stripe test price ${price.id} for ${tier.id}`);
    }
    env[tier.env] = price.id;
  }
  return env;
}

function quote(arg) {
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}
