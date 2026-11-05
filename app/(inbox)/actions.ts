"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { actorOf, openIssue, runtime } from "@/backend";

// What the dialog gets back: refused, with the message and what was submitted, so it can show them again (React
// resets a form's fields after every action), or done. `n` counts the attempts, so each answer redraws the fields.
export type DecideState = { ok?: boolean; error?: string; to?: string; reason?: string; n?: number };

// The dialog's "Confirm": a transition when a next state was chosen, else a note. Both are recorded in the name of
// the person the login proxy says is signed in; Next checks the request's origin before any server action runs.
export async function decide(prev: DecideState, data: FormData): Promise<DecideState> {
  const rt = runtime();
  const actor = actorOf(await headers(), rt);
  const id = String(data.get("id") ?? "");
  const to = String(data.get("to") ?? "").trim();
  const reason = String(data.get("reason") ?? "");
  const n = (prev.n ?? 0) + 1;
  if (!actor) return { error: "Sign in first.", to, reason, n };
  const s = rt.store.get(id);
  const form = s && rt.config.forms[s.form];
  if (!s || !form) return { error: "No such submission.", to, reason, n };
  const r = to ? rt.store.transition(form, id, actor, to, reason, rt.now()) : rt.store.note(id, actor, reason, rt.now());
  if (!r.ok) return { error: r.error, to, reason, n };
  revalidatePath("/", "layout");
  return { ok: true, n };
}

export type IssueState = { ok?: boolean; error?: string; title?: string; body?: string; n?: number };

// The issue dialog's "Open the issue": the draft as the person left it, opened in the form's repository in their name.
export async function createIssue(prev: IssueState, data: FormData): Promise<IssueState> {
  const rt = runtime();
  const actor = actorOf(await headers(), rt);
  const id = String(data.get("id") ?? "");
  const title = String(data.get("title") ?? "");
  const body = String(data.get("body") ?? "");
  const n = (prev.n ?? 0) + 1;
  if (!actor) return { error: "Sign in first.", title, body, n };
  const r = await openIssue(rt, id, actor, { title, body });
  if (!r.ok) return { error: r.error, title, body, n };
  revalidatePath("/", "layout");
  return { ok: true, n };
}
