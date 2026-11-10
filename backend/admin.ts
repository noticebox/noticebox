// Administration of boxes, forms, connections and the export: what the inbox's settings pages and the MCP tools both
// do. The rules that need the store as well as the forms file (a form with submissions stays; a state that
// submissions are in stays) live here once, so neither the server actions nor the tools hold any of them.
import type { Event, Grant, ListFilter, Outcome, Submission } from "./db";
import { isKind, KINDS, type KindName } from "./kinds";
import type { RawForm } from "./forms";
import type { Runtime } from "./runtime";

export const createBox = (rt: Runtime, name: string): Outcome => rt.forms.createBox(name);
export const renameBox = (rt: Runtime, from: string, to: string): Outcome => rt.forms.renameBox(from, to);
export const deleteBox = (rt: Runtime, name: string): Outcome => rt.forms.deleteBox(name);
export const createForm = (rt: Runtime, name: string, box: string, kind: KindName, title: string): Outcome => rt.forms.createForm(name, box, kind, title);

const hasSubmissions = (rt: Runtime, form: string): boolean => rt.store.counts().some((c) => c.form === form && c.n > 0);

/** The first state that submissions of `form` are in and that `raw` no longer lists, if any. */
function stateInUse(rt: Runtime, form: string, raw: RawForm): string | null {
  // A form that lists no states takes its kind's preset.
  const listed = Array.isArray(raw.states) ? raw.states : isKind(raw.kind) ? KINDS[raw.kind].states : [];
  const kept = new Set(listed.map((st) => (typeof st === "string" ? st : (st as { name?: string } | null)?.name)));
  return rt.store.counts().find((c) => c.form === form && c.n > 0 && !kept.has(c.state))?.state ?? null;
}

const inUseError = (state: string) => `Submissions are in the state "${state}"; it cannot be removed.`;

/** Replaces an existing form's settings, as the Settings tab saves them. */
export function updateForm(rt: Runtime, name: string, raw: RawForm): Outcome {
  const used = stateInUse(rt, name, raw);
  if (used) return { ok: false, error: inUseError(used) };
  return rt.forms.updateForm(name, raw);
}

/** Creates a form or replaces it as a whole (what an assistant sends); `created` says which. */
export function putForm(rt: Runtime, name: string, raw: RawForm): Outcome & { created?: boolean } {
  const created = rt.forms.rawForm(name) === undefined;
  const used = created ? null : stateInUse(rt, name, raw);
  if (used) return { ok: false, error: inUseError(used) };
  const r = rt.forms.putForm(name, raw);
  return r.ok ? { ok: true, created } : r;
}

/** Deletes a form that has no submissions; one with submissions stays until they are downloaded and gone. */
export const deleteForm = (rt: Runtime, name: string): Outcome => rt.forms.deleteForm(name, hasSubmissions(rt, name));

/** The person's connected assistants (MCP grants), newest first. */
export const connections = (rt: Runtime, person: string): Grant[] => rt.store.grants(person);

/** Revokes one of the person's own connections; every token of it stops working at once. */
export const revokeConnection = (rt: Runtime, person: string, id: string): Outcome => rt.store.revokeGrant(id, person, rt.now());

export type Exported = Submission & { events: Event[] };

/** Every submission, or one form's or state's, with its history, newest first, up to 1000: the audit export. */
export function exportSubmissions(rt: Runtime, filter: Pick<ListFilter, "form" | "state"> = {}): Exported[] {
  return rt.store.list({ ...filter, limit: 1000 }).map((s) => ({ ...s, events: rt.store.events(s.id) }));
}
