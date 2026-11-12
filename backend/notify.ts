// Notifications say that something arrived and where to look, never what it says: ntfy topics and webhooks travel
// through other people's servers, the content stays in the box behind the login. A test post (a site's own check that its
// form still gets through, `_test`) is announced all the same, but quietly and labelled, so nobody mistakes it for a
// real one.
import type { Form } from "./config";
import type { Submission } from "./db";
import { KINDS } from "./kinds";
import { submissionPath } from "./paths";

export type Fetch = typeof fetch;

export async function notify(
  form: Form,
  s: Submission,
  baseUrl: string,
  fetchFn: Fetch = fetch,
  log: (line: string) => void = console.error,
  test = false,
): Promise<void> {
  const title = `${test ? "Test: " : ""}New ${KINDS[form.kind].label}: ${form.title}`;
  const link = baseUrl + submissionPath(form.name, s.id);
  for (const t of form.notify) if (t.unset) log(`notify ${form.name} ${s.id} ${t.type}: \${${t.unset}} is not set in the environment`);
  const jobs = form.notify
    .filter((t) => !t.unset)
    .map((t) => ({
      target: `${t.type} ${new URL(t.url).host}`,
      p:
        t.type === "ntfy"
          ? fetchFn(t.url, {
              method: "POST",
              headers: { Title: title, Priority: test ? "1" : "4", Tags: test ? "test_tube" : "mailbox", Click: link },
              body: link,
              signal: AbortSignal.timeout(5000),
            })
          : fetchFn(t.url, {
              method: "POST",
              headers: { "content-type": "application/json", "user-agent": "noticebox" },
              body: JSON.stringify({ form: form.name, kind: form.kind, id: s.id, received_at: s.received_at, url: link, ...(test ? { test: true } : {}) }),
              signal: AbortSignal.timeout(5000),
            }),
    }));
  const results = await Promise.allSettled(jobs.map((j) => j.p));
  results.forEach((r, i) => {
    const target = jobs[i]?.target;
    if (r.status === "rejected") log(`notify ${form.name} ${s.id} ${target}: ${(r.reason as Error).message}`);
    else if (!r.value.ok) log(`notify ${form.name} ${s.id} ${target}: HTTP ${r.value.status}`);
  });
}
