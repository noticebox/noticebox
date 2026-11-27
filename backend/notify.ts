// Notifications say that something happened and where to look, never what it says: ntfy topics and webhooks travel
// through other people's servers, the content stays in the box behind the login. Two things are announced: a submission
// arriving (to ntfy and to the webhooks that want arrivals, which is every webhook that doesn't say otherwise) and a
// decision moving a submission to another state (only to the webhooks that asked for decisions with `on`). A decision's
// post names the states, never the reason or who decided: both are in the history, behind the login. A test post (a
// site's own check that its form still gets through, `_test`) goes to the webhooks marked `"test": true`, but not to ntfy:
// CI checks post several a day, and on the phone they buried the real submissions. An ntfy target with `tests: true` still
// gets it, quietly and labelled, so nobody mistakes it for a real one. The skip is logged, so nothing looks lost. A mail
// target (an address that may sign in, through the sign-in SMTP) hears of arrivals like ntfy: the title and the link.
import { emailAllowed, type Smtp } from "next-app-kit/signin";
import { createTransport } from "nodemailer";
import { wants, type Form, type NotifyEvent, type Target } from "./config";
import type { Submission } from "./db";
import { KINDS } from "./kinds";
import { submissionPath } from "./paths";

export type Fetch = typeof fetch;

/** One mail out: the sign-in SMTP, or a fake in tests. */
export type SendMail = (m: { to: string; subject: string; text: string }) => Promise<void>;
/** How arrivals go out by mail: the sender, and who may still be written to (the allowlist may have shrunk since the form was saved). */
export type Mail = { send: SendMail; allowed: string[] };

/** Sends through the SMTP that sign-in uses, from its sender. */
export function smtpSend(smtp: Smtp): SendMail {
  const transport = createTransport(smtp.url);
  return async (m) => {
    await transport.sendMail({ from: smtp.from, ...m });
  };
}
type Log = (line: string) => void;

/** One post per target, all at once; a target that fails or is unset is logged, nothing is thrown. */
async function announce(form: Form, id: string, event: NotifyEvent, post: (t: Target) => Promise<Response>, log: Log, test = false): Promise<void> {
  // A mail target's address stays out of the log, as the sign-in mail's does.
  const name = (t: Target) => (t.type === "mail" ? "mail" : `${t.type} ${new URL(t.url).host}`);
  const skipped = (t: Target) => test && t.type !== "webhook" && !t.tests;
  for (const t of form.notify.filter((t) => wants(t, event) && skipped(t) && !t.unset)) log(`notify ${form.name} ${id} ${name(t)}: skipped, a test post`);
  const targets = form.notify.filter((t) => wants(t, event) && !skipped(t));
  for (const t of targets) if (t.unset) log(`notify ${form.name} ${id} ${t.type}: \${${t.unset}} is not set in the environment`);
  const jobs = targets.filter((t) => !t.unset).map((t) => ({ target: name(t), p: post(t) }));
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

async function mailOne(mail: Mail | null, to: string, subject: string, link: string): Promise<Response> {
  if (!mail) throw new Error("mail can't go out: NOTICEBOX_SMTP_URL is not set");
  if (!emailAllowed(mail.allowed, to)) throw new Error("skipped, the address may no longer sign in (NOTICEBOX_ALLOWED_EMAILS)");
  await mail.send({ to, subject, text: `${subject}\n\n${link}\n` });
  return new Response(null, { status: 204 });
}

export async function notify(
  form: Form,
  s: Submission,
  baseUrl: string,
  fetchFn: Fetch = fetch,
  log: Log = console.error,
  test = false,
  mail: Mail | null = null,
): Promise<void> {
  const title = `${test ? "Test: " : ""}New ${KINDS[form.kind].label}: ${form.title}`;
  const link = baseUrl + submissionPath(form.name, s.id);
  await announce(
    form,
    s.id,
    "received",
    (t) =>
      t.type === "mail"
        ? mailOne(mail, t.to!, title, link)
        : t.type === "ntfy"
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
    test,
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
