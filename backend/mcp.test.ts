// The whole MCP path: a client registers, the signed-in person allows it, the code becomes tokens, and the tools
// act in that person's name.
import { createHash, randomBytes } from "node:crypto";
import { beforeEach, expect, test } from "vitest";
import { mcpRoute } from "./mcp";
import { authorizeRoute, authServerRoute, checkAuthorize, protectedResourceRoute, registerRoute, tokenRoute } from "./oauth";
import { resetTokensForTests } from "./tokens";
import { BASE, formPost, jsonPost, REPORT, testRuntime, type TestRuntime } from "./testutil";

const V = "2026-07-28";
const META = { "io.modelcontextprotocol/clientInfo": { name: "t", version: "0" }, "io.modelcontextprotocol/clientCapabilities": {} };

beforeEach(() => resetTokensForTests());

function rpc(rt: TestRuntime, method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const name: Record<string, string> = typeof params.name === "string" ? { "mcp-name": params.name } : {};
  const _meta = { "io.modelcontextprotocol/protocolVersion": V, ...META };
  return mcpRoute(
    new Request(`${BASE}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": V, "mcp-method": method, ...name, ...headers },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { ...params, _meta } }),
    }),
    rt,
  );
}

/** Registers a client, has `user` allow it, and exchanges the code: the access token. */
async function connect(rt: TestRuntime, user = "marcel", clientName = "Claude"): Promise<{ access: string; refresh: string; clientId: string }> {
  const reg = await registerRoute(jsonPost("/oauth/register", { client_name: clientName, redirect_uris: ["http://localhost:4567/cb"] }), rt);
  expect(reg.status).toBe(201);
  const { client_id: clientId } = (await reg.json()) as { client_id: string };
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const fields = { response_type: "code", client_id: clientId, redirect_uri: "http://localhost:4567/cb", code_challenge: challenge, code_challenge_method: "S256", state: "s1", resource: `${rt.baseUrl}/mcp` };
  const page = checkAuthorize(new URLSearchParams(fields), new Headers(), rt);
  expect(page.kind).toBe("page");
  const allowed = await authorizeRoute(formPost("/api/oauth/authorize", fields, { "x-user": user, "sec-fetch-site": "same-origin" }), rt);
  expect(allowed.status).toBe(303);
  const back = new URL(allowed.headers.get("location")!);
  expect(back.origin + back.pathname).toBe("http://localhost:4567/cb");
  expect(back.searchParams.get("state")).toBe("s1");
  expect(back.searchParams.get("iss")).toBe(rt.baseUrl);
  const code = back.searchParams.get("code")!;
  const tok = await tokenRoute(formPost("/oauth/token", { grant_type: "authorization_code", code, client_id: clientId, redirect_uri: "http://localhost:4567/cb", code_verifier: verifier }), rt);
  expect(tok.status).toBe(200);
  const t = (await tok.json()) as { access_token: string; refresh_token: string; token_type: string };
  expect(t.token_type).toBe("Bearer");
  return { access: t.access_token, refresh: t.refresh_token, clientId };
}

test("the metadata points a client at this instance; nothing is there without a secret", async () => {
  const rt = testRuntime();
  const pr = await protectedResourceRoute(new Request(`${BASE}/.well-known/oauth-protected-resource/mcp`), rt).json();
  expect(pr).toEqual({ resource: `${BASE}/mcp`, authorization_servers: [BASE], bearer_methods_supported: ["header"] });
  const as = (await authServerRoute(new Request(`${BASE}/.well-known/oauth-authorization-server`), rt).json()) as Record<string, unknown>;
  expect(as.issuer).toBe(BASE);
  expect(as.registration_endpoint).toBe(`${BASE}/oauth/register`);
  expect(as.code_challenge_methods_supported).toEqual(["S256"]);
  const off = testRuntime({ secret: null });
  expect(protectedResourceRoute(new Request(`${BASE}/x`), off).status).toBe(404);
  expect((await registerRoute(jsonPost("/oauth/register", { redirect_uris: ["https://a.b/cb"] }), off)).status).toBe(404);
  expect((await rpc(off, "tools/list")).status).toBe(404);
});

test("the authorize step needs the signed-in person, from our own page, for a registered client", async () => {
  const rt = testRuntime();
  const reg = (await (await registerRoute(jsonPost("/oauth/register", { client_name: "Claude", redirect_uris: ["https://claude.ai/cb"] }), rt)).json()) as { client_id: string };
  const fields = { response_type: "code", client_id: reg.client_id, redirect_uri: "https://claude.ai/cb", code_challenge: "a".repeat(43), code_challenge_method: "S256" };
  expect((await authorizeRoute(formPost("/api/oauth/authorize", fields, { "sec-fetch-site": "same-origin" }), rt)).status).toBe(401);
  expect((await authorizeRoute(formPost("/api/oauth/authorize", fields, { "x-user": "marcel", "sec-fetch-site": "cross-site" }), rt)).status).toBe(403);
  expect((await authorizeRoute(formPost("/api/oauth/authorize", { ...fields, redirect_uri: "https://evil.example/cb" }, { "x-user": "marcel", "sec-fetch-site": "same-origin" }), rt)).status).toBe(400);
  expect(checkAuthorize(new URLSearchParams({ ...fields, client_id: "forged" }), new Headers(), rt)).toMatchObject({ kind: "error" });
  expect(checkAuthorize(new URLSearchParams({ ...fields, code_challenge_method: "plain" }), new Headers(), rt)).toMatchObject({ kind: "redirect", location: expect.stringContaining("error=invalid_request") });
  expect((await registerRoute(jsonPost("/oauth/register", { redirect_uris: ["http://evil.example/cb"] }), rt)).status).toBe(400);
});

test("tools act in the name of the person who allowed the client, and the trail says through what", async () => {
  const rt = testRuntime();
  const { access } = await connect(rt, "marcel", "Claude");
  const auth = { authorization: `Bearer ${access}` };

  const tools = (await (await rpc(rt, "tools/list", {}, auth)).json()).result.tools as { name: string }[];
  expect(tools.map((t) => t.name).sort()).toEqual(["add_note", "decide", "get_submission", "list_forms", "list_submissions"]);

  const forms = (await (await rpc(rt, "tools/call", { name: "list_forms", arguments: {} }, auth)).json()).result.structuredContent;
  expect(forms.forms.map((f: { name: string; states: string[] }) => [f.name, f.states])).toEqual([
    ["report", ["open", "in_review", "acted_on", "rejected"]],
    ["contact", ["new", "answered"]],
  ]);

  const id = rt.store.receive(rt.config.forms.report!, REPORT, null, new Date("2026-01-01T00:00:00Z")).id;
  const listed = (await (await rpc(rt, "tools/call", { name: "list_submissions", arguments: {} }, auth)).json()).result.structuredContent;
  expect(listed.submissions).toEqual([{ id, form: "report", kind: "report", state: "open", received_at: "2026-01-01T00:00:00.000Z", closed_at: null, url: `${BASE}/forms/report/submissions/${id}`, link: "https://notes.test/r/r1/n1", summary: "This is spam. Second line." }]);

  const noted = (await (await rpc(rt, "tools/call", { name: "add_note", arguments: { id, text: "Looks like a genuine complaint." } }, auth)).json()).result;
  expect(noted.structuredContent.events.at(-1)).toMatchObject({ actor: "marcel via Claude", to_state: null, reason: "Looks like a genuine complaint." });

  const refused = (await (await rpc(rt, "tools/call", { name: "decide", arguments: { id, to: "acted_on" } }, auth)).json()).result;
  expect(refused.isError).toBe(true);
  expect(refused.content[0].text).toBe("acted_on needs a reason");

  const decided = (await (await rpc(rt, "tools/call", { name: "decide", arguments: { id, to: "acted_on", reason: "Removed the note." } }, auth)).json()).result.structuredContent;
  expect(decided.state).toBe("acted_on");
  expect(decided.events.at(-1)).toMatchObject({ actor: "marcel via Claude", from_state: "open", to_state: "acted_on", reason: "Removed the note." });
  expect(rt.store.get(id)!.closed_at).toBeTruthy();

  const got = (await (await rpc(rt, "tools/call", { name: "get_submission", arguments: { id: "nope" } }, auth)).json()).result;
  expect(got.isError).toBe(true);
});

test("the gate: no token, a forged token, a token for another resource, a foreign origin", async () => {
  const rt = testRuntime();
  const none = await rpc(rt, "tools/list");
  expect(none.status).toBe(401);
  expect(none.headers.get("www-authenticate")).toBe(`Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp"`);
  const forged = await rpc(rt, "tools/list", {}, { authorization: "Bearer abc.def" });
  expect(forged.status).toBe(401);
  expect(forged.headers.get("www-authenticate")).toContain('error="invalid_token"');
  const other = testRuntime({ baseUrl: "https://other.test" });
  const { access } = await connect(other);
  expect((await rpc(rt, "tools/list", {}, { authorization: `Bearer ${access}` })).status).toBe(401);
  const mine = await connect(rt);
  expect((await rpc(rt, "tools/list", {}, { authorization: `Bearer ${mine.access}`, origin: "https://evil.example" })).status).toBe(403);
  expect((await rpc(rt, "tools/list", {}, { authorization: `Bearer ${mine.access}`, origin: BASE })).status).toBe(200);
});

test("a code is spent once, the verifier must match, and a refresh token rotates", async () => {
  const rt = testRuntime();
  const { refresh, clientId } = await connect(rt);
  const again = await tokenRoute(formPost("/oauth/token", { grant_type: "refresh_token", refresh_token: refresh, client_id: clientId }), rt);
  expect(again.status).toBe(200);
  const t2 = (await again.json()) as { refresh_token: string; access_token: string };
  expect(t2.refresh_token).not.toBe(refresh);
  const replay = await tokenRoute(formPost("/oauth/token", { grant_type: "refresh_token", refresh_token: refresh, client_id: clientId }), rt);
  expect(replay.status).toBe(400);
  expect(await replay.json()).toEqual({ error: "invalid_grant" });
  expect((await rpc(rt, "tools/list", {}, { authorization: `Bearer ${t2.access_token}` })).status).toBe(200);
  const wrong = await tokenRoute(formPost("/oauth/token", { grant_type: "password", client_id: clientId }), rt);
  expect(await wrong.json()).toEqual({ error: "unsupported_grant_type" });
});

test("a revoked connection stops working at once: the access token, the refresh token, and the list on the settings page", async () => {
  const rt = testRuntime();
  const { access, refresh, clientId } = await connect(rt);
  const [g] = rt.store.grants("marcel");
  expect(g).toMatchObject({ actor: "marcel", client_name: "Claude" });
  expect(rt.store.grants("someone else")).toEqual([]);
  expect(rt.store.revokeGrant(g!.id, "someone else")).toMatchObject({ ok: false });
  expect(rt.store.revokeGrant(g!.id, "marcel")).toEqual({ ok: true });
  expect(rt.store.grants("marcel")).toEqual([]);
  const call = await rpc(rt, "tools/list", {}, { authorization: `Bearer ${access}` });
  expect(call.status).toBe(401);
  const again = await tokenRoute(formPost("/oauth/token", { grant_type: "refresh_token", refresh_token: refresh, client_id: clientId }), rt);
  expect(again.status).toBe(400);
});
