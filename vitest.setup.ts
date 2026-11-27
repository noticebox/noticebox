// Every test gets its own data directory: DATA_DIR and NOTICEBOX_CONFIG point into a fresh temporary directory (so
// noticebox.sqlite and auth.sqlite land there), removed afterwards, and the process runtime is dropped so the next test builds its own. No test can reach data/.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";

const g = globalThis as { __noticebox?: { store: { close(): void } } };
let dir = "";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "noticebox-test-"));
  process.env.DATA_DIR = dir;
  process.env.NOTICEBOX_CONFIG = join(dir, "noticebox.json");
  // Enough for the process runtime to start; tests that sign in build runtimes with settings of their own.
  process.env.NOTICEBOX_SECRET = "test-secret-".padEnd(32, "x");
  process.env.PUBLIC_URL = "https://inbox.test";
  process.env.NOTICEBOX_SMTP_URL = "smtp://mail.invalid";
});

afterEach(() => {
  g.__noticebox?.store.close();
  delete g.__noticebox;
  rmSync(dir, { recursive: true, force: true });
});
