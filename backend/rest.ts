// The REST API, /api/v1, defined in code: this table is its single source. next-app-kit/rest serves requests through
// it and describes it (openapi.json, committed; a test fails when it is stale). MCP comes first: every operation names
// the tool it mirrors, a test checks that every tool has one, and none does what no tool does. The handlers call the
// same backend functions and views as the tools; what a tool adds for an assistant (`guidance`) stays out. Callers are
// API tokens and OAuth tokens for /api/v1 (next-app-kit/tokens); a `read` token may only GET.
import { API_PREFIX, fail, openApiDocument as kitOpenApiDocument, type OpenApiInfo, type Op, type Reply } from "next-app-kit/rest";
import type { RestApp } from "next-app-kit/next";
import * as z from "zod";
import {
  connections,
  createApiToken,
  createBox,
  deleteBox,
  deleteForm,
  exportSubmissions,
  listApiTokens,
  putForm,
  renameBox,
  revokeApiToken,
  revokeConnection,
} from "./admin";
import type { Outcome } from "./db";
import { decide } from "./decide";
import { fileResponse } from "./files";
import { boxPath, formPath } from "./paths";
import type { Runtime } from "./runtime";
import { formsView, formView, fullView, SCHEMAS, summaryView } from "./views";

export { API_PREFIX };

/** An outcome's refusal: a missing thing is 404, anything else a value that isn't acceptable. */
const refused = (r: Outcome & { ok: false }): Reply => fail(/^no (such|form|box) /.test(r.error) ? 404 : 400, r.error);

const Name = "The name";
const Id = "The id";
const { SUMMARY, FULL, FORMS, FORM, BOX, API_TOKEN, CONNECTION } = SCHEMAS;
const Full = z.object(FULL);

export const OPS: Op<Runtime>[] = [
  {
    method: "GET",
    path: "/forms",
    operationId: "listForms",
    tool: "list_forms",
    summary: "The boxes and forms, each form with its states and retention",
    tag: "Forms",
    ok: { status: 200, description: "Every box and form", schema: z.object(FORMS) },
    errors: [401],
    handle: ({ ctx: rt, base }) => ({ status: 200, body: formsView(rt, base) }),
  },
  {
    method: "GET",
    path: "/forms/{name}",
    operationId: "getForm",
    tool: "get_form",
    summary: "One form as stored, `${VAR}` references unexpanded, with its figures",
    tag: "Forms",
    params: { name: Name },
    ok: { status: 200, description: "The form", schema: z.object(FORM) },
    errors: [401, 404],
    handle: ({ ctx: rt, base, params }) => {
      const view = formView(rt, base, params.name!);
      return view ? { status: 200, body: view } : fail(404, `no form called "${params.name}"`);
    },
  },
  {
    method: "PUT",
    path: "/forms/{name}",
    operationId: "putForm",
    tool: "put_form",
    summary: "Create a form, or replace it as a whole; validated before anything is saved",
    tag: "Forms",
    params: { name: "lowercase letters, digits, - and _" },
    body: z.record(z.string(), z.unknown()).describe("The form, as getForm returns it under `form`"),
    ok: {
      status: 200,
      description: "Saved",
      schema: z.object({ name: z.string(), created: z.boolean(), url: z.string(), endpoint: z.string(), form: z.record(z.string(), z.unknown()) }),
    },
    errors: [400, 401, 403],
    handle: ({ ctx: rt, base, params, body }) => {
      const r = putForm(rt, params.name!, body as Record<string, unknown>);
      if (!r.ok) return fail(400, r.error);
      const view = formView(rt, base, params.name!)!;
      return { status: 200, body: { name: view.name, created: r.created === true, url: view.url, endpoint: view.endpoint, form: view.form } };
    },
  },
  {
    method: "DELETE",
    path: "/forms/{name}",
    operationId: "deleteForm",
    tool: "delete_form",
    summary: "Delete a form that has no submissions",
    tag: "Forms",
    params: { name: Name },
    ok: { status: 200, description: "Deleted; its box stays", schema: z.object({ name: z.string(), deleted: z.boolean(), box: BOX }) },
    errors: [400, 401, 403, 404],
    handle: ({ ctx: rt, base, params }) => {
      const box = rt.config.forms[params.name!]?.box;
      const r = deleteForm(rt, params.name!);
      return r.ok ? { status: 200, body: { name: params.name, deleted: true, box: { name: box, url: base + boxPath(box!) } } } : refused(r);
    },
  },
  {
    method: "POST",
    path: "/boxes",
    operationId: "createBox",
    tool: "create_box",
    summary: "Create a box",
    tag: "Boxes",
    body: z.object({ name: z.string().describe("letters, digits, spaces, . _ and -, up to 40 characters") }),
    ok: { status: 201, description: "Created", schema: BOX },
    errors: [400, 401, 403],
    handle: ({ ctx: rt, base, body }) => {
      const { name } = body as { name: string };
      const r = createBox(rt, name);
      return r.ok ? { status: 201, body: { name, url: base + boxPath(name) } } : fail(400, r.error);
    },
  },
  {
    method: "PATCH",
    path: "/boxes/{name}",
    operationId: "renameBox",
    tool: "rename_box",
    summary: "Rename a box; its forms move along",
    tag: "Boxes",
    params: { name: "The current name" },
    body: z.object({ name: z.string().describe("The new name") }),
    ok: { status: 200, description: "Renamed", schema: z.object({ name: z.string(), url: z.string(), forms: z.array(BOX) }) },
    errors: [400, 401, 403, 404],
    handle: ({ ctx: rt, base, params, body }) => {
      const to = (body as { name: string }).name;
      const r = renameBox(rt, params.name!, to);
      if (!r.ok) return refused(r);
      const forms = Object.values(rt.config.forms)
        .filter((f) => f.box === to)
        .map((f) => ({ name: f.name, url: base + formPath(f.name) }));
      return { status: 200, body: { name: to, url: base + boxPath(to), forms } };
    },
  },
  {
    method: "DELETE",
    path: "/boxes/{name}",
    operationId: "deleteBox",
    tool: "delete_box",
    summary: "Delete an empty box",
    tag: "Boxes",
    params: { name: Name },
    ok: { status: 200, description: "Deleted", schema: z.object({ name: z.string(), deleted: z.boolean() }) },
    errors: [400, 401, 403],
    handle: ({ ctx: rt, params }) => {
      const r = deleteBox(rt, params.name!);
      return r.ok ? { status: 200, body: { name: params.name, deleted: true } } : fail(400, r.error);
    },
  },
  {
    method: "GET",
    path: "/submissions",
    operationId: "listSubmissions",
    tool: "list_submissions",
    summary: "Submissions newest first, without their fields; by default only the open ones",
    tag: "Submissions",
    query: z.object({
      form: z.string().optional(),
      state: z.string().optional(),
      open: z.enum(["true", "false"]).optional().describe("true: not yet closed (the default without a state); false: closed"),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
    ok: { status: 200, description: "The submissions", schema: z.object({ submissions: z.array(z.object(SUMMARY)) }) },
    errors: [400, 401],
    handle: ({ ctx: rt, base, query }) => {
      const { form, state, limit } = query as { form?: string; state?: string; open?: string; limit: number };
      const open = query.open === undefined ? undefined : query.open === "true";
      const list = rt.store.list({ form, state, open: state ? open : (open ?? true), limit }).map((x) => summaryView(rt, base, x));
      return { status: 200, body: { submissions: list } };
    },
  },
  {
    method: "GET",
    path: "/submissions/{id}",
    operationId: "getSubmission",
    tool: "get_submission",
    summary: "One submission with its fields and history",
    tag: "Submissions",
    params: { id: Id },
    ok: { status: 200, description: "The submission", schema: Full },
    errors: [401, 404],
    handle: ({ ctx: rt, base, params }) => {
      const x = rt.store.get(params.id!);
      return x ? { status: 200, body: fullView(rt, base, x) } : fail(404, "no such submission");
    },
  },
  {
    method: "GET",
    path: "/submissions/{id}/files/{file}",
    operationId: "getFile",
    tool: "get_file",
    summary: "A file that came with a submission, as a download",
    tag: "Submissions",
    params: { id: Id, file: "The file's id, from the submission's `files`" },
    ok: { status: 200, description: "The file's bytes, as `application/octet-stream` with its name in `Content-Disposition`", binary: true },
    errors: [401, 404],
    handle: ({ ctx: rt, params }) => {
      const res = fileResponse(rt, params.file!, { submissionId: params.id! });
      return res ? { status: 200, raw: res } : fail(404, "no such file on this submission");
    },
  },
  {
    method: "POST",
    path: "/submissions/{id}/notes",
    operationId: "addNote",
    tool: "add_note",
    summary: "Add a note to a submission's history without changing its state",
    tag: "Submissions",
    params: { id: Id },
    body: z.object({ text: z.string().min(1).max(10000) }),
    ok: { status: 200, description: "The submission, with the note", schema: Full },
    errors: [400, 401, 403, 404],
    handle: ({ ctx: rt, base, caller, params, body }) => {
      const r = rt.store.note(params.id!, caller.actor, (body as { text: string }).text, rt.now());
      return r.ok ? { status: 200, body: fullView(rt, base, rt.store.get(params.id!)!) } : refused(r);
    },
  },
  {
    method: "POST",
    path: "/submissions/{id}/decisions",
    operationId: "decide",
    tool: "decide",
    summary: "Move a submission to another of its form's states, with the reason",
    tag: "Submissions",
    params: { id: Id },
    body: z.object({ to: z.string(), reason: z.string().max(10000).default("") }),
    ok: { status: 200, description: "The submission, in its new state", schema: Full },
    errors: [400, 401, 403, 404],
    handle: ({ ctx: rt, base, caller, params, body }) => {
      const { to, reason } = body as { to: string; reason: string };
      const x = rt.store.get(params.id!);
      const form = x && rt.config.forms[x.form];
      if (!x || !form) return fail(404, "no such submission");
      const r = decide(rt, form, x.id, caller.actor, to, reason, base);
      return r.ok ? { status: 200, body: fullView(rt, base, rt.store.get(x.id)!) } : fail(400, r.error);
    },
  },
  {
    method: "GET",
    path: "/export",
    operationId: "export",
    tool: "export",
    summary: "Every submission with its fields and history, newest first, up to 1000; or one form's, or one state's",
    tag: "Submissions",
    query: z.object({ form: z.string().optional(), state: z.string().optional() }),
    ok: { status: 200, description: "The submissions", schema: z.object({ submissions: z.array(Full) }) },
    errors: [400, 401],
    handle: ({ ctx: rt, base, query }) => {
      const rows = exportSubmissions(rt, query as { form?: string; state?: string }).map((x) => fullView(rt, base, x, x.events));
      return { status: 200, body: { submissions: rows } };
    },
  },
  {
    method: "GET",
    path: "/connections",
    operationId: "listConnections",
    tool: "list_connections",
    summary: "The assistants the token's person allowed over MCP, newest first",
    tag: "Access",
    ok: { status: 200, description: "The connections", schema: z.object({ connections: z.array(CONNECTION) }) },
    errors: [401],
    handle: async ({ ctx: rt, caller }) => ({
      status: 200,
      body: {
        connections: (await connections(rt, caller.person)).map((c) => ({ id: c.id, client_name: c.client_name, created_at: c.created_at, current: false })),
      },
    }),
  },
  {
    method: "DELETE",
    path: "/connections/{id}",
    operationId: "revokeConnection",
    tool: "revoke_connection",
    summary: "Revoke one of the person's MCP connections",
    tag: "Access",
    params: { id: Id },
    ok: { status: 200, description: "Revoked", schema: z.object({ id: z.string(), revoked: z.boolean() }) },
    errors: [401, 403, 404],
    handle: async ({ ctx: rt, caller, params }) => {
      const r = await revokeConnection(rt, caller.person, params.id!);
      return r.ok ? { status: 200, body: { id: params.id, revoked: true } } : fail(404, r.error);
    },
  },
  {
    method: "GET",
    path: "/tokens",
    operationId: "listApiTokens",
    tool: "list_api_tokens",
    summary: "The person's API tokens, newest first; never the tokens themselves",
    tag: "Access",
    ok: { status: 200, description: "The tokens", schema: z.object({ tokens: z.array(API_TOKEN) }) },
    errors: [401],
    handle: async ({ ctx: rt, caller }) => ({ status: 200, body: { tokens: await listApiTokens(rt, caller.person) } }),
  },
  {
    method: "POST",
    path: "/tokens",
    operationId: "createApiToken",
    tool: "create_api_token",
    summary: "Make an API token for the person; the token is in this answer only",
    tag: "Access",
    body: z.object({
      name: z.string().min(1).max(60),
      scope: z.enum(["read", "read+write"]).default("read"),
      days: z.number().int().min(1).max(365).nullable().optional().describe("Default 90; null for no expiry"),
    }),
    ok: { status: 201, description: "Created", schema: API_TOKEN.extend({ token: z.string() }) },
    errors: [400, 401, 403],
    handle: async ({ ctx: rt, caller, body }) => {
      const r = await createApiToken(rt, caller.person, body as { name: string; scope: "read" | "read+write"; days?: number | null });
      return "error" in r ? fail(400, r.error) : { status: 201, body: r };
    },
  },
  {
    method: "DELETE",
    path: "/tokens/{id}",
    operationId: "revokeApiToken",
    tool: "revoke_api_token",
    summary: "Revoke one of the person's API tokens",
    tag: "Access",
    params: { id: Id },
    ok: { status: 200, description: "Revoked", schema: z.object({ id: z.string(), revoked: z.boolean() }) },
    errors: [401, 403, 404],
    handle: async ({ ctx: rt, caller, params }) => {
      const r = await revokeApiToken(rt, caller.person, params.id!);
      return r.ok ? { status: 200, body: { id: params.id, revoked: true } } : fail(404, r.error);
    },
  },
];

/** What the OpenAPI document says about noticebox besides its operations. */
export const OPEN_API: OpenApiInfo = {
  title: "noticebox API",
  version: "1",
  description:
    "An inbox for the forms on static pages. MCP (/mcp) is the main interface; this API follows it: every operation mirrors an MCP tool, over the same data and rules, as the person the token belongs to.",
  license: { name: "AGPL-3.0-only", identifier: "AGPL-3.0-only" },
  tags: [
    { name: "Forms", description: "The forms the inbox takes." },
    { name: "Boxes", description: "The groups the forms are listed under." },
    { name: "Submissions", description: "What came in, its history, and the decisions on it." },
    { name: "Access", description: "The person's MCP connections and API tokens." },
  ],
  bearer:
    "An API token (`nbx_…`, made in Your settings or over MCP; a `read` token may only GET), or an OAuth access token from this instance issued for this API (`resource=<base>/api/v1`). A token for /mcp is refused here.",
};

/** The OpenAPI 3.1 description of the table, served at /api/v1/openapi.json and committed as openapi.json. */
export const openApiDocument = (serverUrl: string): Record<string, unknown> => kitOpenApiDocument(OPS, { ...OPEN_API, serverUrl });

/** What /api/v1 serves: the table, over this runtime. */
export async function restApp(rt: Runtime): Promise<RestApp<Runtime>> {
  return { auth: await rt.auth(), signIn: rt.signIn, ops: OPS, ctx: rt, log: rt.log, openApi: OPEN_API };
}
