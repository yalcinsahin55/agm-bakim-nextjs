import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const usesExternalServer = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    serviceWorkers: "allow",
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } }
      : {}),
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(usesExternalServer
    ? {}
    : {
        webServer: {
          command: "npm run start -- -H 127.0.0.1 -p 3000",
          url: "http://127.0.0.1:3000/login",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            ...process.env,
            NEXT_TELEMETRY_DISABLED: "1",
            JWT_SECRET: process.env.JWT_SECRET || "agm-e2e-local-secret-only",
            MONGO_URI: process.env.MONGO_URI || "mongodb://127.0.0.1:27017",
            MONGO_DB_NAME: process.env.MONGO_DB_NAME || "agm_bakim_e2e",
          },
        },
      }),
});
