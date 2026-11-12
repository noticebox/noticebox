// Sign-in end to end, over HTTP as a browser and claude.ai do it: email codes and links, the allowlist, the verified address
// every person is named by, linking a second provider, and an MCP client's whole OAuth dance down to a recorded
// event. Better Auth runs for real over an in-memory auth.sqlite; only the mail is caught, and the OIDC providers are
// stand-ins served by the same test server.
import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test } from "vitest";
import { emailAllowed, signInFromEnv, type SignInSettings } from "./accounts";
import { connections } from "./admin";
import { actorOf, personOf } from "./auth";
import { mcpRoute } from "./mcp";
import { authRoute, authServerMetadataRoute } from "./signin";
import { REPORT, testRuntime, type TestRuntime } from "./testutil";

let server: Server;
let base = "";
let rt: TestRuntime;
const mail = new Map<string, { code: string; link: string | undefined }>();
const quiet = () => {};

// What each stand-in provider says about the person behind a code it handed out.
const claims = new Map<string, Record<string, unknown>>();

function provider(name: string, path: string): Response | null {
  const root = `/${name}-oidc`;
  if (path === `${root}/.well-known/openid-configuration`)
    return Response.json({
      issuer: `${base}${root}`,
      authorization_endpoint: `${base}${root}/authorize`,
      token_endpoint: `${base}${root}/token`,
      userinfo_endpoint: `${base}${root}/userinfo`,
      jwks_uri: `${base}${root}/jwks`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
    });
  return null;
}

async function route(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname;
  if (path === "/mcp") return mcpRoute(req, rt);
  for (const name of ["fake", "other"]) {
    const found = provider(name, path);
    if (found) return found;
    if (path === `/${name}-oidc/token`) {
      const code = new URLSearchParams(await req.text()).get("code") ?? "";
      return Response.json({ access_token: `${name}:${code}`, token_type: "Bearer", expires_in: 3600 });
    }
    if (path === `/${name}-oidc/userinfo`) {
      const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
      return claims.has(token) ? Response.json(claims.get(token)) : new Response("no", { status: 401 });
    }
  }
  if (path.startsWith("/.well-known/oauth-authorization-server")) return authServerMetadataRoute(req, rt);
  return authRoute(req, rt);
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const headers = new Headers(
      Object.entries(req.headers).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v === undefined ? [] : [[k, v]])) as [string, string][],
    );
    const reply = await route(
      new Request(new URL(req.url!, base), { method: req.method, headers, body: req.method === "GET" || req.method === "HEAD" ? undefined : body }),
    ).catch((e) => (console.error(e), new Response("thrown", { status: 599 })));
    for (const [k, v] of reply.headers) if (k !== "set-cookie") res.setHeader(k, v);
    const cookies = reply.headers.getSetCookie();
    if (cookies.length) res.setHeader("set-cookie", cookies);
    res.writeHead(reply.status);
    res.end(Buffer.from(await reply.arrayBuffer()));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
  const signIn: SignInSettings = {
    secret: "s".repeat(40),
    baseUrl: base,
    file: ":memory:",
    jwksUrl: `${base}/api/auth/jwks`,
    allowed: ["ada@example.com", "marcel@example.com", "@team.example"],
    providers: [
      { id: "fake", label: "Fake", clientId: "noticebox", clientSecret: "x", issuer: `${base}/fake-oidc` },
      { id: "other", label: "Other", clientId: "noticebox", clientSecret: "x", issuer: `${base}/other-oidc` },
    ],
    smtp: null,
    mailer: async (to, code, link) => void mail.set(to, { code, link }),
    log: quiet,
  };
  rt = testRuntime({ baseUrl: base, signIn });
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});

const json = (body: unknown, extra: Record<string, string> = {}) => ({
  method: "POST",
  headers: { "content-type": "application/json", origin: base, ...extra },
  body: JSON.stringify(body),
});
const cookieOf = (r: Response) =>
  r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

async function sendCode(email: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  mail.delete(email);
  const r = await fetch(`${base}/api/auth/email-otp/send-verification-otp`, json({ email, type: "sign-in", ...extra }, headers));
  expect(r.status).toBe(200);
  return mail.get(email);
}

/** Signs `email` in with the mailed code; `oauthQuery` is the signed query of the sign-in page an MCP client sent the browser to. */
async function signIn(email: string, oauthQuery?: string) {
  const query = oauthQuery ? { oauth_query: oauthQuery } : {};
  const sent = await sendCode(email, query);
  return fetch(`${base}/api/auth/sign-in/email-otp`, json({ email, otp: sent?.code ?? "000000", ...query }));
}

/** Signs in through a stand-in provider that says `profile` about the person; the callback's response. */
async function viaProvider(name: string, profile: Record<string, unknown>, cookie = "") {
  const start = await fetch(
    `${base}/api/auth/sign-in/social`,
    json({ provider: name, callbackURL: "/", errorCallbackURL: "/login" }, cookie ? { cookie } : {}),
  );
  expect(start.status).toBe(200);
  const to = new URL((await start.json()).url);
  expect(to.origin + to.pathname).toBe(`${base}/${name}-oidc/authorize`);
  expect(to.searchParams.get("code_challenge_method")).toBe("S256");
  const code = randomBytes(6).toString("hex");
  claims.set(`${name}:${code}`, profile);
  const back = new URL(to.searchParams.get("redirect_uri")!);
  back.searchParams.set("code", code);
  back.searchParams.set("state", to.searchParams.get("state")!);
  return fetch(back, { redirect: "manual", headers: { cookie: [cookie, cookieOf(start)].filter(Boolean).join("; ") } });
}

test("only a verified address on the list signs in; nobody else even gets a mail", async () => {
  expect(emailAllowed(["ada@example.com", "@team.example"], " Ada@Example.com ")).toBe(true);
  expect(emailAllowed(["@team.example"], "x@team.example")).toBe(true);
  expect(emailAllowed(["@team.example"], "x@evilteam.example")).toBe(false);
  expect(emailAllowed([], "ada@example.com")).toBe(false);

  const signed = await signIn("ada@example.com");
  expect(signed.status).toBe(200);
  const person = await personOf(new Headers({ cookie: cookieOf(signed) }), rt);
  expect(person?.email).toBe("ada@example.com");

  expect(await sendCode("eve@example.com")).toBeUndefined();
  expect((await signIn("eve@example.com")).ok).toBe(false);
  const eve = await viaProvider("fake", { sub: "u-eve", email: "eve@example.com", email_verified: true });
  expect(eve.headers.get("location")).toMatch(/^\/login\?error=/);
  expect(cookieOf(eve)).not.toContain("session_token=");
  // A provider that doesn't vouch for the address gets nobody in, even an allowed one.
  const unverified = await viaProvider("fake", { sub: "u-bob", email: "bob@team.example", email_verified: false });
  expect(unverified.headers.get("location")).toMatch(/^\/login\?error=/);
  expect(cookieOf(unverified)).not.toContain("session_token=");
});

test("outside an MCP sign-in the mail holds a link too; it signs in once, and neither code nor link is stored as sent", async () => {
  const sent = await sendCode("ada@example.com", {}, { referer: `${base}/login?next=${encodeURIComponent("/forms/report")}` });
  const link = new URL(sent!.link!);
  expect(link.origin + link.pathname).toBe(`${base}/api/auth/magic-link/verify`);
  expect(link.searchParams.get("callbackURL")).toBe("/forms/report");
  const ctx = await (await rt.auth()).$context;
  const rows = (await ctx.adapter.findMany({ model: "verification" })) as { identifier: string; value: string }[];
  for (const r of rows) expect(`${r.identifier} ${r.value}`).not.toContain(link.searchParams.get("token")!);
  for (const r of rows) expect(r.value).not.toContain(sent!.code);
  expect((ctx.options as { telemetry?: unknown }).telemetry).toBeUndefined();

  const opened = await fetch(link, { redirect: "manual" });
  expect(opened.status).toBe(302);
  expect(opened.headers.get("location")).toBe(`${base}/forms/report`);
  expect(await actorOf(new Headers({ cookie: cookieOf(opened) }), rt)).toBe("ada@example.com");
  const again = await fetch(link, { redirect: "manual" });
  expect(cookieOf(again)).not.toContain("session_token=");

  // A link can't lead off the inbox.
  const off = await sendCode("ada@example.com", {}, { referer: `${base}/login?next=//evil.example` });
  expect(new URL(off!.link!).searchParams.get("callbackURL")).toBe("/");
});

test("the verified address is the name events record, whatever a provider claims; a second provider joins only on a verified address", async () => {
  const first = await viaProvider("fake", { sub: "u-1", email: "marcel@example.com", email_verified: true, preferred_username: "mallory" });
  expect(first.status).toBe(302);
  const cookie = cookieOf(first);
  const me = (await personOf(new Headers({ cookie }), rt))!;
  expect(me.email).toBe("marcel@example.com");
  const id = rt.store.receive(rt.config.forms.report!, REPORT, null, new Date()).id;
  rt.store.note(id, (await actorOf(new Headers({ cookie }), rt))!, "Seen.", new Date());
  expect(rt.store.events(id).at(-1)!.actor).toBe("marcel@example.com");

  // The same verified address through another provider is the same person.
  const second = await viaProvider("other", { sub: "o-9", email: "marcel@example.com", email_verified: true });
  expect(await personOf(new Headers({ cookie: cookieOf(second) }), rt)).toEqual(me);
  // Unverified, it is refused: an address someone merely typed at a provider doesn't open another's account.
  const forged = await viaProvider("other", { sub: "o-10", email: "marcel@example.com", email_verified: false });
  expect(cookieOf(forged)).not.toContain("session_token=");
  // A provider that leaves email_verified out doesn't vouch for the address either.
  const silent = await viaProvider("fake", { sub: "u-2", email: "silent@team.example" });
  expect(cookieOf(silent)).not.toContain("session_token=");
});

const V = "2026-07-28";
const META = {
  "io.modelcontextprotocol/protocolVersion": V,
  "io.modelcontextprotocol/clientInfo": { name: "t", version: "0" },
  "io.modelcontextprotocol/clientCapabilities": {},
};
const rpc = (method: string, params: Record<string, unknown>, headers: Record<string, string> = {}) =>
  fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": V,
      "mcp-method": method,
      ...(typeof params.name === "string" ? { "mcp-name": params.name } : {}),
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: META } }),
  });

test("an MCP client signs the person in, acts as '<email> via <client>', and stops at once when revoked", async () => {
  const bare = await rpc("tools/list", {});
  expect(bare.status).toBe(401);
  expect(bare.headers.get("www-authenticate") ?? "").toContain(`${base}/.well-known/oauth-protected-resource/mcp`);
  const resource = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json();
  expect(resource.resource).toBe(`${base}/mcp`);
  const meta = await (await fetch(`${base}/.well-known/oauth-authorization-server/api/auth`)).json();
  expect(meta.code_challenge_methods_supported).toContain("S256");
  expect(meta.grant_types_supported).not.toContain("client_credentials");

  const redirect = "https://claude.example/api/mcp/auth_callback";
  const reg = await fetch(meta.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Claude",
      redirect_uris: [redirect],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  expect(reg.status).toBe(201);
  const { client_id } = await reg.json();

  const verifier = randomBytes(32).toString("base64url");
  const authorize = new URL(meta.authorization_endpoint);
  for (const [k, v] of Object.entries({
    response_type: "code",
    client_id,
    redirect_uri: redirect,
    scope: "openid offline_access",
    state: "st",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    resource: `${base}/mcp`,
  }))
    authorize.searchParams.set(k, v);
  const toLogin = await fetch(authorize, { redirect: "manual", headers: { accept: "text/html" } });
  const login = new URL(toLogin.status === 302 ? toLogin.headers.get("location")! : (await toLogin.json()).url, base);
  expect(login.pathname).toBe("/login");

  // During an MCP sign-in the mail holds only the code: a link would sign in whichever browser opens it.
  const signed = await signIn("ada@example.com", login.search.slice(1));
  expect(signed.status).toBe(200);
  expect(mail.get("ada@example.com")!.link).toBeUndefined();
  const cookie = cookieOf(signed);
  const consent = new URL((await signed.json()).url, base);
  expect(consent.pathname).toBe("/consent");
  expect((await rpc("tools/list", {}, { cookie })).status).toBe(401); // a session cookie is no MCP token

  const consented = await fetch(`${base}/api/auth/oauth2/consent`, json({ accept: true, oauth_query: consent.search.slice(1) }, { cookie }));
  expect(consented.status).toBe(200);
  const back = new URL((await consented.json()).url);
  expect(back.origin + back.pathname).toBe(redirect);
  const token = await fetch(meta.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: back.searchParams.get("code")!,
      redirect_uri: redirect,
      client_id,
      code_verifier: verifier,
      resource: `${base}/mcp`,
    }),
  });
  expect(token.status).toBe(200);
  const tokens = await token.json();
  expect(tokens.expires_in).toBeLessThanOrEqual(600);
  const bearer = { authorization: `Bearer ${tokens.access_token}` };

  const id = rt.store.receive(rt.config.forms.report!, REPORT, null, new Date()).id;
  const noted = await (await rpc("tools/call", { name: "add_note", arguments: { id, text: "Checked." } }, bearer)).json();
  expect(noted.result.isError).toBeUndefined();
  expect(rt.store.events(id).at(-1)).toMatchObject({ actor: "ada@example.com via Claude", reason: "Checked." });
  expect((await rpc("tools/list", {}, { authorization: `Bearer ${tokens.access_token.slice(0, -4)}AAAA` })).status).toBe(401);

  // Revoked on the settings page: the very next call fails, and the refresh token is gone with it.
  const ada = (await personOf(new Headers({ cookie }), rt))!;
  const [c] = await connections(rt, ada.id);
  expect(c).toMatchObject({ client_name: "Claude", client_id });
  const { revokeConnection } = await import("./admin");
  expect(await revokeConnection(rt, ada.id, c!.id)).toEqual({ ok: true });
  expect((await rpc("tools/list", {}, bearer)).status).toBe(401);
  const refreshed = await fetch(meta.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id }),
  });
  expect(refreshed.ok).toBe(false);
});

test("start-up refuses a dev user in production and an instance nobody can sign in to; SMTP alone is enough", () => {
  const env = { NOTICEBOX_SECRET: "s".repeat(40), NOTICEBOX_BASE_URL: "https://inbox.example", NOTICEBOX_ALLOWED_EMAILS: "a@b.c" };
  expect(() => signInFromEnv({ ...env, NOTICEBOX_DEV_USER: "dev", NODE_ENV: "production" }, ":memory:", quiet)).toThrow(/NOTICEBOX_DEV_USER/);
  expect(() => signInFromEnv(env, ":memory:", quiet)).toThrow(/no way to sign in/);
  expect(() => signInFromEnv({ ...env, NOTICEBOX_SMTP_URL: "smtp://m", NOTICEBOX_SECRET: "short" }, ":memory:", quiet)).toThrow(/NOTICEBOX_SECRET/);
  expect(() => signInFromEnv({ ...env, NOTICEBOX_OIDC_AUTHENTIK_CLIENT_ID: "x" }, ":memory:", quiet)).toThrow(/NOTICEBOX_OIDC_AUTHENTIK_ISSUER/);
  const smtpOnly = signInFromEnv({ ...env, NOTICEBOX_SMTP_URL: "smtp://mail.example", NOTICEBOX_SMTP_FROM: "inbox@example.org" }, ":memory:", quiet);
  expect(smtpOnly.providers).toEqual([]);
  expect(smtpOnly.smtp).toEqual({ url: "smtp://mail.example", from: "inbox@example.org" });
  const providers = signInFromEnv(
    {
      ...env,
      NOTICEBOX_OIDC_GITHUB_CLIENT_ID: "gh",
      NOTICEBOX_OIDC_GITHUB_CLIENT_SECRET: "ghs",
      NOTICEBOX_OIDC_AUTHENTIK_CLIENT_ID: "ak",
      NOTICEBOX_OIDC_AUTHENTIK_CLIENT_SECRET: "aks",
      NOTICEBOX_OIDC_AUTHENTIK_ISSUER: "https://auth.example/application/o/noticebox/",
      NOTICEBOX_OIDC_AUTHENTIK_LABEL: "Our login",
    },
    ":memory:",
    quiet,
  ).providers;
  expect(providers).toEqual([
    { id: "authentik", label: "Our login", clientId: "ak", clientSecret: "aks", issuer: "https://auth.example/application/o/noticebox" },
    { id: "github", label: "GitHub", clientId: "gh", clientSecret: "ghs", issuer: null },
  ]);
  expect(signInFromEnv({ NOTICEBOX_DEV_USER: "dev" }, ":memory:", quiet).baseUrl).toBe("http://localhost:3000");
});
