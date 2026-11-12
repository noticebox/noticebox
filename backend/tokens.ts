// API tokens and who a REST request is (ADR 0002). An API token belongs to a person and acts as them on /api/v1, and
// nowhere else: it has a name, a scope (`read`, or `read+write`) and an expiry (90 days by default, at most a year, or
// none when chosen), is stored hashed by Better Auth's api-key plugin and shown once. A script may instead hold an
// OAuth access token issued for /api/v1. Either way, an /mcp token is refused here, and an API token is refused on /mcp.
import { requestToResourceInput, verifyAccessTokenRequest } from "better-auth/oauth2";
import { API_TOKEN_DAYS, API_TOKEN_PREFIX } from "./accounts";
import type { Outcome } from "./db";
import type { Runtime } from "./runtime";

export type Scope = "read" | "read+write";

export type ApiToken = { id: string; name: string; scope: Scope; start: string; created_at: string; expires_at: string | null; last_used_at: string | null };

/** A REST caller: the person, and what they may do here. */
export type RestCaller = { person: string; actor: string; scope: Scope };

type Row = Record<string, unknown>;
type Where = { field: string; value: string }[];
type Adapter = {
  findMany(q: { model: string; where: Where }): Promise<Row[]>;
  findOne(q: { model: string; where: Where }): Promise<Row | null>;
  delete(q: { model: string; where: Where }): Promise<void>;
};

const adapterOf = async (rt: Runtime): Promise<Adapter> => (await (await rt.auth()).$context).adapter as unknown as Adapter;
const isoOrNull = (d: unknown) => (d ? new Date(d as string | Date).toISOString() : null);

function scopeOf(permissions: unknown): Scope {
  const p = typeof permissions === "string" ? (JSON.parse(permissions) as Record<string, string[]>) : (permissions as Record<string, string[]> | null);
  return p?.inbox?.includes("write") ? "read+write" : "read";
}

const view = (r: Row): ApiToken => ({
  id: String(r.id),
  name: String(r.name ?? ""),
  scope: scopeOf(r.permissions),
  start: String(r.start ?? API_TOKEN_PREFIX),
  created_at: isoOrNull(r.createdAt)!,
  expires_at: isoOrNull(r.expiresAt),
  last_used_at: isoOrNull(r.lastRequest),
});

/**
 * Makes an API token for the person: `days` is its lifetime, `null` for none, left out for the default. The token is in
 * the result once and never again; only its hash is kept.
 */
export async function createApiToken(
  rt: Runtime,
  person: string,
  input: { name: string; scope: Scope; days?: number | null },
): Promise<(ApiToken & { token: string }) | { error: string }> {
  const name = input.name.trim();
  if (!name || name.length > 60) return { error: "a token needs a name of up to 60 characters" };
  if (input.scope !== "read" && input.scope !== "read+write") return { error: 'the scope is "read" or "read+write"' };
  const days = input.days === undefined ? API_TOKEN_DAYS.default : input.days;
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > API_TOKEN_DAYS.max))
    return { error: `a token lives 1 to ${API_TOKEN_DAYS.max} days, or has no expiry when chosen explicitly` };
  const made = (await (
    await rt.auth()
  ).api.createApiKey({
    body: {
      userId: person,
      name,
      expiresIn: days === null ? null : days * 86400,
      permissions: { inbox: input.scope === "read" ? ["read"] : ["read", "write"] },
    },
  })) as Row & { key: string };
  return { ...view(made), token: made.key };
}

/** The person's API tokens, newest first; never the tokens themselves. */
export async function listApiTokens(rt: Runtime, person: string): Promise<ApiToken[]> {
  const rows = await (await adapterOf(rt)).findMany({ model: "apikey", where: [{ field: "referenceId", value: person }] });
  return rows.map(view).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Revokes one of the person's own tokens: the next request with it is refused. */
export async function revokeApiToken(rt: Runtime, person: string, id: string): Promise<Outcome> {
  const a = await adapterOf(rt);
  const mine = [
    { field: "id", value: id },
    { field: "referenceId", value: person },
  ];
  if (!(await a.findOne({ model: "apikey", where: mine }))) return { ok: false, error: "no such token" };
  await a.delete({ model: "apikey", where: mine });
  return { ok: true };
}

const bearerOf = (h: Headers): string => h.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";

/**
 * Who a REST request is: an API token (checked, expiry and all, and its last use recorded), or an OAuth access token
 * this instance issued for /api/v1 (signature, issuer, audience, expiry). Null for anything else, an /mcp token and a
 * session cookie included. The person must still exist.
 */
export async function restCaller(req: Request, rt: Runtime): Promise<RestCaller | null> {
  const token = bearerOf(req.headers);
  if (!token) return null;
  const auth = await rt.auth();
  let person: string | null = null;
  let scope: Scope = "read+write";
  if (token.startsWith(API_TOKEN_PREFIX)) {
    const r = (await auth.api.verifyApiKey({ body: { key: token } }).catch(() => null)) as { valid: boolean; key: Row | null } | null;
    if (!r?.valid || !r.key) return null;
    person = String(r.key.referenceId);
    scope = scopeOf(r.key.permissions);
  } else {
    try {
      const claims = await verifyAccessTokenRequest(requestToResourceInput(req), {
        verifyOptions: { issuer: `${rt.signIn.baseUrl}/api/auth`, audience: `${rt.signIn.baseUrl}/api/v1` },
        jwksUrl: rt.signIn.jwksUrl,
      });
      person = typeof claims.sub === "string" ? claims.sub : null;
    } catch {
      return null;
    }
  }
  if (!person) return null;
  const user = (await (await auth.$context).internalAdapter.findUserById(person)) as { email: string } | null;
  return user ? { person, actor: user.email, scope } : null;
}
