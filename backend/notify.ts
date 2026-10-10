// Notifications say that something arrived and where to look, never what it says: ntfy topics and webhooks travel
// through other people's servers, the content stays in the box behind the login.
import type { Form } from "./config";
import type { Submission } from "./db";
import { KINDS } from "./kinds";

export type Fetch = typeof fetch;

export async function notify(form: Form, s: Submission, baseUrl: string, fetchFn: Fetch = fetch, log: (line: string) => void = console.error): Promise<void> {
  const link = `${baseUrl}/s/${s.id}`;
  const jobs: { target: string; p: Promise<Response> }[] = [];
  if (form.notify.ntfy) {
    jobs.push({
      target: "ntfy",
      p: fetchFn(form.notify.ntfy, {
        method: "POST",
        headers: { Title: `New ${KINDS[form.kind].label}: ${form.title}`, Priority: "4", Tags: "mailbox", Click: link },
        body: link,
        signal: AbortSignal.timeout(5000),
      }),
    });
  }
  if (form.notify.webhook) {
    jobs.push({
      target: "webhook",
      p: fetchFn(form.notify.webhook, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "noticebox" },
        body: JSON.stringify({ form: form.name, kind: form.kind, id: s.id, received_at: s.received_at, url: link }),
        signal: AbortSignal.timeout(5000),
      }),
    });
  }
  const results = await Promise.allSettled(jobs.map((j) => j.p));
  results.forEach((r, i) => {
    const target = jobs[i]?.target;
    if (r.status === "rejected") log(`notify ${form.name} ${s.id} ${target}: ${(r.reason as Error).message}`);
    else if (!r.value.ok) log(`notify ${form.name} ${s.id} ${target}: HTTP ${r.value.status}`);
  });
}
