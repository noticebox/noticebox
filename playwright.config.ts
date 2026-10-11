// End-to-end tests against the production build (`npm run test:e2e` builds first). The login proxy is played by
// the `x-user` header the tests send; the server trusts it because NOTICEBOX_USER_HEADER names it.
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// A fresh database and a fresh copy of the forms file for every run, made here because the web server starts before
// any setup hook runs, and outside test-results, which Playwright empties after this file has loaded.
mkdirSync(".e2e", { recursive: true });
for (const suffix of ["", "-wal", "-shm"]) rmSync(`.e2e/e2e.sqlite${suffix}`, { force: true });
copyFileSync("e2e/noticebox.json", ".e2e/noticebox.json");

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:3300", trace: "retain-on-failure" },
  projects: [{ name: "app" }],
  webServer: {
    command: "next start -p 3300",
    url: "http://localhost:3300/health",
    reuseExistingServer: !process.env.CI,
    env: {
      NOTICEBOX_CONFIG: ".e2e/noticebox.json",
      NOTICEBOX_DB: ".e2e/e2e.sqlite",
      NOTICEBOX_BASE_URL: "http://localhost:3300",
      NOTICEBOX_USER_HEADER: "x-user",
      NOTICEBOX_SECRET: "e2e-secret-".padEnd(32, "x"),
      NOTICEBOX_RATE_LIMIT: "0",
      NTFY_URL: "http://127.0.0.1:3399/reports",
    },
  },
});
