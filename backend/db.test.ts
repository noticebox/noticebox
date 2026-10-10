import { expect, test } from "vitest";
import { Store } from "./db";
import { REPORT, testConfig } from "./testutil";

const DAY = 86400000;

test("retention removes the personal fields of closed submissions and keeps the record", () => {
  const config = testConfig();
  const store = new Store(":memory:");
  const report = config.forms.report!;
  const t0 = new Date("2026-01-01T00:00:00Z");
  const closed = store.receive(report, REPORT, null, t0);
  const open = store.receive(report, REPORT, null, t0);
  const late = store.receive(report, REPORT, null, t0);
  expect(store.transition(closed.id, "marcel", "acted_on", "Removed.", t0).ok).toBe(true);
  expect(store.transition(late.id, "marcel", "rejected", "Fine.", new Date(t0.getTime() + 30 * DAY)).ok).toBe(true);

  expect(store.sweep(config, new Date(t0.getTime() + 89 * DAY))).toBe(0);
  expect(store.sweep(config, new Date(t0.getTime() + 91 * DAY))).toBe(1);
  const after = store.get(closed.id)!;
  expect(after.fields).toEqual({ read_id: "r1", note_id: "n1", file: "a.png", reason: "Spam" });
  expect(after.purged_at).toBeTruthy();
  expect(after.state).toBe("acted_on");
  expect(store.events(closed.id)).toHaveLength(2);
  expect(store.get(open.id)!.fields).toEqual(REPORT);
  expect(store.get(late.id)!.fields).toEqual(REPORT);
  expect(store.sweep(config, new Date(t0.getTime() + 91 * DAY))).toBe(0);
  expect(store.sweep(config, new Date(t0.getTime() + 121 * DAY))).toBe(1);
  store.close();
});

test("a report walks its states; closing needs a reason; a message needs none", () => {
  const config = testConfig();
  const store = new Store(":memory:");
  const now = new Date("2026-01-01T00:00:00Z");
  const r = store.receive(config.forms.report!, REPORT, null, now);
  expect(store.transition(r.id, "marcel", "in_review", "", now)).toEqual({ ok: true });
  expect(store.transition(r.id, "marcel", "acted_on", "  ", now)).toEqual({ ok: false, error: "acted_on needs a reason" });
  expect(store.transition(r.id, "anna", "rejected", "Not spam.", now)).toEqual({ ok: true });
  expect(store.transition(r.id, "anna", "in_review", "x", now)).toEqual({ ok: false, error: "a report cannot go from rejected to in_review" });
  expect(store.note(r.id, "marcel", "Wrote again.", now)).toEqual({ ok: true });
  expect(store.note(r.id, "marcel", " ", now)).toEqual({ ok: false, error: "a note needs text" });
  expect(store.events(r.id).map((e) => [e.actor, e.from_state, e.to_state, e.reason])).toEqual([
    ["form", null, "open", ""],
    ["marcel", "open", "in_review", ""],
    ["anna", "in_review", "rejected", "Not spam."],
    ["marcel", "rejected", null, "Wrote again."],
  ]);
  expect(store.get(r.id)!.closed_at).toBe(now.toISOString());
  const m = store.receive(config.forms.contact!, { name: "Ann", email: "a@b.co", message: "Hi" }, "https://example.org", now);
  expect(store.transition(m.id, "marcel", "in_review", "", now).ok).toBe(false);
  expect(store.transition(m.id, "marcel", "answered", "", now).ok).toBe(true);
  expect(store.transition("nope", "m", "open", "", now)).toEqual({ ok: false, error: "no such submission" });
  store.close();
});

test("listing filters by form, state and openness, newest first", () => {
  const config = testConfig();
  const store = new Store(":memory:");
  const a = store.receive(config.forms.report!, REPORT, null, new Date("2026-01-01T00:00:00Z"));
  const b = store.receive(config.forms.report!, REPORT, null, new Date("2026-01-02T00:00:00Z"));
  const c = store.receive(config.forms.contact!, { name: "Ann", email: "a@b.co", message: "Hi" }, "https://example.org", new Date("2026-01-03T00:00:00Z"));
  store.transition(b.id, "m", "rejected", "no", new Date("2026-01-04T00:00:00Z"));
  expect(store.list().map((s) => s.id)).toEqual([c.id, b.id, a.id]);
  expect(store.list({ open: true }).map((s) => s.id)).toEqual([c.id, a.id]);
  expect(store.list({ open: false }).map((s) => s.id)).toEqual([b.id]);
  expect(store.list({ form: "report", state: "rejected" }).map((s) => s.id)).toEqual([b.id]);
  expect(store.list({ limit: 1 }).map((s) => s.id)).toEqual([c.id]);
  expect(store.counts().sort((x, y) => x.state.localeCompare(y.state))).toEqual([
    { form: "contact", state: "new", n: 1 },
    { form: "report", state: "open", n: 1 },
    { form: "report", state: "rejected", n: 1 },
  ]);
  store.close();
});
