// What an operator's monitoring may know, in the Prometheus text format: how many submissions are open per form and state, how
// long the oldest has waited, how many arrived and how many announcements failed. Counts, ages and names only (box, form, state,
// target type), never a field, an id, a URL or an address: the same rule as notifications. It is how an instance with monitoring
// is reminded of what waits (#118): an alert on the oldest open submission's age catches a missed push from any cause.
//
// It answers only with NOTICEBOX_METRICS_TOKEN set (404 without, so nothing says it is there), and only to a bearer of that
// token; no session counts, since a scraper has none. The gauges come from the store at each scrape; the counters live in the
// process since its start (retention deletes submissions, so the store could not give a counter that never goes down), and
// Prometheus copes with the reset at a restart.
import { timingSafeEqual } from "node:crypto";
import type { Target } from "./config";
import type { Runtime } from "./runtime";

/** The counters since the process started. */
export class Counters {
  readonly received = new Map<string, number>(); // `${form}\n${test}`
  readonly failures = new Map<string, number>(); // `${form}\n${type}`

  arrived(form: string, test: boolean): void {
    const k = `${form}\n${test}`;
    this.received.set(k, (this.received.get(k) ?? 0) + 1);
  }

  failed(form: string, type: Target["type"]): void {
    const k = `${form}\n${type}`;
    this.failures.set(k, (this.failures.get(k) ?? 0) + 1);
  }
}

/** A label value as the text format wants it. */
const label = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
const labels = (o: Record<string, string>) =>
  `{${Object.entries(o)
    .map(([k, v]) => `${k}=${label(v)}`)
    .join(",")}}`;

/** The metrics page, from the store as it is now and the counters. */
export function metricsText(rt: Pick<Runtime, "store" | "config" | "now" | "counters">): string {
  const now = rt.now().getTime();
  const boxOf = (form: string) => rt.config.forms[form]?.box ?? "";
  const open = rt.store.openByState();
  const out: string[] = [];
  out.push("# HELP noticebox_submissions_open Submissions not closed yet, per form and state.", "# TYPE noticebox_submissions_open gauge");
  for (const r of open) out.push(`noticebox_submissions_open${labels({ box: boxOf(r.form), form: r.form, state: r.state })} ${r.n}`);
  out.push(
    "# HELP noticebox_submission_oldest_open_seconds How long the oldest open submission of a form has waited; 0 when none is open.",
    "# TYPE noticebox_submission_oldest_open_seconds gauge",
  );
  const oldest = new Map<string, string>();
  for (const r of open) if (!oldest.has(r.form) || r.oldest < oldest.get(r.form)!) oldest.set(r.form, r.oldest);
  const forms = [...new Set([...Object.keys(rt.config.forms), ...oldest.keys()])].sort();
  for (const f of forms) {
    const at = oldest.get(f);
    const seconds = at ? Math.max(0, Math.floor((now - new Date(at).getTime()) / 1000)) : 0;
    out.push(`noticebox_submission_oldest_open_seconds${labels({ box: boxOf(f), form: f })} ${seconds}`);
  }
  out.push(
    "# HELP noticebox_submissions_received_total Submissions received since the process started.",
    "# TYPE noticebox_submissions_received_total counter",
  );
  for (const [k, n] of [...rt.counters.received].sort()) {
    const [form, test] = k.split("\n") as [string, string];
    out.push(`noticebox_submissions_received_total${labels({ form, test })} ${n}`);
  }
  out.push(
    "# HELP noticebox_notify_failures_total Announcements that could not be made since the process started, per form and target type.",
    "# TYPE noticebox_notify_failures_total counter",
  );
  for (const [k, n] of [...rt.counters.failures].sort()) {
    const [form, target_type] = k.split("\n") as [string, string];
    out.push(`noticebox_notify_failures_total${labels({ form, target_type })} ${n}`);
  }
  return out.join("\n") + "\n";
}

/** GET /metrics: 404 without NOTICEBOX_METRICS_TOKEN, 401 without its bearer, the metrics with it. */
export function metricsRoute(req: Request, rt: Runtime): Response {
  if (!rt.metricsToken) return new Response("not found", { status: 404 });
  const got = Buffer.from(/^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1] ?? "");
  const want = Buffer.from(rt.metricsToken);
  if (got.length !== want.length || !timingSafeEqual(got, want))
    return new Response("a bearer token is needed", { status: 401, headers: { "www-authenticate": "Bearer" } });
  return new Response(metricsText(rt), { headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8", "cache-control": "no-store" } });
}
