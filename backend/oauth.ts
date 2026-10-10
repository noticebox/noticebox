// noticebox as the OAuth 2.1 authorization server for its own /mcp: metadata (RFC 9728, RFC 8414), dynamic client
// registration (RFC 7591), the authorize step behind the login proxy, and the token endpoint (authorization code
// with PKCE S256, rotating refresh tokens). Tokens are signed (./tokens); what is stored is the grant, the person's
// "Allow" for one client, which every token names and which the person can revoke.
// Without NOTICEBOX_SECRET there is nothing to sign with: 404.
import { createHash } from "node:crypto";
import { actorOf, mcpResource, publicUrl, sameSite } from "./auth";
import { parseFields, readCapped, seeOther, text } from "./http";
import type { Runtime } from "./runtime";
import { cid, newJti, sign, spendOnce, TTL, verify } from "./tokens";

const notFound = () => text(404, "not found");
// Browser-based MCP clients call the metadata, register and token endpoints cross-origin. None reads a cookie.
const cors = { "Access-Control-Allow-Origin": "*" };
const noStore = { ...cors, "Cache-Control": "no-store" };
const oauthError = (error: string, status = 400) => Response.json({ error }, { status, headers: noStore });

const preflight = (method: string) => (rt: Runtime) =>
  rt.secret ? new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": method, "Access-Control-Allow-Headers": "content-type, mcp-protocol-version" } }) : notFound();
export const metadataPreflight = preflight("GET");
export const registerPreflight = preflight("POST");

export function protectedResourceRoute(req: Request, rt: Runtime): Response {
  if (!rt.secret) return notFound();
  return Response.json({ resource: mcpResource(req.headers, rt), authorization_servers: [publicUrl(req.headers, rt)], bearer_methods_supported: ["header"] }, { headers: cors });
}

export function authServerRoute(req: Request, rt: Runtime): Response {
  if (!rt.secret) return notFound();
  const base = publicUrl(req.headers, rt);
  return Response.json(
    {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      authorization_response_iss_parameter_supported: true,
    },
    { headers: cors },
  );
}

/** https anywhere, plain http only on loopback (native and CLI clients). No fragment. */
export function redirectUriOk(u: unknown): u is string {
  if (typeof u !== "string" || u.length > 512 || u.includes("#") || !URL.canParse(u)) return false;
  const { protocol, hostname } = new URL(u);
  return protocol === "https:" || (protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1"));
}

export async function registerRoute(req: Request, rt: Runtime): Promise<Response> {
  if (!rt.secret) return notFound();
  const bytes = await readCapped(req, 16 * 1024);
  let body: { client_name?: unknown; redirect_uris?: unknown } | null = null;
  try {
    if (bytes) body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {}
  if (!body || typeof body !== "object" || Array.isArray(body)) return oauthError("invalid_client_metadata");
  const { client_name, redirect_uris } = body;
  if (!Array.isArray(redirect_uris) || redirect_uris.length < 1 || redirect_uris.length > 5 || !redirect_uris.every(redirectUriOk)) return oauthError("invalid_redirect_uri");
  if (client_name !== undefined && (typeof client_name !== "string" || client_name.length > 100 || /[\p{Cc}\p{Cf}]/u.test(client_name))) return oauthError("invalid_client_metadata");
  const client = client_name === undefined ? { redirect_uris } : { client_name, redirect_uris };
  const client_id = sign(rt.secret, "client", client);
  return Response.json({ client_id, ...client, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }, { status: 201, headers: noStore });
}

export type Checked =
  | { kind: "page"; clientName: string; redirectHost: string; fields: Record<string, string> }
  | { kind: "redirect"; location: string }
  | { kind: "error"; message: string };

const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;

/** The authorize request, for the page (GET) and its POST alike. Nothing redirects until client and redirect_uri check out. */
export function checkAuthorize(params: URLSearchParams, h: Headers, rt: Runtime): Checked {
  if (!rt.secret) return { kind: "error", message: "Not found." };
  const one = (k: string) => {
    const v = params.getAll(k);
    return v.length === 1 ? v[0] : undefined;
  };
  const clientId = one("client_id") ?? "";
  const client = verify(rt.secret, "client", clientId);
  if (!client) return { kind: "error", message: "Unknown client. Connect again from your MCP client." };
  const redirectUri = one("redirect_uri");
  if (redirectUri === undefined || !client.redirect_uris.includes(redirectUri)) return { kind: "error", message: "The redirect URI isn't one this client registered." };

  const state = one("state");
  const fail = (error: string) => {
    const to = new URL(redirectUri);
    to.searchParams.set("error", error);
    if (state !== undefined) to.searchParams.set("state", state);
    to.searchParams.set("iss", publicUrl(h, rt));
    return { kind: "redirect" as const, location: to.href };
  };
  if (one("response_type") !== "code") return fail("unsupported_response_type");
  const challenge = one("code_challenge");
  if (one("code_challenge_method") !== "S256" || challenge === undefined || !CHALLENGE_RE.test(challenge)) return fail("invalid_request");
  const resource = one("resource");
  if (params.has("resource") && resource !== mcpResource(h, rt)) return fail("invalid_target");

  const fields: Record<string, string> = { response_type: "code", client_id: clientId, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: "S256" };
  if (state !== undefined) fields.state = state;
  if (resource !== undefined) fields.resource = resource;
  const redirectHost = new URL(redirectUri).host;
  return { kind: "page", clientName: client.client_name || redirectHost, redirectHost, fields };
}

/** POST /api/oauth/authorize: the "Allow" of the signed-in user. Back to the client with a code naming that user. */
export async function authorizeRoute(req: Request, rt: Runtime): Promise<Response> {
  if (!rt.secret) return notFound();
  const h = req.headers;
  const actor = actorOf(h, rt);
  if (!actor) return text(401, "sign in first");
  if (!sameSite(h, rt)) return text(403, "cross-site request");
  const bytes = await readCapped(req, 16 * 1024);
  const form = bytes ? await parseFields(bytes, h).catch(() => null) : null;
  const params = new URLSearchParams(form ?? {});
  const checked = checkAuthorize(params, h, rt);
  if (checked.kind === "redirect") return seeOther(checked.location);
  if (checked.kind === "error") return text(400, checked.message);
  const { fields, clientName } = checked;
  const grant = rt.store.grant(actor, cid(fields.client_id as string), clientName, rt.now());
  const code = sign(rt.secret, "code", {
    cid: grant.client_hash,
    cn: clientName,
    redirect_uri: fields.redirect_uri as string,
    code_challenge: fields.code_challenge as string,
    resource: fields.resource ?? mcpResource(h, rt),
    jti: newJti(),
    sub: actor,
    gid: grant.id,
  });
  const to = new URL(fields.redirect_uri as string);
  to.searchParams.set("code", code);
  if (fields.state !== undefined) to.searchParams.set("state", fields.state);
  to.searchParams.set("iss", publicUrl(h, rt));
  rt.log(`oauth: ${actor} allowed an MCP client`);
  return seeOther(to.href);
}

function issue(secret: string, clientHash: string, cn: string, aud: string, sub: string, gid: string): Response {
  return Response.json(
    { access_token: sign(secret, "access", { aud, sub, cn, gid }), token_type: "Bearer", expires_in: TTL.access, refresh_token: sign(secret, "refresh", { cid: clientHash, cn, aud, jti: newJti(), sub, gid }) },
    { headers: noStore },
  );
}

/** POST /oauth/token. Every check runs before the code or refresh token is spent. */
export async function tokenRoute(req: Request, rt: Runtime): Promise<Response> {
  const secret = rt.secret;
  if (!secret) return notFound();
  const bytes = await readCapped(req, 16 * 1024);
  const form = bytes ? await parseFields(bytes, req.headers).catch(() => null) : null;
  const get = (k: string) => form?.[k];
  const grant = get("grant_type");
  const clientId = get("client_id");
  const resource = get("resource");

  if (grant === "authorization_code") {
    const [code, redirectUri, verifier] = [get("code"), get("redirect_uri"), get("code_verifier")];
    if (!code || !clientId || !redirectUri || !verifier) return oauthError("invalid_request");
    const c = verify(secret, "code", code);
    if (!c) return oauthError("invalid_grant");
    if (!verify(secret, "client", clientId)) return oauthError("invalid_client");
    if (c.cid !== cid(clientId) || c.redirect_uri !== redirectUri) return oauthError("invalid_grant");
    if (createHash("sha256").update(verifier).digest("base64url") !== c.code_challenge) return oauthError("invalid_grant");
    if (resource !== undefined && resource !== c.resource) return oauthError("invalid_grant");
    if (!rt.store.grantOk(c.gid, rt.now())) return oauthError("invalid_grant");
    if (!spendOnce(c.jti, c.exp!)) return oauthError("invalid_grant");
    return issue(secret, c.cid, c.cn, c.resource, c.sub, c.gid);
  }

  if (grant === "refresh_token") {
    const refresh = get("refresh_token");
    if (!refresh || !clientId) return oauthError("invalid_request");
    const r = verify(secret, "refresh", refresh);
    if (!r) return oauthError("invalid_grant");
    if (!verify(secret, "client", clientId)) return oauthError("invalid_client");
    if (r.cid !== cid(clientId)) return oauthError("invalid_grant");
    if (resource !== undefined && resource !== r.aud) return oauthError("invalid_grant");
    if (!rt.store.grantOk(r.gid, rt.now())) return oauthError("invalid_grant");
    if (!spendOnce(r.jti, r.exp!)) return oauthError("invalid_grant");
    return issue(secret, r.cid, r.cn, r.aud, r.sub, r.gid);
  }

  return oauthError(grant === undefined ? "invalid_request" : "unsupported_grant_type");
}
