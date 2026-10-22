/**
 * Settings shared by the Playwright config, global setup, and specs.
 *
 * The suite must only ever talk to the Firebase emulators and Stripe test
 * mode. `next dev` falls back to `.env` for any variable the test server
 * doesn't set, and `.env` holds live credentials, so every Stripe and Firebase
 * variable the app reads is set explicitly here and the run refuses to start
 * unless the emulators are up and the Stripe key is a test-mode key.
 */

export const PORT = 3100;
export const BASE_URL = `http://localhost:${PORT}`;

/** `demo-` projects can only reach the emulators, never a real Firebase project. */
export const PROJECT_ID = "demo-bubbas";

/** Signs the webhook events the spec forwards; only this test server trusts it. */
export const WEBHOOK_SECRET = "whsec_e2e_local_only";

export const SEED = {
  productId: "e2e-striped-romper",
  title: "E2E Striped Romper",
  size: "6M",
  units: 2,
};

export type E2eEnv = {
  stripeKey: string;
  prices: { essential: string; signature: string; premier: string };
  firestoreHost: string;
  authHost: string;
};

export function requireE2eEnv(): E2eEnv {
  const stripeKey = process.env.STRIPE_TEST_SECRET_KEY ?? "";
  if (!/^(sk|rk)_test_/.test(stripeKey)) {
    throw new Error(
      "STRIPE_TEST_SECRET_KEY must be a Stripe test-mode key (sk_test_…). Run the suite with `npm run test:e2e`.",
    );
  }

  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST ?? "";
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "";
  if (!firestoreHost || !authHost) {
    throw new Error(
      "The Firebase emulators aren't running. Run the suite with `npm run test:e2e`, which starts them.",
    );
  }

  const prices = {
    essential: process.env.STRIPE_PRICE_ESSENTIAL ?? "",
    signature: process.env.STRIPE_PRICE_SIGNATURE ?? "",
    premier: process.env.STRIPE_PRICE_PREMIER ?? "",
  };
  if (!prices.essential || !prices.signature || !prices.premier) {
    throw new Error(
      "Stripe test prices are missing. `npm run test:e2e` creates them in test mode before starting.",
    );
  }

  return { stripeKey, prices, firestoreHost, authHost };
}

/** Environment for the Next.js server under test. */
export function serverEnv(env: E2eEnv): Record<string, string> {
  return {
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_SITE_URL: BASE_URL,

    GCLOUD_PROJECT: PROJECT_ID,
    FIREBASE_PROJECT_ID: PROJECT_ID,
    FIRESTORE_EMULATOR_HOST: env.firestoreHost,
    FIREBASE_AUTH_EMULATOR_HOST: env.authHost,
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: env.authHost,
    NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${PROJECT_ID}.firebaseapp.com`,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: "demo-app-id",
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${PROJECT_ID}.appspot.com`,
    FIREBASE_STORAGE_BUCKET: `${PROJECT_ID}.appspot.com`,

    STRIPE_SECRET_KEY: env.stripeKey,
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    STRIPE_PRICE_ESSENTIAL: env.prices.essential,
    STRIPE_PRICE_SIGNATURE: env.prices.signature,
    STRIPE_PRICE_PREMIER: env.prices.premier,

    // Non-empty placeholders so nothing falls back to real keys in `.env`;
    // an accidental send fails instead of reaching a real inbox or audience.
    RESEND_API_KEY: "re_e2e_disabled",
    WAITLIST_FROM_EMAIL: "E2E <e2e@example.com>",
    MAILCHIMP_API_KEY: "e2e-disabled-us1",
    MAILCHIMP_AUDIENCE_ID: "e2e-disabled",
    CRON_SECRET: "e2e-cron-secret",
    WAITLIST_COLLECTION: "waitlist",
  };
}
