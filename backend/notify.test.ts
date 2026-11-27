// What a notification sends, and to whom: arrivals to ntfy and the webhooks that want them, decisions only to the webhooks that
// asked for them, never a field, a reason or who decided.
import { expect, test } from "vitest";
import { parseConfig, type Form } from "./config";
import type { Submission } from "./db";
import { notify, notifyDecision } from "./notify";

const BASE = "https://inbox.test";

function form(notifyTargets: unknown): Form {
  return parseConfig({ forms: { orders: { kind: "message", title: "Orders", fields: { email: { type: "email" } }, notify: notifyTargets } } }).forms.orders!;
}

function catcher(answer: () => Promise<Response> = async () => new Response(null, { status: 204 })) {
  const hits: { url: string; body: string }[] = [];
  const lines: string[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    hits.push({ url: String(url), body: String(init?.body ?? "") });
    return answer();
  }) as typeof fetch;
  return { hits, lines, fetchFn, log: (l: string) => void lines.push(l) };
}

const TARGETS = [
  { type: "ntfy", url: "https://ntfy.test/t" },
  { type: "webhook", url: "https://arrivals.test/x" },
  { type: "webhook", url: "https://decisions.test/x", on: ["decided"] },
  { type: "webhook", url: "https://both.test/x", on: ["received", "decided"] },
];
const DECISION = { id: "abc123", from: "new", to: "angenommen", at: "2026-11-20T10:00:00.000Z" };

test("a decision posts event, from, to and the link, only to webhooks that asked for decided", async () => {
  const c = catcher();
  await notifyDecision(form(TARGETS), DECISION, BASE, c.fetchFn, c.log);
  expect(c.hits.map((h) => h.url).sort()).toEqual(["https://both.test/x", "https://decisions.test/x"]);
  expect(JSON.parse(c.hits[0]!.body)).toEqual({
    event: "decided",
    form: "orders",
    kind: "message",
    id: "abc123",
    from: "new",
    to: "angenommen",
    at: "2026-11-20T10:00:00.000Z",
    url: `${BASE}/forms/orders/submissions/abc123`,
  });
  expect(c.lines).toEqual([]);
});

test("an arrival posts event received and skips decisions-only webhooks", async () => {
  const c = catcher();
  const s = { id: "abc123", received_at: "2026-11-20T09:00:00.000Z" } as Submission;
  await notify(form(TARGETS), s, BASE, c.fetchFn, c.log);
  expect(c.hits.map((h) => h.url).sort()).toEqual(["https://arrivals.test/x", "https://both.test/x", "https://ntfy.test/t"]);
  const hook = JSON.parse(c.hits.find((h) => h.url === "https://arrivals.test/x")!.body);
  expect(hook).toEqual({
    event: "received",
    form: "orders",
    kind: "message",
    id: "abc123",
    received_at: s.received_at,
    url: `${BASE}/forms/orders/submissions/abc123`,
  });
});

test("a test post goes to webhooks, marked, and to ntfy only when its target asks for tests; the skip is logged", async () => {
  const s = { id: "abc123", received_at: "2026-11-20T09:00:00.000Z" } as Submission;
  const c = catcher();
  await notify(form(TARGETS), s, BASE, c.fetchFn, c.log, true);
  expect(c.hits.map((h) => h.url).sort()).toEqual(["https://arrivals.test/x", "https://both.test/x"]);
  expect(JSON.parse(c.hits[0]!.body)).toMatchObject({ test: true });
  expect(c.lines).toEqual(["notify orders abc123 ntfy ntfy.test: skipped, a test post"]);

  const opted = catcher();
  const heads: Record<string, string>[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    heads.push(Object.fromEntries(new Headers(init?.headers).entries()));
    return opted.fetchFn(url, init);
  }) as typeof fetch;
  await notify(form([{ type: "ntfy", url: "https://ntfy.test/t", tests: true }]), s, BASE, fetchFn, opted.log, true);
  expect(opted.hits.map((h) => h.url)).toEqual(["https://ntfy.test/t"]);
  expect(heads[0]).toMatchObject({ title: "Test: New message: Orders", priority: "1", tags: "test_tube" });
  expect(opted.lines).toEqual([]);
});

test("only an ntfy target takes tests", () => {
  expect(form([{ type: "ntfy", url: "https://ntfy.test/t", tests: false }]).notify[0]).toEqual({ type: "ntfy", url: "https://ntfy.test/t" });
  expect(() => form([{ type: "webhook", url: "https://hook.test/x", tests: true }])).toThrow(/only an ntfy target takes "tests"/);
  expect(() => form([{ type: "ntfy", url: "https://ntfy.test/t", tests: "yes" }])).toThrow(/tests: true or false/);
});

test("a mail target gets the title and the link of an arrival, never a field; its address stays out of the log", async () => {
  const s = { id: "abc123", received_at: "2026-11-20T09:00:00.000Z" } as Submission;
  const sent: { to: string; subject: string; text: string }[] = [];
  const mail = { send: async (m: (typeof sent)[number]) => void sent.push(m), allowed: ["me@example.org"] };
  const c = catcher();
  const f = form([{ type: "mail", to: "me@example.org" }]);
  await notify(f, s, BASE, c.fetchFn, c.log, false, mail);
  expect(sent).toEqual([{ to: "me@example.org", subject: "New message: Orders", text: `New message: Orders\n\n${BASE}/forms/orders/submissions/abc123\n` }]);
  expect(c.hits).toEqual([]);

  await notify(f, s, BASE, c.fetchFn, c.log, true, mail);
  expect(sent).toHaveLength(1);
  await notify(f, s, BASE, c.fetchFn, c.log, false, { ...mail, allowed: [] });
  await notify(f, s, BASE, c.fetchFn, c.log, false, { ...mail, send: async () => Promise.reject(new Error("connection refused")) });
  await notify(f, s, BASE, c.fetchFn, c.log, false, null);
  expect(sent).toHaveLength(1);
  expect(c.lines).toEqual([
    "notify orders abc123 mail: skipped, a test post",
    "notify orders abc123 mail: skipped, the address may no longer sign in (NOTICEBOX_ALLOWED_EMAILS)",
    "notify orders abc123 mail: connection refused",
    "notify orders abc123 mail: mail can't go out: NOTICEBOX_SMTP_URL is not set",
  ]);
  expect(c.lines.join("\n")).not.toContain("me@example.org");
});

test("a mail target takes only an address", () => {
  expect(() => form([{ type: "mail", to: "not an address" }])).toThrow(/the address a mail target writes to/);
  expect(() => form([{ type: "mail", to: "me@example.org", url: "https://x.test" }])).toThrow(/a mail target takes only "to"/);
});

test("a failing webhook is logged, never thrown", async () => {
  const down = catcher(async () => new Response(null, { status: 500 }));
  await expect(notifyDecision(form(TARGETS), DECISION, BASE, down.fetchFn, down.log)).resolves.toBeUndefined();
  expect(down.lines.sort()).toEqual(["notify orders abc123 webhook both.test: HTTP 500", "notify orders abc123 webhook decisions.test: HTTP 500"]);
  const gone = catcher(async () => {
    throw new Error("getaddrinfo ENOTFOUND");
  });
  await expect(notifyDecision(form(TARGETS), DECISION, BASE, gone.fetchFn, gone.log)).resolves.toBeUndefined();
  expect(gone.lines).toHaveLength(2);
});

test("an unset target is skipped for a decision and logged", async () => {
  const f = form(TARGETS);
  f.notify[2]!.unset = "HOOK";
  const c = catcher();
  await notifyDecision(f, DECISION, BASE, c.fetchFn, c.log);
  expect(c.hits.map((h) => h.url)).toEqual(["https://both.test/x"]);
  expect(c.lines).toEqual(["notify orders abc123 webhook: ${HOOK} is not set in the environment"]);
});

test("a decision's post names no field, reason or actor", async () => {
  const c = catcher();
  await notifyDecision(form(TARGETS), DECISION, BASE, c.fetchFn, c.log);
  for (const h of c.hits) expect(Object.keys(JSON.parse(h.body)).sort()).toEqual(["at", "event", "form", "from", "id", "kind", "to", "url"]);
});
