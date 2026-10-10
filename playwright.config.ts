// End-to-end tests against the production build (`npm run test:e2e` builds first). The login proxy is played by
// the `x-user` header the tests send; the server trusts it because NOTICEBOX_USER_HEADER names it.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:3300", trace: "retain-on-failure" },
  projects: [{ name: "app" }],
  globalSetup: "./e2e/setup.ts",
  webServer: {
    command: "next start -p 3300",
    url: "http://localhost:3300/healthz",
    reuseExistingServer: !process.env.CI,
    env: {
      NOTICEBOX_CONFIG: "e2e/noticebox.json",
      NOTICEBOX_DB: "test-results/e2e.sqlite",
      NOTICEBOX_BASE_URL: "http://localhost:3300",
      NOTICEBOX_USER_HEADER: "x-user",
      NOTICEBOX_SECRET: "e2e-secret-".padEnd(32, "x"),
      NOTICEBOX_RATE_LIMIT: "0",
      NTFY_URL: "http://127.0.0.1:3399/reports",
    },
  },
});
