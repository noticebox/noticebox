"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { actorOf, createBox as createBoxIn, createForm as createFormIn, deleteBox as deleteBoxIn, deleteForm as deleteFormIn, formPath, renameBox as renameBoxIn, revokeConnection, runtime, updateForm as updateFormIn, type RawForm } from "@/backend";
import { t } from "@/app/_lib/copy";

// The settings pages' actions: thin adapters over backend/admin.ts, which the MCP tools call too. Every action needs
// the signed-in person, and Next checks the request's origin before any server action runs.
export type AdminState = { error?: string; n?: number };

const str = (data: FormData, k: string) => String(data.get(k) ?? "").trim();

async function signedIn(): Promise<string | null> {
  return actorOf(await headers(), runtime());
}

export async function createBox(prev: AdminState, data: FormData): Promise<AdminState> {
  const n = (prev.n ?? 0) + 1;
  if (!(await signedIn())) return { error: t.common.signInFirst, n };
  const name = str(data, "name");
  const r = createBoxIn(runtime(), name);
  if (!r.ok) return { error: r.error, n };
  revalidatePath("/", "layout");
  redirect(`/boxes/${encodeURIComponent(name)}`);
}

export async function renameBox(prev: AdminState, data: FormData): Promise<AdminState> {
  const n = (prev.n ?? 0) + 1;
  if (!(await signedIn())) return { error: t.common.signInFirst, n };
  const from = str(data, "from");
  const to = str(data, "to");
  const r = renameBoxIn(runtime(), from, to);
  if (!r.ok) return { error: r.error, n };
  revalidatePath("/", "layout");
  redirect(`/boxes/${encodeURIComponent(to)}`);
}

export async function deleteBox(prev: AdminState, data: FormData): Promise<AdminState> {
  const n = (prev.n ?? 0) + 1;
  if (!(await signedIn())) return { error: t.common.signInFirst, n };
  const r = deleteBoxIn(runtime(), str(data, "name"));
  if (!r.ok) return { error: r.error, n };
  revalidatePath("/", "layout");
  redirect("/");
}

export async function createForm(prev: AdminState, data: FormData): Promise<AdminState> {
  const n = (prev.n ?? 0) + 1;
  if (!(await signedIn())) return { error: t.common.signInFirst, n };
  const name = str(data, "name");
  const kind = str(data, "kind");
  if (kind !== "report" && kind !== "message") return { error: t.actions.chooseKind, n };
  const box = str(data, "box");
  if (!box) return { error: t.actions.chooseBox, n };
  const r = createFormIn(runtime(), name, box, kind, str(data, "title"));
  if (!r.ok) return { error: r.error, n };
  revalidatePath("/", "layout");
  redirect(`${formPath(name)}/settings`);
}

export async function updateForm(prev: AdminState, data: FormData): Promise<AdminState> {
  const n = (prev.n ?? 0) + 1;
  if (!(await signedIn())) return { error: t.common.signInFirst, n };
  const name = str(data, "name");
  let form: RawForm;
  try {
    form = JSON.parse(str(data, "form")) as RawForm;
  } catch {
    return { error: t.actions.unreadable, n };
  }
  if (typeof form !== "object" || form === null || Array.isArray(form)) return { error: t.actions.unreadable, n };
  const r = updateFormIn(runtime(), name, form);
  if (!r.ok) return { error: r.error, n };
  revalidatePath("/", "layout");
  return { n };
}

export async function deleteForm(prev: AdminState, data: FormData): Promise<AdminState> {
  const n = (prev.n ?? 0) + 1;
  if (!(await signedIn())) return { error: t.common.signInFirst, n };
  const r = deleteFormIn(runtime(), str(data, "name"));
  if (!r.ok) return { error: r.error, n };
  revalidatePath("/", "layout");
  redirect("/");
}

export async function revokeGrant(prev: AdminState, data: FormData): Promise<AdminState> {
  const n = (prev.n ?? 0) + 1;
  const actor = await signedIn();
  if (!actor) return { error: t.common.signInFirst, n };
  const r = revokeConnection(runtime(), actor, str(data, "id"));
  if (!r.ok) return { error: r.error, n };
  revalidatePath("/settings");
  return { n };
}
