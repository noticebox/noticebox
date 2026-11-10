// The whole MCP path: a client registers, the signed-in person allows it, the code becomes tokens, and the tools
// act in that person's name.
import { createHash, randomBytes } from "node:crypto";
import { beforeEach, expect, test } from "vitest";
import { mcpRoute } from "./mcp";
import { authorizeRoute, authServerRoute, checkAuthorize, protectedResourceRoute, registerRoute, tokenRoute } from "./oauth";
import { resetTokensForTests } from "./tokens";
import { BASE, formPost, jsonPost, REPORT, testConfig, testRuntime, type TestRuntime } from "./testutil";

const V = "2026-07-28";
const META = { "io.modelcontextprotocol/clientInfo": { name: "t", version: "0" }, "io.modelcontextprotocol/clientCapabilities": {} };

beforeEach(() => resetTokensForTests());

function rpc(rt: TestRuntime, method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const name: Record<string, string> = typeof params.name === "string" ? { "mcp-name": params.name } : {};
  const _meta = { "io.modelcontextprotocol/protocolVersion": V, ...META };
  return mcpRoute(
    new Request(`${BASE}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": V,
        "mcp-method": method,
        ...name,
        ...headers,
      },
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
  const fields = {
    response_type: "code",
    client_id: clientId,
    redirect_uri: "http://localhost:4567/cb",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "s1",
    resource: `${rt.baseUrl}/mcp`,
  };
  const page = checkAuthorize(new URLSearchParams(fields), new Headers(), rt);
  expect(page.kind).toBe("page");
  const allowed = await authorizeRoute(formPost("/api/oauth/authorize", fields, { "x-user": user, "sec-fetch-site": "same-origin" }), rt);
  expect(allowed.status).toBe(303);
  const back = new URL(allowed.headers.get("location")!);
  expect(back.origin + back.pathname).toBe("http://localhost:4567/cb");
  expect(back.searchParams.get("state")).toBe("s1");
  expect(back.searchParams.get("iss")).toBe(rt.baseUrl);
  const code = back.searchParams.get("code")!;
  const tok = await tokenRoute(
    formPost("/oauth/token", {
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: "http://localhost:4567/cb",
      code_verifier: verifier,
    }),
    rt,
  );
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
  const reg = (await (await registerRoute(jsonPost("/oauth/register", { client_name: "Claude", redirect_uris: ["https://claude.ai/cb"] }), rt)).json()) as {
    client_id: string;
  };
  const fields = {
    response_type: "code",
    client_id: reg.client_id,
    redirect_uri: "https://claude.ai/cb",
    code_challenge: "a".repeat(43),
    code_challenge_method: "S256",
  };
  expect((await authorizeRoute(formPost("/api/oauth/authorize", fields, { "sec-fetch-site": "same-origin" }), rt)).status).toBe(401);
  expect((await authorizeRoute(formPost("/api/oauth/authorize", fields, { "x-user": "marcel", "sec-fetch-site": "cross-site" }), rt)).status).toBe(403);
  expect(
    (
      await authorizeRoute(
        formPost("/api/oauth/authorize", { ...fields, redirect_uri: "https://evil.example/cb" }, { "x-user": "marcel", "sec-fetch-site": "same-origin" }),
        rt,
      )
    ).status,
  ).toBe(400);
  expect(checkAuthorize(new URLSearchParams({ ...fields, client_id: "forged" }), new Headers(), rt)).toMatchObject({ kind: "error" });
  expect(checkAuthorize(new URLSearchParams({ ...fields, code_challenge_method: "plain" }), new Headers(), rt)).toMatchObject({
    kind: "redirect",
    location: expect.stringContaining("error=invalid_request"),
  });
  expect((await registerRoute(jsonPost("/oauth/register", { redirect_uris: ["http://evil.example/cb"] }), rt)).status).toBe(400);
});

test("tools act in the name of the person who allowed the client, and the trail says through what", async () => {
  const rt = testRuntime();
  const { access } = await connect(rt, "marcel", "Claude");
  const auth = { authorization: `Bearer ${access}` };

  const tools = (await (await rpc(rt, "tools/list", {}, auth)).json()).result.tools as { name: string }[];
  expect(tools.map((t) => t.name).sort()).toEqual([
    "add_note",
    "create_box",
    "decide",
    "delete_box",
    "delete_form",
    "export",
    "get_form",
    "get_submission",
    "list_connections",
    "list_forms",
    "list_submissions",
    "put_form",
    "rename_box",
    "revoke_connection",
  ]);

  const forms = (await (await rpc(rt, "tools/call", { name: "list_forms", arguments: {} }, auth)).json()).result.structuredContent;
  expect(
    forms.forms.map((f: { name: string; states: { name: string; closed: boolean; reason: boolean }[] }) => [
      f.name,
      f.states.map((s) => s.name),
      f.states.filter((s) => s.reason).map((s) => s.name),
    ]),
  ).toEqual([
    ["report", ["open", "in_review", "acted_on", "rejected"], ["acted_on", "rejected"]],
    ["contact-open", ["new", "answered"], []],
    ["contact", ["new", "answered"], []],
  ]);

  const id = rt.store.receive(rt.config.forms.report!, REPORT, null, new Date("2026-01-01T00:00:00Z")).id;
  const listed = (await (await rpc(rt, "tools/call", { name: "list_submissions", arguments: {} }, auth)).json()).result.structuredContent;
  expect(listed.submissions).toEqual([
    {
      id,
      form: "report",
      kind: "report",
      state: "open",
      received_at: "2026-01-01T00:00:00.000Z",
      closed_at: null,
      url: `${BASE}/forms/report/submissions/${id}`,
      link: "https://notes.test/r/r1/n1",
      summary: "This is spam. Second line.",
    },
  ]);

  const noted = (await (await rpc(rt, "tools/call", { name: "add_note", arguments: { id, text: "Looks like a genuine complaint." } }, auth)).json()).result;
  expect(noted.structuredContent.events.at(-1)).toMatchObject({ actor: "marcel via Claude", to_state: null, reason: "Looks like a genuine complaint." });

  const refused = (await (await rpc(rt, "tools/call", { name: "decide", arguments: { id, to: "acted_on" } }, auth)).json()).result;
  expect(refused.isError).toBe(true);
  expect(refused.content[0].text).toBe("acted_on needs a reason");

  const decided = (await (await rpc(rt, "tools/call", { name: "decide", arguments: { id, to: "acted_on", reason: "Removed the note." } }, auth)).json()).result
    .structuredContent;
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

test("an assistant reads a form, creates one and replaces it; an invalid form changes nothing", async () => {
  const rt = testRuntime();
  const { access } = await connect(rt);
  const auth = { authorization: `Bearer ${access}` };
  const call = async (name: string, args: Record<string, unknown>) => (await (await rpc(rt, "tools/call", { name, arguments: args }, auth)).json()).result;

  const report = await call("get_form", { name: "report" });
  expect(report.structuredContent.form).toMatchObject({ kind: "report" });
  expect((await call("get_form", { name: "nope" })).isError).toBe(true);

  const order = {
    box: "shop.test",
    kind: "message",
    title: "Orders",
    fields: { name: { type: "text", label: "Name", required: true }, email: { type: "email", required: true }, material: { type: "text", personal: false } },
    strict: true,
    origins: ["https://shop.test"],
    retentionDays: 30,
    deleteAfterDays: 365,
    notify: [{ type: "ntfy", url: "https://ntfy.sh/orders-topic" }],
  };
  const created = await call("put_form", { name: "order", form: order });
  expect(created.structuredContent).toMatchObject({ name: "order", created: true });
  expect(created.structuredContent.form.notify).toEqual([{ type: "ntfy", url: "https://ntfy.sh/orders-topic" }]);
  expect(rt.config.forms.order).toMatchObject({ box: "shop.test", kind: "message", strict: true, retentionDays: 30, deleteAfterDays: 365 });
  expect((await call("get_form", { name: "order" })).structuredContent.form.deleteAfterDays).toBe(365);
  const listed = (await call("list_forms", {})).structuredContent.forms.find((f: { name: string }) => f.name === "order");
  expect(listed).toMatchObject({ retention_days: 30, delete_after_days: 365 });
  expect(rt.config.forms.order!.fields.material!.personal).toBe(false);

  const replaced = await call("put_form", { name: "order", form: { ...order, title: "Order requests" } });
  expect(replaced.structuredContent.created).toBe(false);
  expect(rt.config.forms.order!.title).toBe("Order requests");

  // A `${VAR}` the environment does not have is refused, not written: set the variable first.
  const unset = await call("put_form", { name: "order", form: { ...order, notify: [{ type: "ntfy", url: "https://ntfy.sh/${NOT_SET}" }] } });
  expect(unset.isError).toBe(true);
  expect(unset.content[0].text).toContain("NOT_SET");
  expect(rt.forms.rawForm("order")!.notify).toEqual(order.notify);

  const bad = await call("put_form", { name: "order", form: { ...order, kind: "nonsense" } });
  expect(bad.isError).toBe(true);
  expect(rt.config.forms.order!.kind).toBe("message");
  expect((await call("put_form", { name: "Bad Name", form: order })).isError).toBe(true);
  expect(rt.config.forms["Bad Name"]).toBeUndefined();
});

test("a submission whose form names a repository carries the link to a filled-in GitHub issue", async () => {
  const config = testConfig();
  config.forms.report!.github = { repo: "acme/site", labels: [] };
  const rt = testRuntime({ config });
  const { access } = await connect(rt);
  const auth = { authorization: `Bearer ${access}` };
  const call = async (name: string, args: Record<string, unknown>) => (await (await rpc(rt, "tools/call", { name, arguments: args }, auth)).json()).result;
  const s = rt.store.receive(rt.config.forms.report!, REPORT, null, new Date());
  const contact = rt.store.receive(rt.config.forms.contact!, { name: "A", email: "a@example.org", message: "Hi" }, null, new Date());
  const url = (await call("get_submission", { id: s.id })).structuredContent.github_issue_url as string;
  expect(url.startsWith("https://github.com/acme/site/issues/new?")).toBe(true);
  expect(url).not.toContain("who%40example.org");
  expect((await call("get_submission", { id: contact.id })).structuredContent.github_issue_url).toBeNull();
});

/** A connected client's tool call: the result as the client sees it. */
async function caller(rt: TestRuntime, user = "marcel", client = "Claude") {
  const { access } = await connect(rt, user, client);
  const auth = { authorization: `Bearer ${access}` };
  return {
    access,
    call: async (name: string, args: Record<string, unknown> = {}) => (await (await rpc(rt, "tools/call", { name, arguments: args }, auth)).json()).result,
    tools: async () =>
      (await (await rpc(rt, "tools/list", {}, auth)).json()).result.tools as { name: string; annotations?: Record<string, boolean>; description: string }[],
  };
}

test("every tool's result says what to do next", async () => {
  const rt = testRuntime();
  const { call, tools } = await caller(rt);
  const id = rt.store.receive(rt.config.forms.report!, REPORT, null, new Date()).id;
  const other = await connect(rt, "marcel", "Other");
  void other;
  const grant = rt.store.grants("marcel").find((g) => g.client_name === "Other")!.id;
  // One valid call per tool, in an order where each finds what it needs.
  const calls: [string, Record<string, unknown>][] = [
    ["list_forms", {}],
    ["get_form", { name: "report" }],
    ["put_form", { name: "spare", form: { kind: "message" } }],
    ["list_submissions", {}],
    ["get_submission", { id }],
    ["add_note", { id, text: "Checked." }],
    ["decide", { id, to: "rejected", reason: "Fine." }],
    ["create_box", { name: "shop" }],
    ["rename_box", { from: "shop", to: "store" }],
    ["delete_box", { name: "store" }],
    ["delete_form", { name: "spare" }],
    ["list_connections", {}],
    ["revoke_connection", { id: grant }],
    ["export", {}],
  ];
  expect(calls.map(([n]) => n).sort()).toEqual((await tools()).map((t) => t.name).sort());
  for (const [name, args] of calls) {
    const r = await call(name, args);
    expect(r.isError, `${name}: ${r.content?.[0]?.text}`).toBeFalsy();
    expect(r.structuredContent.next.length, name).toBeGreaterThan(0);
    for (const line of r.structuredContent.next) expect(typeof line).toBe("string");
  }
});

test("next is built from what the call did", async () => {
  const rt = testRuntime({ now: () => new Date("2026-01-02T00:00:00Z") });
  const { call } = await caller(rt);
  const id = rt.store.receive(rt.config.forms.report!, REPORT, null, new Date("2026-01-01T00:00:00Z")).id;
  const decided = await call("decide", { id, to: "rejected", reason: "Not spam." });
  expect(decided.structuredContent.next.join(" ")).toContain("2026-04-02"); // closed on 2 January: retention (90 days) blanks it then
  const reopened = await call("decide", { id, to: "in_review", reason: "" });
  expect(reopened.structuredContent.next.join(" ")).not.toContain("retention");
  const created = await call("put_form", { name: "orders", form: { kind: "message" } });
  expect(created.structuredContent.next.join(" ")).toContain(`${BASE}/f/orders`);
  expect(created.structuredContent.url).toBe(`${BASE}/forms/orders`);
  const forms = (await call("list_forms")).structuredContent.forms;
  expect(forms.find((f: { name: string }) => f.name === "orders").url).toBe(`${BASE}/forms/orders`);
});

test("boxes are created, renamed and deleted over MCP; a box with forms stays", async () => {
  const rt = testRuntime();
  const { call, tools } = await caller(rt);
  const made = await call("create_box", { name: "shop.test" });
  expect(made.structuredContent).toMatchObject({ name: "shop.test", url: `${BASE}/boxes/shop.test` });
  expect(rt.config.boxes).toContain("shop.test");
  expect((await call("create_box", { name: "shop.test" })).content[0].text).toBe('there is already a box called "shop.test"');
  expect((await call("create_box", { name: "!" })).isError).toBe(true);
  await call("put_form", { name: "orders", form: { kind: "message", box: "shop.test" } });
  const renamed = await call("rename_box", { from: "shop.test", to: "shop" });
  expect(renamed.structuredContent).toMatchObject({ name: "shop", forms: [{ name: "orders", url: `${BASE}/forms/orders` }] });
  expect(rt.config.forms.orders!.box).toBe("shop");
  expect((await call("delete_box", { name: "shop" })).content[0].text).toBe('the box "shop" still has forms');
  await call("delete_form", { name: "orders" });
  expect((await call("delete_box", { name: "shop" })).isError).toBeFalsy();
  expect(rt.config.boxes).not.toContain("shop");
  const destructive = (await tools()).filter((t) => t.annotations?.destructiveHint).map((t) => t.name);
  expect(destructive).toEqual(expect.arrayContaining(["delete_box", "delete_form", "revoke_connection"]));
});

test("a form with submissions is not deleted over MCP; an empty one is", async () => {
  const rt = testRuntime();
  const { call } = await caller(rt);
  rt.store.receive(rt.config.forms.report!, REPORT, null, new Date());
  expect((await call("delete_form", { name: "report" })).content[0].text).toBe("a form with submissions cannot be deleted; download them first");
  expect(rt.config.forms.report).toBeDefined();
  expect((await call("delete_form", { name: "contact-open" })).structuredContent).toMatchObject({
    name: "contact-open",
    deleted: true,
    box: { name: "forms", url: `${BASE}/boxes/forms` },
  });
  expect(rt.config.forms["contact-open"]).toBeUndefined();
  expect((await call("delete_form", { name: "nope" })).isError).toBe(true);
});

test("put_form keeps the states that submissions are in, as the settings page does", async () => {
  const rt = testRuntime();
  const { call } = await caller(rt);
  const id = rt.store.receive(rt.config.forms.report!, REPORT, null, new Date()).id;
  rt.store.transition(rt.config.forms.report!, id, "marcel", "in_review", "", new Date());
  const form = (await call("get_form", { name: "report" })).structuredContent.form;
  const r = await call("put_form", { name: "report", form: { ...form, states: ["open", { name: "done", closed: true }] } });
  expect(r.content[0].text).toBe('Submissions are in the state "in_review"; it cannot be removed.');
});

test("connections are the person's own: listed, and revoked at once, this one included", async () => {
  const rt = testRuntime();
  const me = await caller(rt, "marcel", "Claude");
  const other = await caller(rt, "marcel", "Desktop");
  await caller(rt, "anna", "Claude");
  const listed = (await me.call("list_connections")).structuredContent.connections as { id: string; client_name: string; current: boolean }[];
  expect(listed.map((c) => [c.client_name, c.current]).sort()).toEqual([
    ["Claude", true],
    ["Desktop", false],
  ]);
  const desktop = listed.find((c) => c.client_name === "Desktop")!;
  const anna = rt.store.grants("anna")[0]!;
  expect((await me.call("revoke_connection", { id: anna.id })).content[0].text).toBe("no such connection");
  expect((await me.call("revoke_connection", { id: desktop.id })).structuredContent).toMatchObject({ id: desktop.id, revoked: true });
  expect((await other.call("list_forms")) ?? null).toBeNull(); // its token stopped working: the request got a 401, no result
  expect(rt.store.grants("anna")).toHaveLength(1);
});

test("export gives the submissions with their histories, by form and state", async () => {
  const rt = testRuntime();
  const { call } = await caller(rt);
  const a = rt.store.receive(rt.config.forms.report!, REPORT, null, new Date("2026-01-01T00:00:00Z"));
  rt.store.receive(rt.config.forms.contact!, { name: "Ann", email: "a@b.co", message: "Hi" }, null, new Date("2026-01-02T00:00:00Z"));
  await call("decide", { id: a.id, to: "rejected", reason: "No." });
  const all = (await call("export")).structuredContent;
  expect(all.submissions).toHaveLength(2);
  const one = (await call("export", { form: "report" })).structuredContent.submissions;
  expect(one).toHaveLength(1);
  expect(one[0]).toMatchObject({ id: a.id, fields: REPORT, url: `${BASE}/forms/report/submissions/${a.id}` });
  expect(one[0].events.map((e: { actor: string; to_state: string }) => [e.actor, e.to_state])).toEqual([
    ["form", "open"],
    ["marcel via Claude", "rejected"],
  ]);
  const byState = (await call("export", { form: "contact", state: "new" })).structuredContent;
  expect(byState.submissions).toHaveLength(1);
  expect(byState.next[0]).toContain(`${BASE}/export.json?form=contact&state=new`);
});
