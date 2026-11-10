// Every test gets its own data directory: NOTICEBOX_DB and NOTICEBOX_CONFIG point into a fresh temporary directory,
// removed afterwards, and the process runtime is dropped so the next test builds its own. No test can reach data/.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";

const g = globalThis as { __noticebox?: { store: { close(): void } } };
let dir = "";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "noticebox-test-"));
  process.env.NOTICEBOX_DB = join(dir, "noticebox.sqlite");
  process.env.NOTICEBOX_CONFIG = join(dir, "noticebox.json");
});

afterEach(() => {
  g.__noticebox?.store.close();
  delete g.__noticebox;
  rmSync(dir, { recursive: true, force: true });
});
