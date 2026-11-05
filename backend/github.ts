// A GitHub issue from a submission: the form names the repository (`github`), NOTICEBOX_GITHUB_TOKEN may open issues
// there. An issue leaves the box for someone else's server, often a public one, so the draft carries only the fields
// marked `personal: false` (undescribed fields count as personal), the form's link and the submission's id; the person
// opening it sees the draft and may change it. One issue per submission, recorded in its history.
import type { Form } from "./config";
import type { Issue, Submission } from "./db";
import { linkFor } from "./links";
import type { Runtime } from "./runtime";
import { summaryOf } from "./summary";

export type Draft = { title: string; body: string };
export type Opened = { ok: true; issue: Issue } | { ok: false; error: string };

const API = "https://api.github.com";
const opening = new Set<string>(); // submissions whose issue is being opened, so a double click opens one

/** What the issue says unless the person changes it. */
export function issueDraft(form: Form, s: Submission): Draft {
  const summary = summaryOf(form, { ...s, fields: publicFields(form, s) }, 80);
  const title = summary ? `${form.title}: ${summary}` : `${form.title} ${s.id}`;
  const lines: string[] = [];
  for (const [name, value] of Object.entries(publicFields(form, s))) {
    const label = form.fields[name]?.label ?? name;
    lines.push(value.includes("\n") ? `**${label}**\n\n${quote(value)}` : `**${label}:** ${value}`);
  }
  const link = linkFor(form, s);
  if (link) lines.push(`**${link.label}:** ${link.url}`);
  lines.push(`_From noticebox, ${form.name} submission \`${s.id}\`, received ${s.received_at.slice(0, 10)}._`);
  return { title, body: lines.join("\n\n") };
}

/** The fields an issue may carry: described, and not personal. */
function publicFields(form: Form, s: Submission): Record<string, string> {
  return Object.fromEntries(Object.entries(s.fields).filter(([n, v]) => v && form.fields[n] && !form.fields[n].personal));
}

const quote = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => `> ${l}`)
    .join("\n");

/** Opens the submission's issue in its form's repository, unless it has one, and records it in the history. */
export async function openIssue(rt: Runtime, id: string, actor: string, draft: Partial<Draft> = {}): Promise<Opened> {
  const s = rt.store.get(id);
  const form = s && rt.config.forms[s.form];
  if (!s || !form) return { ok: false, error: "no such submission" };
  if (!form.github) return { ok: false, error: `the form "${form.name}" names no GitHub repository` };
  if (!rt.githubToken) return { ok: false, error: "NOTICEBOX_GITHUB_TOKEN is not set" };
  const had = rt.store.issue(id);
  if (had) return { ok: false, error: `this submission already has issue ${had.repo}#${had.number}: ${had.url}` };
  if (opening.has(id)) return { ok: false, error: "the issue is already being opened" };
  const base = issueDraft(form, s);
  const title = (draft.title ?? base.title).trim();
  const body = draft.body ?? base.body;
  if (!title) return { ok: false, error: "an issue needs a title" };
  if (title.length > 256) return { ok: false, error: "the title is longer than 256 characters" };
  if (body.length > 65536) return { ok: false, error: "the body is longer than 65536 characters" };
  const { repo, labels } = form.github;
  opening.add(id);
  try {
    let res: Response;
    try {
      res = await rt.fetch(`${API}/repos/${repo}/issues`, {
        method: "POST",
        headers: { accept: "application/vnd.github+json", authorization: `Bearer ${rt.githubToken}`, "x-github-api-version": "2022-11-28", "content-type": "application/json", "user-agent": "noticebox" },
        body: JSON.stringify(labels.length ? { title, body, labels } : { title, body }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (e) {
      rt.log(`github ${form.name} ${id}: ${(e as Error).message}`);
      return { ok: false, error: "GitHub could not be reached" };
    }
    if (!res.ok) {
      const message = await res
        .json()
        .then((j: { message?: string }) => j.message ?? "")
        .catch(() => "");
      rt.log(`github ${form.name} ${id}: HTTP ${res.status} ${message}`);
      const why = res.status === 401 ? "the token was refused" : res.status === 403 || res.status === 404 ? `the token may not open issues in ${repo}, or it does not exist` : res.status === 410 ? `issues are turned off in ${repo}` : `HTTP ${res.status}`;
      return { ok: false, error: `GitHub did not open the issue: ${why}${message ? ` (${message})` : ""}` };
    }
    const made = (await res.json()) as { number: number; html_url: string };
    const issue: Issue = { submission_id: id, repo, number: made.number, url: made.html_url, actor, created_at: rt.now().toISOString() };
    rt.store.recordIssue(issue);
    return { ok: true, issue };
  } finally {
    opening.delete(id);
  }
}
