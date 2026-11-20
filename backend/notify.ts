// Notifications say that something happened and where to look, never what it says: ntfy topics and webhooks travel
// through other people's servers, the content stays in the box behind the login. Two things are announced: a submission
// arriving (to ntfy and to the webhooks that want arrivals, which is every webhook that doesn't say otherwise) and a
// decision moving a submission to another state (only to the webhooks that asked for decisions with `on`). A decision's
// post names the states, never the reason or who decided: both are in the history, behind the login. A test post (a
// site's own check that its form still gets through, `_test`) is announced all the same, but quietly and labelled, so
// nobody mistakes it for a real one.
import { wants, type Form, type NotifyEvent, type Target } from "./config";
import type { Submission } from "./db";
import { KINDS } from "./kinds";
import { submissionPath } from "./paths";

export type Fetch = typeof fetch;
type Log = (line: string) => void;

/** One post per target, all at once; a target that fails or is unset is logged, nothing is thrown. */
async function announce(form: Form, id: string, event: NotifyEvent, post: (t: Target) => Promise<Response>, log: Log): Promise<void> {
  const targets = form.notify.filter((t) => wants(t, event));
  for (const t of targets) if (t.unset) log(`notify ${form.name} ${id} ${t.type}: \${${t.unset}} is not set in the environment`);
  const jobs = targets.filter((t) => !t.unset).map((t) => ({ target: `${t.type} ${new URL(t.url).host}`, p: post(t) }));
  const results = await Promise.allSettled(jobs.map((j) => j.p));
  results.forEach((r, i) => {
    const target = jobs[i]?.target;
    if (r.status === "rejected") log(`notify ${form.name} ${id} ${target}: ${(r.reason as Error).message}`);
    else if (!r.value.ok) log(`notify ${form.name} ${id} ${target}: HTTP ${r.value.status}`);
  });
}

function webhook(fetchFn: Fetch, url: string, body: Record<string, unknown>): Promise<Response> {
  return fetchFn(url, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "noticebox" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
}

export async function notify(form: Form, s: Submission, baseUrl: string, fetchFn: Fetch = fetch, log: Log = console.error, test = false): Promise<void> {
  const title = `${test ? "Test: " : ""}New ${KINDS[form.kind].label}: ${form.title}`;
  const link = baseUrl + submissionPath(form.name, s.id);
  await announce(
    form,
    s.id,
    "received",
    (t) =>
      t.type === "ntfy"
        ? fetchFn(t.url, {
            method: "POST",
            headers: { Title: title, Priority: test ? "1" : "4", Tags: test ? "test_tube" : "mailbox", Click: link },
            body: link,
            signal: AbortSignal.timeout(5000),
          })
        : webhook(fetchFn, t.url, {
            event: "received",
            form: form.name,
            kind: form.kind,
            id: s.id,
            received_at: s.received_at,
            url: link,
            ...(test ? { test: true } : {}),
          }),
    log,
  );
}

export type Decision = { id: string; from: string; to: string; at: string };

/** A decision, to the webhooks whose `on` has "decided"; after it is stored, never in its way. */
export async function notifyDecision(form: Form, d: Decision, baseUrl: string, fetchFn: Fetch = fetch, log: Log = console.error): Promise<void> {
  const url = baseUrl + submissionPath(form.name, d.id);
  await announce(
    form,
    d.id,
    "decided",
    (t) => webhook(fetchFn, t.url, { event: "decided", form: form.name, kind: form.kind, id: d.id, from: d.from, to: d.to, at: d.at, url }),
    log,
  );
}
