"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { actorOf, formPath, runtime, type RawForm } from "@/backend";

// The settings pages' actions: boxes and forms are edits of the forms file (backend/forms.ts), each validated as a
// whole before it is written; a connection is a grant in the store. Every action needs the signed-in person, and
// Next checks the request's origin before any server action runs.
export type AdminState = { error?: string; n?: number };

const str = (data: FormData, k: string) => String(data.get(k) ?? "").trim();

async function signedIn(): Promise<string | null> {
  return actorOf(await headers(), runtime());
}

export async function createBox(prev: AdminState, data: FormData): Promise<AdminState> {
  const n = (prev.n ?? 0) + 1;
  if (!(await signedIn())) return { error: "Sign in first.", n };
  const name = str(data, "name");
  const r = runtime().forms.createBox(name);
  if (!r.ok) return { error: r.error, n };
  revalidatePath("/", "layout");
  redirect(`/boxes/${encodeURIComponent(name)}`);
}

export async function renameBox(prev: AdminState, data: FormData): Promise<AdminState> {
  const n = (prev.n ?? 0) + 1;
  if (!(await signedIn())) return { error: "Sign in first.", n };
  const from = str(data, "from");
  const to = str(data, "to");
  const r = runtime().forms.renameBox(from, to);
  if (!r.ok) return { error: r.error, n };
  revalidatePath("/", "layout");
  redirect(`/boxes/${encodeURIComponent(to)}`);
}

export async function deleteBox(prev: AdminState, data: FormData): Promise<AdminState> {
  const n = (prev.n ?? 0) + 1;
  if (!(await signedIn())) return { error: "Sign in first.", n };
  const r = runtime().forms.deleteBox(str(data, "name"));
  if (!r.ok) return { error: r.error, n };
  revalidatePath("/", "layout");
  redirect("/");
}

export async function createForm(prev: AdminState, data: FormData): Promise<AdminState> {
  const n = (prev.n ?? 0) + 1;
  if (!(await signedIn())) return { error: "Sign in first.", n };
  const name = str(data, "name");
  const kind = str(data, "kind");
  if (kind !== "report" && kind !== "message") return { error: "Choose a kind.", n };
  const box = str(data, "box");
  if (!box) return { error: "Choose a box, or add the one you typed as a new box.", n };
  const r = runtime().forms.createForm(name, box, kind, str(data, "title"));
  if (!r.ok) return { error: r.error, n };
  revalidatePath("/", "layout");
  redirect(`${formPath(name)}/settings`);
}

export async function updateForm(prev: AdminState, data: FormData): Promise<AdminState> {
  const n = (prev.n ?? 0) + 1;
  if (!(await signedIn())) return { error: "Sign in first.", n };
  const name = str(data, "name");
  let form: RawForm;
  try {
    form = JSON.parse(str(data, "form")) as RawForm;
  } catch {
    return { error: "The settings could not be read.", n };
  }
  if (typeof form !== "object" || form === null || Array.isArray(form)) return { error: "The settings could not be read.", n };
  const rt = runtime();
  const kept = new Set((Array.isArray(form.states) ? form.states : []).map((st) => (typeof st === "string" ? st : (st as { name?: string }).name)));
  const inUse = rt.store.counts().filter((c) => c.form === name && c.n > 0 && !kept.has(c.state));
  if (inUse.length) return { error: `Submissions are in the state "${inUse[0]!.state}"; it cannot be removed.`, n };
  const r = rt.forms.updateForm(name, form);
  if (!r.ok) return { error: r.error, n };
  revalidatePath("/", "layout");
  return { n };
}

export async function deleteForm(prev: AdminState, data: FormData): Promise<AdminState> {
  const n = (prev.n ?? 0) + 1;
  if (!(await signedIn())) return { error: "Sign in first.", n };
  const rt = runtime();
  const name = str(data, "name");
  const has = rt.store.counts().some((c) => c.form === name && c.n > 0);
  const r = rt.forms.deleteForm(name, has);
  if (!r.ok) return { error: r.error, n };
  revalidatePath("/", "layout");
  redirect("/");
}

export async function revokeGrant(prev: AdminState, data: FormData): Promise<AdminState> {
  const n = (prev.n ?? 0) + 1;
  const actor = await signedIn();
  if (!actor) return { error: "Sign in first.", n };
  const rt = runtime();
  const r = rt.store.revokeGrant(str(data, "id"), actor, rt.now());
  if (!r.ok) return { error: r.error, n };
  revalidatePath("/settings");
  return { n };
}
