// The test setup (vitest.setup.ts) gives every test its own data directory, so no test can touch data/.
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "vitest";
import { runtime } from "./runtime";

let first = "";

test("a test's database and forms file are in a fresh temporary directory", () => {
  const db = join(process.env.DATA_DIR!, "noticebox.sqlite");
  expect(resolve(db).startsWith(resolve(tmpdir()))).toBe(true);
  expect(dirname(process.env.NOTICEBOX_CONFIG!)).toBe(dirname(db));
  expect(existsSync(db)).toBe(false);
  first = dirname(db);
  const rt = runtime(); // the process runtime, built from the environment, lands there too
  rt.store.ping();
  expect(existsSync(db)).toBe(true);
});

test("the next test gets another one, and the runtime is built afresh", () => {
  expect(first).not.toBe("");
  expect(process.env.DATA_DIR).not.toBe(first);
  expect(existsSync(first)).toBe(false);
  expect(existsSync(join(process.env.DATA_DIR!, "noticebox.sqlite"))).toBe(false);
});
