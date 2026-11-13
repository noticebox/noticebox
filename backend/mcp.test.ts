// The tools: what each does, in whose name, and what it says to do next. A connection here is made straight in Better
// Auth's tables (a person, a client, the person's consent) instead of through the OAuth dance, which accounts.test.ts
// runs end to end over HTTP; each call still goes through whoFor, so a revoked connection stops its calls here too.
import { randomBytes } from "node:crypto";
import { expect, test } from "vitest";
import { fileRoute } from "./files";
import { revokeConnection, connections } from "./admin";
import { mcpAs, mcpRoute, whoFor } from "./mcp";
import { BASE, fileConfig, REPORT, testConfig, testRuntime, type TestRuntime } from "./testutil";

const V = "2026-07-28";
const META = { "io.modelcontextprotocol/clientInfo": { name: "t", version: "0" }, "io.modelcontextprotocol/clientCapabilities": {} };

/** A stand-in bearer for a test connection: `test:<person id>:<client id>`, resolved by whoFor like a verified token. */
async function rpc(rt: TestRuntime, method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const name: Record<string, string> = typeof params.name === "string" ? { "mcp-name": params.name } : {};
  const _meta = { "io.modelcontextprotocol/protocolVersion": V, ...META };
  const { authorization, ...rest } = headers;
  const req = new Request(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": V,
      "mcp-method": method,
      ...name,
      ...rest,
      ...(authorization && !authorization.startsWith("Bearer test:") ? { authorization } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { ...params, _meta } }),
  });
  const m = /^Bearer test:([^:]+):(.+)$/.exec(authorization ?? "");
  if (!m) return mcpRoute(req, rt);
  const who = await whoFor(rt, m[1]!, m[2]!, BASE);
  return typeof who === "string" ? Response.json({ error: who }, { status: 401 }) : mcpAs(req, rt, who);
}

type Adapter = { create(q: { model: string; data: Record<string, unknown> }): Promise<Record<string, unknown>> };

/** `user` (made on first use) allows a new client called `clientName`: the stand-in bearer for that connection. */
async function connect(rt: TestRuntime, user = "marcel", clientName = "Claude"): Promise<{ access: string; clientId: string; personId: string }> {
  const ctx = await (await rt.auth()).$context;
  const a = ctx.adapter as unknown as Adapter;
  const now = new Date();
  const email = `${user}@test.example`;
  const found = (await ctx.internalAdapter.findUserByEmail(email))?.user;
  const person = found ?? (await a.create({ model: "user", data: { email, name: user, emailVerified: true, createdAt: now, updatedAt: now } }));
  const clientId = randomBytes(8).toString("hex");
  await a.create({ model: "oauthClient", data: { clientId, name: clientName, redirectUris: ["http://localhost:4567/cb"], createdAt: now, updatedAt: now } });
  await a.create({ model: "oauthConsent", data: { clientId, userId: person.id, scopes: ["openid"], createdAt: now, updatedAt: now } });
  return { access: `test:${String(person.id)}:${clientId}`, clientId, personId: String(person.id) };
}

test("tools act in the name of the person who allowed the client, and the trail says through what", async () => {
  const rt = testRuntime();
  const { access } = await connect(rt, "marcel", "Claude");
  const auth = { authorization: `Bearer ${access}` };

  const tools = (await (await rpc(rt, "tools/list", {}, auth)).json()).result.tools as { name: string }[];
  expect(tools.map((t) => t.name).sort()).toEqual([
    "add_note",
    "create_api_token",
    "create_box",
    "decide",
    "delete_box",
    "delete_form",
    "export",
    "get_file",
    "get_form",
    "get_submission",
    "list_api_tokens",
    "list_connections",
    "list_forms",
    "list_submissions",
    "put_form",
    "rename_box",
    "revoke_api_token",
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
  expect(noted.structuredContent.events.at(-1)).toMatchObject({
    actor: "marcel@test.example via Claude",
    to_state: null,
    reason: "Looks like a genuine complaint.",
  });

  const refused = (await (await rpc(rt, "tools/call", { name: "decide", arguments: { id, to: "acted_on" } }, auth)).json()).result;
  expect(refused.isError).toBe(true);
  expect(refused.content[0].text).toBe("acted_on needs a reason");

  const decided = (await (await rpc(rt, "tools/call", { name: "decide", arguments: { id, to: "acted_on", reason: "Removed the note." } }, auth)).json()).result
    .structuredContent;
  expect(decided.state).toBe("acted_on");
  expect(decided.events.at(-1)).toMatchObject({
    actor: "marcel@test.example via Claude",
    from_state: "open",
    to_state: "acted_on",
    reason: "Removed the note.",
  });
  expect(rt.store.get(id)!.closed_at).toBeTruthy();

  const got = (await (await rpc(rt, "tools/call", { name: "get_submission", arguments: { id: "nope" } }, auth)).json()).result;
  expect(got.isError).toBe(true);
});

test("the gate: no token or a forged one gets 401 with the way to sign in; another site's page gets 403", async () => {
  const rt = testRuntime();
  const none = await rpc(rt, "tools/list");
  expect(none.status).toBe(401);
  expect(none.headers.get("www-authenticate")).toContain(`resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp"`);
  expect((await rpc(rt, "tools/list", {}, { authorization: "Bearer abc.def" })).status).toBe(401);
  // The origin is checked before any token: a page of another site can't drive the endpoint.
  expect((await rpc(rt, "tools/list", {}, { origin: "https://evil.example" })).status).toBe(403);
});

test("a revoked connection stops working at once, and the settings page's list loses it", async () => {
  const rt = testRuntime();
  const { access, personId } = await connect(rt);
  const anna = await connect(rt, "anna");
  const [c] = await connections(rt, personId);
  expect(c).toMatchObject({ client_name: "Claude" });
  expect(await revokeConnection(rt, anna.personId, c!.id)).toEqual({ ok: false, error: "no such connection" });
  expect(await revokeConnection(rt, personId, c!.id)).toEqual({ ok: true });
  expect(await connections(rt, personId)).toEqual([]);
  expect((await rpc(rt, "tools/list", {}, { authorization: `Bearer ${access}` })).status).toBe(401);
  expect(await connections(rt, anna.personId)).toHaveLength(1);
});

test("an assistant reads a form, creates one and replaces it; an invalid form changes nothing", async () => {
  const rt = testRuntime();
  const { access } = await connect(rt);
  const auth = { authorization: `Bearer ${access}` };
  const call = async (name: string, args: Record<string, unknown>) => (await (await rpc(rt, "tools/call", { name, arguments: args }, auth)).json()).result;

  const report = await call("get_form", { name: "report" });
  expect(report.structuredContent.form).toMatchObject({ kind: "report" });
  expect(report.structuredContent.figures).toMatchObject({ open: 0, oldest_open: null, days: 30, closed: 0, next_erase: null });
  const waiting = rt.store.receive(rt.config.forms.report!, REPORT, null, rt.now());
  const figures = (await call("get_form", { name: "report" })).structuredContent.figures;
  expect(figures).toMatchObject({ open: 1, open_by_state: [{ state: "open", n: 1 }] });
  expect(figures.oldest_open).toMatchObject({ id: waiting.id });
  expect(figures.oldest_open.url).toContain(waiting.id);
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
  const { access, personId } = await connect(rt, user, client);
  const auth = { authorization: `Bearer ${access}` };
  return {
    access,
    personId,
    call: async (name: string, args: Record<string, unknown> = {}) => (await (await rpc(rt, "tools/call", { name, arguments: args }, auth)).json()).result,
    tools: async () =>
      (await (await rpc(rt, "tools/list", {}, auth)).json()).result.tools as { name: string; annotations?: Record<string, boolean>; description: string }[],
  };
}

test("every tool's result says what to do next", async () => {
  const rt = testRuntime();
  const { call, tools } = await caller(rt);
  const id = rt.store.receive(rt.config.forms.report!, REPORT, null, new Date()).id;
  const withFile = rt.store.receive(rt.config.forms.report!, REPORT, null, new Date(), [
    { field: "file", name: "shot.png", type: "image/png", data: new Uint8Array([1]) },
  ]);
  const other = await connect(rt, "marcel", "Other");
  const grant = (await connections(rt, other.personId)).find((c) => c.client_name === "Other")!.id;
  // One valid call per tool, in an order where each finds what it needs.
  let tokenId = "";
  const calls: [string, Record<string, unknown> | (() => Record<string, unknown>)][] = [
    ["list_forms", {}],
    ["get_form", { name: "report" }],
    ["put_form", { name: "spare", form: { kind: "message" } }],
    ["list_submissions", {}],
    ["get_submission", { id }],
    ["get_file", () => ({ id: withFile.id, file: rt.store.files(withFile.id)[0]!.id })],
    ["add_note", { id, text: "Checked." }],
    ["decide", { id, to: "rejected", reason: "Fine." }],
    ["create_box", { name: "shop" }],
    ["rename_box", { from: "shop", to: "store" }],
    ["delete_box", { name: "store" }],
    ["delete_form", { name: "spare" }],
    ["list_connections", {}],
    ["revoke_connection", { id: grant }],
    ["create_api_token", { name: "backup script" }],
    ["list_api_tokens", {}],
    ["revoke_api_token", () => ({ id: tokenId })],
    ["export", {}],
  ];
  expect(calls.map(([n]) => n).sort()).toEqual((await tools()).map((t) => t.name).sort());
  for (const [name, args] of calls) {
    const r = await call(name, typeof args === "function" ? args() : args);
    if (name === "create_api_token") tokenId = r.structuredContent.id;
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
  const annaCaller = await caller(rt, "anna", "Claude");
  const listed = (await me.call("list_connections")).structuredContent.connections as { id: string; client_name: string; current: boolean }[];
  expect(listed.map((c) => [c.client_name, c.current]).sort()).toEqual([
    ["Claude", true],
    ["Desktop", false],
  ]);
  const desktop = listed.find((c) => c.client_name === "Desktop")!;
  const anna = (await connections(rt, annaCaller.personId))[0]!;
  expect((await me.call("revoke_connection", { id: anna.id })).content[0].text).toBe("no such connection");
  expect((await me.call("revoke_connection", { id: desktop.id })).structuredContent).toMatchObject({ id: desktop.id, revoked: true });
  expect((await other.call("list_forms")) ?? null).toBeNull(); // its token stopped working: the request got a 401, no result
  expect(await connections(rt, annaCaller.personId)).toHaveLength(1);
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
    ["marcel@test.example via Claude", "rejected"],
  ]);
  const byState = (await call("export", { form: "contact", state: "new" })).structuredContent;
  expect(byState.submissions).toHaveLength(1);
  expect(byState.next[0]).toContain(`${BASE}/export.json?form=contact&state=new`);
});

test("get_file hands over a download link, shows a picture when asked, and never another submission's file", async () => {
  const rt = testRuntime({ config: fileConfig() });
  const { access } = await connect(rt);
  const auth = { authorization: `Bearer ${access}` };
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const s = rt.store.receive(rt.config.forms.order!, { name: "Ann" }, null, new Date(), [
    { field: "model", name: "part.stl", type: "model/stl", data: new TextEncoder().encode("solid part") },
    { field: "model", name: "photo.png", type: "image/png", data: png },
  ]);
  const other = rt.store.receive(rt.config.forms.order!, { name: "Bob" }, null, new Date());
  const got = (await (await rpc(rt, "tools/call", { name: "get_submission", arguments: { id: s.id } }, auth)).json()).result.structuredContent;
  expect(got.files.map((f: { name: string; picture: boolean }) => [f.name, f.picture])).toEqual([
    ["part.stl", false],
    ["photo.png", true],
  ]);
  expect(got.next.join(" ")).toMatch(/get_file/);
  const [stl, photo] = got.files as { id: string }[];
  const getFile = async (args: Record<string, unknown>) => (await (await rpc(rt, "tools/call", { name: "get_file", arguments: args }, auth)).json()).result;

  // The bytes don't come along: a link does, and it downloads the file without signing in.
  const link = await getFile({ id: s.id, file: stl!.id });
  expect(link.structuredContent).toMatchObject({ name: "part.stl", size: 10 });
  expect(link.content).toHaveLength(1);
  const download = await fileRoute(new Request(link.structuredContent.download_url), rt, stl!.id);
  expect(await download.text()).toBe("solid part");

  // A picture is shown when asked; anything else is not, and the answer says why.
  const shown = await getFile({ id: s.id, file: photo!.id, show: true });
  expect(shown.content[1]).toEqual({ type: "image", mimeType: "image/png", data: Buffer.from(png).toString("base64") });
  const notShown = await getFile({ id: s.id, file: stl!.id, show: true });
  expect(notShown.content).toHaveLength(1);
  expect(notShown.structuredContent.next.join(" ")).toMatch(/not a picture/);

  const wrong = await getFile({ id: other.id, file: photo!.id });
  expect(wrong.isError).toBe(true);
});

test("a submission in a state that deletes after minutes is told so, and not given a retention date it will never reach", async () => {
  const rt = testRuntime({ now: () => new Date("2026-01-02T00:00:00Z") });
  const { call } = await caller(rt);
  const states = [
    "new",
    { name: "answered", closed: true },
    { name: "test", closed: true, deleteAfterMinutes: 0 },
    { name: "spam", closed: true, deleteAfterMinutes: 5 },
  ];
  await call("put_form", { name: "orders", form: { kind: "message", states, retentionDays: 30, deleteAfterDays: 60 } });
  const form = rt.config.forms.orders!;
  const id = rt.store.receive(form, { message: "x" }, null, new Date("2026-01-01T00:00:00Z")).id;
  const next = async (to: string) => ((await call("decide", { id, to })).structuredContent.next as string[]).join(" ");

  const test0 = await next("test");
  expect(test0).toContain("deletes it with its history and files within a minute");
  expect(test0).not.toMatch(/Retention|2026-02-01|2026-03-03/);
  expect(await next("spam")).toContain("5 minutes after it was closed");
  const answered = await next("answered");
  expect(answered).toContain("Retention removes its personal fields on 2026-02-01");
  expect(answered).toContain("deleted on 2026-03-03");
  expect(answered).not.toContain("within a minute");
});
