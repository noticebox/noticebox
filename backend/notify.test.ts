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
