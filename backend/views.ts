// What a box, form or submission looks like to a client: the shapes MCP's tools and the REST API both answer with,
// built once here so the two can't drift. Each names its URL in the inbox. What a tool adds for an assistant (`next`)
// stays in mcp.ts; REST answers plain data.
import * as z from "zod";
import type { Event, StoredFile, Submission } from "./db";
import { isPicture } from "./files";
import { issueUrl } from "./github";
import { linkFor } from "./links";
import { boxPath, endpointPath, filePath, formPath, submissionPath } from "./paths";
import type { Runtime } from "./runtime";
import { summaryOf } from "./summary";

/** A file without its bytes: its name, kind and size, and where to get it in the inbox and through the API. */
export const fileView = (base: string, f: StoredFile) => ({
  id: f.id,
  field: f.field,
  name: f.name,
  type: f.type,
  size: f.size,
  picture: isPicture(f),
  url: base + filePath(f.id),
  api_url: `${base}/api/v1/submissions/${encodeURIComponent(f.submission_id)}/files/${encodeURIComponent(f.id)}`,
});

export const eventView = ({ at, actor, from_state, to_state, reason }: Event) => ({ at, actor, from_state, to_state, reason });

/** A submission without its fields: what lists show. */
export function summaryView(rt: Runtime, base: string, x: Submission) {
  return {
    id: x.id,
    form: x.form,
    kind: x.kind,
    state: x.state,
    received_at: x.received_at,
    closed_at: x.closed_at,
    url: base + submissionPath(x.form, x.id),
    link: linkFor(rt.config.forms[x.form], x)?.url ?? null,
    summary: summaryOf(rt.config.forms[x.form], x, 120),
  };
}

/** A submission with its fields and history; `history` when the caller has read it already (the export). */
export function fullView(rt: Runtime, base: string, x: Submission, history: Event[] = rt.store.events(x.id)) {
  return {
    ...summaryView(rt, base, x),
    fields: x.fields,
    files: rt.store.files(x.id).map((f) => fileView(base, f)),
    github_issue_url: issueUrl(rt.config.forms[x.form], x, base),
    purged_at: x.purged_at,
    events: history.map(eventView),
  };
}

/** Every box and form, each form with its states and retention. */
export function formsView(rt: Runtime, base: string) {
  return {
    boxes: rt.config.boxes.map((name) => ({ name, url: base + boxPath(name) })),
    forms: Object.values(rt.config.forms).map((f) => ({
      name: f.name,
      box: f.box,
      title: f.title,
      kind: f.kind,
      url: base + formPath(f.name),
      states: f.states.map(({ name, closed, reason }) => ({ name, closed, reason })), // the published shape; deleteAfterMinutes shows in get_form
      retention_days: f.retentionDays,
      delete_after_days: f.deleteAfterDays,
    })),
  };
}

/** One form as it is stored (`${VAR}` references unexpanded), with its figures; undefined when there is none. */
export function formView(rt: Runtime, base: string, name: string) {
  const form = rt.forms.rawForm(name);
  const parsed = rt.config.forms[name];
  if (!form || !parsed) return undefined;
  const f = rt.store.figures(parsed, rt.now());
  return {
    name,
    url: base + formPath(name),
    endpoint: base + endpointPath(name),
    form,
    figures: {
      open: f.open,
      open_by_state: f.openByState,
      oldest_open: f.oldestOpen && { ...f.oldestOpen, url: base + submissionPath(name, f.oldestOpen.id) },
      days: f.days,
      closed: f.closed,
      closed_by_state: f.closedByState,
      next_erase: f.nextErase,
    },
  };
}

// The shapes above as schemas: MCP's output schemas and the REST API's description (openapi.json) are built from them.
const FILE = z.object({
  id: z.string(),
  field: z.string(),
  name: z.string(),
  type: z.string(),
  size: z.number(),
  picture: z.boolean(),
  url: z.string(),
  api_url: z.string(),
});
const EVENT = z.object({ at: z.string(), actor: z.string(), from_state: z.string().nullable(), to_state: z.string().nullable(), reason: z.string() });
const SUMMARY = {
  id: z.string(),
  form: z.string(),
  kind: z.string(),
  state: z.string(),
  received_at: z.string(),
  closed_at: z.string().nullable(),
  url: z.string(),
  link: z.string().nullable(),
  summary: z.string(),
};
const FULL = {
  ...SUMMARY,
  fields: z.record(z.string(), z.string()),
  files: z.array(FILE),
  github_issue_url: z.string().nullable(),
  purged_at: z.string().nullable(),
  events: z.array(EVENT),
};
const STATE = z.object({ name: z.string(), closed: z.boolean(), reason: z.boolean() });
const BOX = z.object({ name: z.string(), url: z.string() });
const FORMS = {
  boxes: z.array(BOX),
  forms: z.array(
    z.object({
      name: z.string(),
      box: z.string(),
      title: z.string(),
      kind: z.string(),
      url: z.string(),
      states: z.array(STATE),
      retention_days: z.number(),
      delete_after_days: z.number().nullable(),
    }),
  ),
};
const COUNT = z.array(z.object({ state: z.string(), n: z.number() }));
const FORM = {
  name: z.string(),
  url: z.string(),
  endpoint: z.string(),
  form: z.record(z.string(), z.unknown()),
  figures: z.object({
    open: z.number(),
    open_by_state: COUNT,
    oldest_open: z.object({ id: z.string(), received_at: z.string(), url: z.string() }).nullable(),
    days: z.number(),
    closed: z.number(),
    closed_by_state: COUNT,
    next_erase: z.object({ day: z.string(), n: z.number() }).nullable(),
  }),
};
const API_TOKEN = z.object({
  id: z.string(),
  name: z.string(),
  scope: z.enum(["read", "read+write"]),
  start: z.string(),
  created_at: z.string(),
  expires_at: z.string().nullable(),
  last_used_at: z.string().nullable(),
});
const CONNECTION = z.object({ id: z.string(), client_name: z.string(), created_at: z.string(), current: z.boolean() });

export const SCHEMAS = { FILE, EVENT, SUMMARY, FULL, STATE, BOX, FORMS, FORM, API_TOKEN, CONNECTION };
