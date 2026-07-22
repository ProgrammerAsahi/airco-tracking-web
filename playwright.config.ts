import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4184",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "PORT=4184 INVENTORY_FILE=test-fixtures/inventory.sample.json I18N_FILE=test-fixtures/i18n.local.json AUTH_CODE_HMAC_PEPPER=playwright-only-verification-pepper-2026 AUTH_CODE_HMAC_PEPPER_VERSION=test-v1 node server-dist/server/server.js",
    url: "http://127.0.0.1:4184/health",
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
