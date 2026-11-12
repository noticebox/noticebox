// The one-off rename of an actor (scripts/rename-actor.mjs), run as an operator runs it: a dry count first, then
// `marcel` and `marcel via <client>` become the address, and nobody else's steps change.
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { Store } from "./db";
import { REPORT, testConfig } from "./testutil";

test("renames one actor's steps, its assistants' included, and only with --yes", () => {
  const file = join(mkdtempSync(join(tmpdir(), "noticebox-rename-")), "noticebox.sqlite");
  const report = testConfig().forms.report!;
  const store = new Store(file);
  const id = store.receive(report, REPORT, null, new Date()).id;
  store.note(id, "marcel", "Seen.", new Date());
  store.note(id, "marcel via Claude", "Checked.", new Date());
  store.note(id, "marcella", "Not me.", new Date());
  store.note(id, "anna via marcel via x", "Not me either.", new Date());
  const run = (...args: string[]) =>
    execFileSync("node", ["scripts/rename-actor.mjs", ...args], { env: { ...process.env, NOTICEBOX_DB: file }, encoding: "utf8" });

  expect(run("marcel", "marcel@example.org")).toContain("2 step(s)");
  expect(store.events(id).map((e) => e.actor)).toContain("marcel");
  expect(run("marcel", "marcel@example.org", "--yes")).toContain("renamed 2");
  expect(store.events(id).map((e) => e.actor)).toEqual(["form", "marcel@example.org", "marcel@example.org via Claude", "marcella", "anna via marcel via x"]);
  expect(() => run("form", "x", "--yes")).toThrow();
});
