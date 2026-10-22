import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, PORT, requireE2eEnv, serverEnv } from "./tests/e2e/env";

const env = requireE2eEnv();
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    actionTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // CI tests the production build; locally `next dev` keeps the loop fast.
    command: isCI
      ? `npm run build && npm run start -- --port ${PORT}`
      : `npx next dev --port ${PORT}`,
    url: BASE_URL,
    env: serverEnv(env),
    // Never attach to a server started outside the suite: it would be
    // running with whatever credentials its own environment had.
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "pipe",
  },
});
