// The REST API: it mirrors MCP tool for tool, its description is committed and current, and API tokens act as their
// person within their scope, on /api/v1 only. OAuth tokens for /api/v1 and /mcp are tried over HTTP in accounts.test.ts.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import { mcpAs, mcpRoute } from "./mcp";
import { OPS, openApiDocument, restRoute } from "./rest";
import { createApiToken, listApiTokens, revokeApiToken } from "./tokens";
import { BASE, REPORT, testRuntime, type TestRuntime } from "./testutil";

type Adapter = { create(q: { model: string; data: Record<string, unknown> }): Promise<Record<string, unknown>> };

async function person(rt: TestRuntime, username = "marcel"): Promise<string> {
  const ctx = await (await rt.auth()).$context;
  const now = new Date();
  const u = await (ctx.adapter as unknown as Adapter).create({
    model: "user",
    data: { email: `${username}@test.example`, name: username, username, emailVerified: true, createdAt: now, updatedAt: now },
  });
  return String(u.id);
}

const api = (rt: TestRuntime, method: string, path: string, token: string | null, body?: unknown) =>
  restRoute(
    new Request(`${BASE}/api/v1${path}`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    rt,
    path.split("?")[0]!.slice(1).split("/"),
  );

async function tokenFor(rt: TestRuntime, id: string, scope: "read" | "read+write" = "read+write", days?: number | null) {
  const t = await createApiToken(rt, id, { name: "script", scope, days });
  if ("error" in t) throw new Error(t.error);
  return t;
}

test("every MCP tool has its REST operation, and nothing else is there", async () => {
  const rt = testRuntime();
  const me = await person(rt);
  const req = new Request(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2026-07-28",
      "mcp-method": "tools/list",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": { name: "t", version: "0" },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  });
  const tools = (
    (await (await mcpAs(req, rt, { actor: "marcel via t", person: me, clientId: "t", base: BASE })).json()).result.tools as { name: string }[]
  ).map((t) => t.name);
  expect(OPS.map((o) => o.tool).sort()).toEqual(tools.sort());
  expect(new Set(OPS.map((o) => o.operationId)).size).toBe(OPS.length);
});

test("openapi.json is committed and current (UPDATE_OPENAPI=1 rewrites it), and every operation needs a token", async () => {
  const file = join(import.meta.dirname, "../openapi.json");
  const generated = JSON.stringify(openApiDocument("https://inbox.example.org/api/v1"), null, 2) + "\n";
  if (process.env.UPDATE_OPENAPI === "1") await writeFile(file, generated);
  expect(await readFile(file, "utf8").catch(() => "missing")).toBe(generated);
  const doc = openApiDocument("https://x/api/v1") as { paths: Record<string, Record<string, { security: unknown[] }>> };
  for (const item of Object.values(doc.paths)) for (const o of Object.values(item)) expect(o.security).toEqual([{ bearer: [] }]);
});

test("an API token acts as its person on REST, within its scope; no token, a revoked or an expired one gets 401", async () => {
  const rt = testRuntime();
  const me = await person(rt);
  expect((await api(rt, "GET", "/forms", null)).status).toBe(401);
  expect((await api(rt, "GET", "/forms", null)).headers.get("www-authenticate")).toContain(`${BASE}/.well-known/oauth-protected-resource/api/v1`);
  expect((await api(rt, "GET", "/forms", "nbx_forged")).status).toBe(401);

  const write = await tokenFor(rt, me);
  expect(write.token.startsWith("nbx_")).toBe(true);
  const forms = await (await api(rt, "GET", "/forms", write.token)).json();
  expect(forms.forms.map((f: { name: string }) => f.name)).toEqual(["report", "contact-open", "contact"]);
  const id = rt.store.receive(rt.config.forms.report!, REPORT, null, new Date()).id;
  const decided = await api(rt, "POST", `/submissions/${id}/decisions`, write.token, { to: "rejected", reason: "Not spam." });
  expect(decided.status).toBe(200);
  expect((await decided.json()).events.at(-1)).toMatchObject({ actor: "marcel", to_state: "rejected", reason: "Not spam." });
  expect((await api(rt, "POST", `/submissions/${id}/decisions`, write.token, { to: "acted_on" })).status).toBe(400);
  expect((await api(rt, "GET", "/submissions/nope", write.token)).status).toBe(404);
  expect((await api(rt, "PUT", "/forms/spare", write.token, { kind: "poll" })).status).toBe(400);
  expect((await api(rt, "PUT", "/forms/spare", write.token, { kind: "message" })).status).toBe(200);
  expect((await api(rt, "PATCH", "/forms/spare", write.token, {})).status).toBe(405);

  const read = await tokenFor(rt, me, "read");
  expect((await api(rt, "GET", `/submissions/${id}`, read.token)).status).toBe(200);
  const refused = await api(rt, "POST", `/submissions/${id}/notes`, read.token, { text: "Hi" });
  expect(refused.status).toBe(403);
  expect(await refused.json()).toEqual({ error: "this token may only read", code: "forbidden" });

  expect(await revokeApiToken(rt, me, read.id)).toEqual({ ok: true });
  expect((await api(rt, "GET", "/forms", read.token)).status).toBe(401);
  const short = await tokenFor(rt, me, "read", 1);
  const ctx = await (await rt.auth()).$context;
  await ctx.adapter.update({ model: "apikey", where: [{ field: "id", value: short.id }], update: { expiresAt: new Date(Date.now() - 1000) } });
  expect((await api(rt, "GET", "/forms", short.token)).status).toBe(401);
});

test("tokens: made on the web or over MCP, in one list, never stored as given, and useless on /mcp", async () => {
  const rt = testRuntime();
  const me = await person(rt);
  const other = await person(rt, "anna");
  const web = await tokenFor(rt, me, "read", null);
  expect(web.expires_at).toBeNull();
  const viaApi = await api(rt, "POST", "/tokens", web.token, { name: "x" });
  expect(viaApi.status).toBe(403); // a read token makes no tokens
  const writer = await tokenFor(rt, me);
  const made = await (await api(rt, "POST", "/tokens", writer.token, { name: "nightly backup", scope: "read" })).json();
  expect(made).toMatchObject({ name: "nightly backup", scope: "read" });
  expect(new Date(made.expires_at).getTime() - Date.now()).toBeGreaterThan(89 * 86400000);
  expect(await createApiToken(rt, me, { name: "too long", scope: "read", days: 400 })).toEqual({
    error: "a token lives 1 to 365 days, or has no expiry when chosen explicitly",
  });

  const listed = await listApiTokens(rt, me);
  expect(listed.map((t) => t.name).sort()).toEqual(["nightly backup", "script", "script"]);
  expect(JSON.stringify(listed)).not.toContain(web.token);
  expect(await listApiTokens(rt, other)).toEqual([]);
  expect(await revokeApiToken(rt, other, web.id)).toEqual({ ok: false, error: "no such token" });

  const ctx = await (await rt.auth()).$context;
  const rows = (await ctx.adapter.findMany({ model: "apikey" })) as Record<string, unknown>[];
  for (const t of [web.token, writer.token, made.token]) expect(JSON.stringify(rows)).not.toContain(t);

  const mcp = await mcpRoute(
    new Request(`${BASE}/mcp`, { method: "POST", headers: { authorization: `Bearer ${writer.token}`, "content-type": "application/json" }, body: "{}" }),
    rt,
  );
  expect(mcp.status).toBe(401);
});
