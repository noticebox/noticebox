// Administration of boxes, forms, connections and the export: what the inbox's settings pages and the MCP tools both
// do. The rules that need the store as well as the forms file (a form with submissions stays; a state that
// submissions are in stays) live here once, so neither the server actions nor the tools hold any of them.
import type { Event, ListFilter, Outcome, StoredFile, Submission } from "./db";
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

/** Deletes a form that has no submissions; one with submissions stays, because they are its record. */
export const deleteForm = (rt: Runtime, name: string): Outcome => rt.forms.deleteForm(name, hasSubmissions(rt, name));

/** An assistant the person allowed over MCP: Better Auth's consent for that OAuth client. */
export type Connection = { id: string; client_id: string; client_name: string; created_at: string };

type Row = Record<string, unknown>;
type Adapter = {
  findMany(q: { model: string; where: { field: string; value: string }[] }): Promise<Row[]>;
  findOne(q: { model: string; where: { field: string; value: string }[] }): Promise<Row | null>;
  deleteMany(q: { model: string; where: { field: string; value: string }[] }): Promise<number>;
};

const adapterOf = async (rt: Runtime): Promise<Adapter> => (await (await rt.auth()).$context).adapter as unknown as Adapter;
const iso = (d: unknown) => new Date(d as string | Date).toISOString();

/** The name an OAuth client registered with, else its id. */
export async function clientName(rt: Runtime, clientId: string): Promise<string> {
  const c = await (await adapterOf(rt)).findOne({ model: "oauthClient", where: [{ field: "clientId", value: clientId }] });
  return typeof c?.name === "string" && c.name ? c.name : clientId;
}

/** The person's connected assistants (MCP clients they allowed), newest first. */
export async function connections(rt: Runtime, personId: string): Promise<Connection[]> {
  const a = await adapterOf(rt);
  const rows = await a.findMany({ model: "oauthConsent", where: [{ field: "userId", value: personId }] });
  const list = await Promise.all(
    rows.map(async (r) => ({
      id: String(r.id),
      client_id: String(r.clientId),
      client_name: await clientName(rt, String(r.clientId)),
      created_at: iso(r.createdAt),
    })),
  );
  return list.sort((x, y) => y.created_at.localeCompare(x.created_at));
}

/** Whether the person still allows this client: /mcp asks at every call, so revoking takes effect at once. */
export async function connected(rt: Runtime, personId: string, clientId: string): Promise<boolean> {
  const a = await adapterOf(rt);
  const rows = await a.findMany({
    model: "oauthConsent",
    where: [
      { field: "userId", value: personId },
      { field: "clientId", value: clientId },
    ],
  });
  return rows.length > 0;
}

/**
 * Revokes one of the person's own connections: the consent goes, and with it every refresh token of that client for
 * them. Its access tokens fail at the next call, because /mcp checks the consent each time.
 */
export async function revokeConnection(rt: Runtime, personId: string, id: string): Promise<Outcome> {
  const a = await adapterOf(rt);
  const c = await a.findOne({
    model: "oauthConsent",
    where: [
      { field: "id", value: id },
      { field: "userId", value: personId },
    ],
  });
  if (!c) return { ok: false, error: "no such connection" };
  const mine = [
    { field: "clientId", value: String(c.clientId) },
    { field: "userId", value: personId },
  ];
  await a.deleteMany({ model: "oauthRefreshToken", where: mine });
  await a.deleteMany({ model: "oauthAccessToken", where: mine });
  await a.deleteMany({ model: "oauthConsent", where: [{ field: "id", value: id }] });
  return { ok: true };
}

export type Exported = Submission & { files: StoredFile[]; events: Event[] }; // the files without their bytes: those stay in the inbox

/** Every submission, or one form's or state's, with its history, newest first, up to 1000: the audit export. */
export function exportSubmissions(rt: Runtime, filter: Pick<ListFilter, "form" | "state"> = {}): Exported[] {
  return rt.store.list({ ...filter, limit: 1000 }).map((s) => ({ ...s, files: rt.store.files(s.id), events: rt.store.events(s.id) }));
}
