// End-to-end tests against the production build (`npm run test:e2e` builds first), signed in with a session that
// global-setup.ts makes through Better Auth's server side and hands to every browser context as storage state.
import { mkdirSync, rmSync } from "node:fs";
import { defineConfig } from "@playwright/test";
import { E2E_ENV, seed } from "./e2e/seed";

// A fresh database with the tests' forms for every run, made here because the web server starts before any setup hook
// runs (and loads the forms once, at start), and outside test-results, which Playwright empties after this file has
// loaded. Playwright loads this file again in each worker; only the main process, before the server, seeds.
if (!process.env.TEST_WORKER_INDEX) {
  mkdirSync(".e2e", { recursive: true });
  for (const file of ["e2e.sqlite", "auth.sqlite"]) for (const suffix of ["", "-wal", "-shm"]) rmSync(`.e2e/${file}${suffix}`, { force: true });
  seed(".e2e/e2e.sqlite");
}

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: "http://localhost:3300", trace: "retain-on-failure", storageState: ".e2e/state.json" },
  projects: [{ name: "app" }],
  webServer: {
    command: "next start -p 3300",
    url: "http://localhost:3300/health",
    reuseExistingServer: !process.env.CI,
    env: E2E_ENV,
  },
});
