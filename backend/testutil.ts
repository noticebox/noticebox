// Shared by the tests: a configuration with one form of each kind, a runtime on an in-memory store, request helpers,
// and the routes as the app serves them (next-app-kit's handlers over a test runtime).
import { mcpRoute as kitMcpRoute, type Who } from "next-app-kit/mcp";
import { restHandler, wellKnownHandlers } from "next-app-kit/next";
import { callTool } from "next-app-kit/testing";
import * as z from "zod";
import { parseConfig, type Config } from "./config";
import { mcpContext } from "./mcp";
import { restApp } from "./rest";
import { Store } from "./db";
import { makeRuntime, Rate, type Runtime } from "./runtime";

export type Hit = { url: string; headers: Record<string, string>; body: string };

export const SECRET = "test-secret-".padEnd(32, "x");
export const BASE = "https://inbox.test";

export function testConfig(ntfy: string | null = "https://ntfy.test/topic", webhook: string | null = "https://hook.test/in"): Config {
  return parseConfig({
    forms: {
      report: {
        kind: "report",
        title: "Report content",
        intro: "Say what is wrong.",
        fields: {
          read_id: { type: "hidden" },
          note_id: { type: "hidden" },
          file: { type: "text", label: "File", personal: false },
          reason: { type: "select", label: "Reason", required: true, options: ["Illegal content", "Personal data", "Spam", "Other"] },
          text: { type: "textarea", label: "What is wrong", required: true, max: 2000 },
          email: { type: "email", label: "Your email", help: "Only to answer you." },
        },
        retentionDays: 90,
        notify: { ntfy, webhook },
        link: { url: "https://notes.test/r/{read_id}/{note_id}", label: "Open the note" },
      },
      "contact-open": { kind: "message", origins: ["https://example.org"] },
      contact: {
        kind: "message",
        title: "Contact",
        fields: { name: { required: true }, email: { type: "email", required: true }, message: { type: "textarea", required: true } },
        strict: true,
        origins: ["https://example.org"],
        redirect: "https://example.org/thanks",
        retentionDays: 30,
      },
    },
  });
}

/** A form that takes files: up to two models or photos of at most 1 MB, and an optional sketch that is not personal. */
export function fileConfig(): Config {
  return parseConfig({
    forms: {
      order: {
        kind: "message",
        fields: {
          name: { required: true },
          model: { type: "file", label: "Model", required: true, accept: [".stl", ".3mf", "image/*"], maxFiles: 2, maxMegabytes: 1 },
          sketch: { type: "file", label: "Sketch", personal: false },
        },
        retentionDays: 30,
        deleteAfterDays: 60,
      },
      strict: { kind: "message", strict: true, fields: { name: {} } },
    },
  });
}

export type TestRuntime = Runtime & { hits: Hit[] };

export function testRuntime(o: Partial<Runtime> = {}): TestRuntime {
  const hits: Hit[] = [];
  const rt = makeRuntime({
    config: testConfig(),
    store: new Store(":memory:"),
    baseUrl: BASE,
    rate: new Rate(10),
    log: () => {},
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      const headers = Object.fromEntries(new Headers(init?.headers).entries());
      hits.push({ url: String(url), headers, body: String(init?.body ?? "") });
      return new Response("ok");
    }) as typeof fetch,
    ...o,
  });
  return Object.assign(rt, { hits });
}

export const REPORT = { read_id: "r1", note_id: "n1", file: "a.png", reason: "Spam", text: "This is spam.\r\nSecond line.", email: "who@example.org" };

export function formPost(path: string, data: Record<string, string>, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(data).toString(),
  });
}

export function jsonPost(path: string, data: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof data === "string" ? data : JSON.stringify(data),
  });
}

export async function until(check: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** POST /mcp as the app serves it: the kit checks the bearer, then the inbox's tools answer. */
export const mcpRoute = async (req: Request, rt: Runtime): Promise<Response> => kitMcpRoute(req, await mcpContext(rt));

/** /api/v1/… as the app serves it. */
export const restRoute = (req: Request, rt: Runtime): Promise<Response> =>
  restHandler(() => restApp(rt))[(req.method === "HEAD" ? "GET" : req.method) as "GET" | "POST" | "PUT" | "PATCH" | "DELETE"](req);

/** Everything under /api/auth: Better Auth answers. */
export const authRoute = async (req: Request, rt: Runtime): Promise<Response> => (await rt.auth()).handler(req);

/** The /.well-known routes as the app serves them. */
export const wellKnown = (rt: Runtime) => wellKnownHandlers(() => rt.auth());

/**
 * One MCP request for `who`, without a token, as a test's stand-in connection makes it: tools/list lists the tools as
 * the kit serves them (the output schemas with guidance), tools/call runs one through the MCP server.
 */
export async function mcpAs(rt: Runtime, who: Who, method: string, params: Record<string, unknown>): Promise<Response> {
  const ctx = await mcpContext(rt);
  if (method === "tools/list")
    return Response.json({
      result: {
        tools: ctx.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: z.toJSONSchema(t.inputSchema),
          outputSchema: z.toJSONSchema(t.outputSchema),
          annotations: t.annotations,
        })),
      },
    });
  if (method !== "tools/call") throw new Error(`mcpAs: ${method} is not a tool call`);
  return Response.json({ result: await callTool(ctx, who, String(params.name), (params.arguments ?? {}) as Record<string, unknown>) });
}
