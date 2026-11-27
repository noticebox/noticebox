// /metrics: there only with its token, only for its bearer, and only counts, ages and names.
import { expect, test } from "vitest";
import { metricsRoute } from "./metrics";
import { metricsTokenFrom } from "./runtime";
import { intakeRoute } from "./intake";
import { jsonPost, REPORT, testRuntime, until } from "./testutil";

const TOKEN = "t".repeat(40);
const get = (headers: Record<string, string> = {}) => new Request("https://inbox.test/metrics", { headers });

test("without NOTICEBOX_METRICS_TOKEN there is no /metrics; with it, only its bearer gets in, never a session", async () => {
  expect(metricsRoute(get({ authorization: `Bearer ${TOKEN}` }), testRuntime()).status).toBe(404);
  const rt = testRuntime({ metricsToken: TOKEN });
  expect(metricsRoute(get(), rt).status).toBe(401);
  expect(metricsRoute(get({ authorization: `Bearer ${"x".repeat(40)}` }), rt).status).toBe(401);
  expect(metricsRoute(get({ authorization: `Bearer ${TOKEN}x` }), rt).status).toBe(401);
  expect(metricsRoute(get({ cookie: "better-auth.session_token=abc" }), rt).status).toBe(401);
  const ok = metricsRoute(get({ authorization: `Bearer ${TOKEN}` }), rt);
  expect(ok.status).toBe(200);
  expect(ok.headers.get("content-type")).toMatch(/^text\/plain; version=0\.0\.4/);
});

test("a token too short to be a secret stops the start", () => {
  expect(metricsTokenFrom({})).toBeNull();
  expect(metricsTokenFrom({ NOTICEBOX_METRICS_TOKEN: " " })).toBeNull();
  expect(() => metricsTokenFrom({ NOTICEBOX_METRICS_TOKEN: "short" })).toThrow(/at least 32 characters/);
  expect(metricsTokenFrom({ NOTICEBOX_METRICS_TOKEN: TOKEN })).toBe(TOKEN);
});

test("open submissions per form and state, the oldest one's age, arrivals and failed announcements; no id, field or URL", async () => {
  let now = new Date("2026-11-27T10:00:00.000Z");
  const rt = testRuntime({
    metricsToken: TOKEN,
    now: () => now,
    fetch: (async () => new Response("down", { status: 500 })) as typeof fetch,
  });
  const first = (await (await intakeRoute(jsonPost("/f/report", REPORT), "report", rt)).json()) as { id: string };
  now = new Date("2026-11-27T11:00:00.000Z");
  await intakeRoute(jsonPost("/f/report", REPORT), "report", rt);
  await intakeRoute(jsonPost("/f/report", { ...REPORT, _test: "1" }), "report", rt);
  await until(() => [...rt.counters.failures.values()].reduce((a, b) => a + b, 0) === 5);
  now = new Date("2026-11-27T12:00:00.000Z");

  const text = await metricsRoute(get({ authorization: `Bearer ${TOKEN}` }), rt).text();
  const box = rt.config.forms.report!.box;
  expect(text).toContain(`noticebox_submissions_open{box="${box}",form="report",state="open"} 3`);
  expect(text).toContain(`noticebox_submission_oldest_open_seconds{box="${box}",form="report"} 7200`);
  for (const f of Object.keys(rt.config.forms).filter((f) => f !== "report"))
    expect(text).toMatch(new RegExp(`oldest_open_seconds\\{box="[^"]*",form="${f}"\\} 0\\n`));
  expect(text).toContain(`noticebox_submissions_received_total{form="report",test="false"} 2`);
  expect(text).toContain(`noticebox_submissions_received_total{form="report",test="true"} 1`);
  // Two real arrivals, each to ntfy and the webhook; the test post only to the webhook.
  expect(text).toContain(`noticebox_notify_failures_total{form="report",target_type="ntfy"} 2`);
  expect(text).toContain(`noticebox_notify_failures_total{form="report",target_type="webhook"} 3`);
  expect(text).not.toContain(first.id);
  expect(text).not.toMatch(/https?:|@|spam/i);
});
