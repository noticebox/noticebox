// A GitHub issue from a submission, as a link: the form names the repository (`github`), and each submission links to
// that repository's new-issue page with the title, the body and the labels filled in from what the person sent, except
// their email address. noticebox calls no GitHub API and holds no token: the operator, signed in to GitHub, reads the
// draft there, changes what should not be public, and submits it.
import type { Form } from "./config";
import type { Submission } from "./db";
import { linkFor } from "./links";
import { submissionPath } from "./paths";
import { summaryOf } from "./summary";

export type Draft = { title: string; body: string };

// GitHub answers a new-issue URL of more than about 8 KB with an error; the body is cut to keep the whole URL below it.
const MAX_URL = 7500;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Whether a field is left out of the issue: an email field, or an undescribed one that holds an email address. */
function isEmail(form: Form, name: string, value: string): boolean {
  const f = form.fields[name];
  return f ? f.type === "email" : EMAIL.test(value.trim());
}

/** The issue as it is filled in: every field the person sent but their email, the form's link, and where it is in the inbox. */
export function issueDraft(form: Form, s: Submission, baseUrl: string): Draft {
  const fields = Object.fromEntries(Object.entries(s.fields).filter(([n, v]) => v && !isEmail(form, n, v)));
  const titleField = Object.entries(form.fields).find(([n, f]) => f.type === "text" && /title|subject|betreff|titel/i.test(`${n} ${f.label}`) && fields[n]);
  const summary = titleField ? fields[titleField[0]]!.replace(/\s+/g, " ").trim() : summaryOf(form, { ...s, fields }, 80);
  const title = (summary || `${form.title} ${s.id}`).slice(0, 200);
  const names = [...Object.keys(form.fields), ...Object.keys(fields).filter((n) => !form.fields[n])];
  const lines: string[] = [];
  for (const name of names) {
    const value = fields[name];
    if (!value) continue;
    const label = form.fields[name]?.label ?? name;
    lines.push(value.includes("\n") ? `**${label}**\n\n${quote(value)}` : `**${label}:** ${value}`);
  }
  const link = linkFor(form, s);
  if (link) lines.push(`**${link.label}:** ${link.url}`);
  lines.push(`_From noticebox, received ${s.received_at.slice(0, 10)}: ${baseUrl}${submissionPath(form.name, s.id)}_`);
  return { title, body: lines.join("\n\n") };
}

/** The link to the form's repository's new-issue page, filled in; null when the form names no repository. */
export function issueUrl(form: Form | undefined, s: Submission, baseUrl: string): string | null {
  if (!form?.github) return null;
  const { repo, labels } = form.github;
  const draft = issueDraft(form, s, baseUrl);
  const url = (body: string) => {
    const q = new URLSearchParams({ title: draft.title, body });
    if (labels.length) q.set("labels", labels.join(","));
    return `https://github.com/${repo}/issues/new?${q.toString()}`;
  };
  let full = url(draft.body);
  const note = "\n\n_(Cut to fit the link; the whole submission is in noticebox.)_";
  let keep = draft.body.length;
  while (keep > 0 && full.length > MAX_URL) {
    keep = Math.floor(keep * 0.9);
    full = url(draft.body.slice(0, keep) + note);
  }
  return full;
}

const quote = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => `> ${l}`)
    .join("\n");
