// End-to-end tests against the production build (`npm run test:e2e` builds first). The login proxy is played by
// the `x-user` header the tests send; the server trusts it because NOTICEBOX_USER_HEADER names it.
import { mkdirSync, rmSync } from "node:fs";
import { defineConfig } from "@playwright/test";
import { NTFY_URL, seed } from "./e2e/seed";

// A fresh database with the tests' forms for every run, made here because the web server starts before any setup hook
// runs (and loads the forms once, at start), and outside test-results, which Playwright empties after this file has
// loaded. Playwright loads this file again in each worker; only the main process, before the server, seeds.
if (!process.env.TEST_WORKER_INDEX) {
  mkdirSync(".e2e", { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`.e2e/e2e.sqlite${suffix}`, { force: true });
  seed(".e2e/e2e.sqlite");
}

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
      NOTICEBOX_DB: ".e2e/e2e.sqlite",
      NOTICEBOX_BASE_URL: "http://localhost:3300",
      NOTICEBOX_USER_HEADER: "x-user",
      NOTICEBOX_SECRET: "e2e-secret-".padEnd(32, "x"),
      NOTICEBOX_RATE_LIMIT: "0",
      NTFY_URL,
    },
  },
});
