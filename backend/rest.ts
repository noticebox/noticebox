// The REST API, /api/v1, defined in code: this table is its single source. `restRoute` serves requests through it and
// `openApiDocument` describes it (openapi.json, committed; a test fails when it is stale). MCP comes first: every
// operation names the tool it mirrors, a test checks that every tool has one, and none does what no tool does. The
// handlers call the same backend functions and views as the tools; what a tool adds for an assistant (`next`) stays
// out. Callers are API tokens and OAuth tokens for /api/v1 (tokens.ts); a `read` token may only GET.
import * as z from "zod";
import { connections, createBox, deleteBox, deleteForm, exportSubmissions, putForm, renameBox, revokeConnection } from "./admin";
import type { Outcome } from "./db";
import { boxPath, formPath } from "./paths";
import type { Runtime } from "./runtime";
import { createApiToken, listApiTokens, restCaller, revokeApiToken, type RestCaller } from "./tokens";
import { formsView, formView, fullView, SCHEMAS, summaryView } from "./views";

export const API_PREFIX = "/api/v1";

/** The largest JSON body read: a form with many fields is a few kilobytes. */
const MAX_BODY_BYTES = 256 * 1024;

type Reply = { status: number; body?: unknown };
type Input = { rt: Runtime; base: string; caller: RestCaller; params: Record<string, string>; query: Record<string, unknown>; body: unknown };

type Op = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string; // under /api/v1, with {params}
  operationId: string;
  tool: string; // the MCP tool this mirrors
  summary: string;
  tag: string;
  params?: Record<string, string>; // name: description
  query?: z.ZodObject;
  body?: z.ZodType;
  ok: { status: number; description: string; schema?: z.ZodType };
  errors: number[];
  handle: (input: Input) => Promise<Reply> | Reply;
};

const ErrorJson = z.object({ error: z.string(), code: z.string() });
const ERRORS: Record<number, [string, string]> = {
  400: ["invalid_input", "The request can't be read, or a value in it is not acceptable"],
  401: ["unauthorized", "No valid API token or OAuth access token for this API"],
  403: ["forbidden", "The token's scope is `read`, and this changes something"],
  404: ["not_found", "No such thing"],
};

const fail = (status: number, error: string): Reply => ({ status, body: { error, code: ERRORS[status]?.[0] ?? "internal" } });
/** An outcome's refusal: a missing thing is 404, anything else a value that isn't acceptable. */
const refused = (r: Outcome & { ok: false }): Reply => fail(/^no (such|form|box) /.test(r.error) ? 404 : 400, r.error);

const Name = "The name";
const Id = "The id";
const { SUMMARY, FULL, FORMS, FORM, BOX, API_TOKEN, CONNECTION } = SCHEMAS;
const Full = z.object(FULL);

export const OPS: Op[] = [
  {
    method: "GET",
    path: "/forms",
    operationId: "listForms",
    tool: "list_forms",
    summary: "The boxes and forms, each form with its states and retention",
    tag: "Forms",
    ok: { status: 200, description: "Every box and form", schema: z.object(FORMS) },
    errors: [401],
    handle: ({ rt, base }) => ({ status: 200, body: formsView(rt, base) }),
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
    handle: ({ rt, base, params }) => {
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
    handle: ({ rt, base, params, body }) => {
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
    handle: ({ rt, base, params }) => {
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
    handle: ({ rt, base, body }) => {
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
    handle: ({ rt, base, params, body }) => {
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
    handle: ({ rt, params }) => {
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
    handle: ({ rt, base, query }) => {
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
    handle: ({ rt, base, params }) => {
      const x = rt.store.get(params.id!);
      return x ? { status: 200, body: fullView(rt, base, x) } : fail(404, "no such submission");
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
    handle: ({ rt, base, caller, params, body }) => {
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
    handle: ({ rt, base, caller, params, body }) => {
      const { to, reason } = body as { to: string; reason: string };
      const x = rt.store.get(params.id!);
      const form = x && rt.config.forms[x.form];
      if (!x || !form) return fail(404, "no such submission");
      const r = rt.store.transition(form, x.id, caller.actor, to, reason, rt.now());
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
    handle: ({ rt, base, query }) => {
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
    handle: async ({ rt, caller }) => ({
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
    handle: async ({ rt, caller, params }) => {
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
    handle: async ({ rt, caller }) => ({ status: 200, body: { tokens: await listApiTokens(rt, caller.person) } }),
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
    handle: async ({ rt, caller, body }) => {
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
    handle: async ({ rt, caller, params }) => {
      const r = await revokeApiToken(rt, caller.person, params.id!);
      return r.ok ? { status: 200, body: { id: params.id, revoked: true } } : fail(404, r.error);
    },
  },
];

function match(segments: string[]): { ops: Op[]; params: Record<string, string> } | null {
  const found: Op[] = [];
  let params: Record<string, string> = {};
  for (const o of OPS) {
    const tpl = o.path.slice(1).split("/");
    if (tpl.length !== segments.length) continue;
    const p: Record<string, string> = {};
    if (tpl.every((t, i) => (t.startsWith("{") ? ((p[t.slice(1, -1)] = segments[i]!), true) : t === segments[i]))) {
      found.push(o);
      params = p;
    }
  }
  return found.length ? { ops: found, params } : null;
}

const complaint = (error: z.ZodError) => z.prettifyError(error).replace(/\s+/g, " ").replace(/^✖ /, "");

async function jsonBody(req: Request, schema: z.ZodType): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return { ok: false, error: "The request body is too large" };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "The request body must be JSON" };
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: complaint(parsed.error) };
}

/** /api/v1/<segments>: who is asking comes first, so a stranger learns nothing, not even that a parameter is wrong. */
export async function restRoute(req: Request, rt: Runtime, segments: string[]): Promise<Response> {
  const base = rt.signIn.baseUrl;
  if (segments.length === 1 && segments[0] === "openapi.json" && req.method === "GET")
    return Response.json(openApiDocument(base + API_PREFIX), { headers: { "cache-control": "no-store" } });
  const challenge = { "www-authenticate": `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource${API_PREFIX}"` };
  const send = (r: Reply) =>
    r.body === undefined
      ? new Response(null, { status: r.status })
      : Response.json(r.body, { status: r.status, headers: { "cache-control": "no-store", ...(r.status === 401 ? challenge : {}) } });
  const m = match(segments);
  if (!m) return send(fail(404, "no such endpoint"));
  const method = req.method === "HEAD" ? "GET" : req.method;
  const op = m.ops.find((o) => o.method === method);
  if (!op)
    return Response.json(
      { error: "method not allowed", code: "method_not_allowed" },
      { status: 405, headers: { Allow: m.ops.map((o) => o.method).join(", ") } },
    );
  const caller = await restCaller(req, rt);
  if (!caller) return send(fail(401, "an API token or an access token for this API is needed"));
  if (op.method !== "GET" && caller.scope !== "read+write") return send(fail(403, "this token may only read"));
  let query: Record<string, unknown> = {};
  if (op.query) {
    const raw = Object.fromEntries([...new URL(req.url).searchParams].filter(([, v]) => v !== ""));
    const parsed = op.query.safeParse(raw);
    if (!parsed.success) return send(fail(400, complaint(parsed.error)));
    query = parsed.data;
  }
  let body: unknown;
  if (op.body) {
    const b = await jsonBody(req, op.body);
    if (!b.ok) return send(fail(400, b.error));
    body = b.data;
  }
  const params = Object.fromEntries(Object.entries(m.params).map(([k, v]) => [k, decodeURIComponent(v)]));
  try {
    return send(await op.handle({ rt, base, caller, params, query, body }));
  } catch (e) {
    rt.log(`api ${op.operationId}: ${(e as Error).message}`);
    return Response.json({ error: "internal error", code: "internal" }, { status: 500 });
  }
}

const jsonSchema = (s: z.ZodType, io: "input" | "output") => {
  const { $schema: _drop, ...rest } = z.toJSONSchema(s, { io, unrepresentable: "any" }) as Record<string, unknown>;
  void _drop;
  return rest;
};

/** The OpenAPI 3.1 description of the table, served at /api/v1/openapi.json and committed as openapi.json. */
export function openApiDocument(serverUrl: string): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const o of OPS) {
    const parameters = [
      ...Object.entries(o.params ?? {}).map(([name, description]) => ({ name, in: "path", required: true, description, schema: { type: "string" } })),
      ...Object.entries((o.query?.shape ?? {}) as Record<string, z.ZodType>).map(([name, s]) => ({
        name,
        in: "query",
        required: false,
        ...(s.description && { description: s.description }),
        schema: jsonSchema(s, "input"),
      })),
    ];
    const responses: Record<string, unknown> = {
      [o.ok.status]: { description: o.ok.description, ...(o.ok.schema && { content: { "application/json": { schema: jsonSchema(o.ok.schema, "output") } } }) },
    };
    for (const status of o.errors)
      responses[status] = {
        description: `${ERRORS[status]![1]} (\`${ERRORS[status]![0]}\`)`,
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      };
    paths[o.path] = {
      ...paths[o.path],
      [o.method.toLowerCase()]: {
        operationId: o.operationId,
        summary: o.summary,
        description: `The REST counterpart of the MCP tool \`${o.tool}\`.`,
        tags: [o.tag],
        security: [{ bearer: [] }],
        ...(parameters.length && { parameters }),
        ...(o.body && { requestBody: { required: true, content: { "application/json": { schema: jsonSchema(o.body, "input") } } } }),
        responses,
      },
    };
  }
  return {
    openapi: "3.1.1",
    info: {
      title: "noticebox API",
      version: "1",
      description:
        "An inbox for the forms on static pages. MCP (/mcp) is the main interface; this API follows it: every operation mirrors an MCP tool, over the same data and rules, as the person the token belongs to.\n\n" +
        'Every error is JSON, `{"error": "...", "code": "..."}`. Besides the responses listed per operation, an unknown path answers 404, a method an operation doesn\'t have 405 with `Allow`, and a failure on the server\'s side 500 (`internal`) without details.',
      license: { name: "AGPL-3.0-only", identifier: "AGPL-3.0-only" },
    },
    servers: [{ url: serverUrl }],
    tags: [
      { name: "Forms", description: "The forms the inbox takes." },
      { name: "Boxes", description: "The groups the forms are listed under." },
      { name: "Submissions", description: "What came in, its history, and the decisions on it." },
      { name: "Access", description: "The person's MCP connections and API tokens." },
    ],
    paths,
    components: {
      schemas: { Error: jsonSchema(ErrorJson, "output") },
      securitySchemes: {
        bearer: {
          type: "http",
          scheme: "bearer",
          description:
            "An API token (`nbx_…`, made in Your settings or over MCP; a `read` token may only GET), or an OAuth access token from this instance issued for this API (`resource=<base>/api/v1`). A token for /mcp is refused here.",
        },
      },
    },
  };
}
