// Stateless signed values for OAuth: base64url(JSON payload) "." base64url(HMAC-SHA256), keyed by NOTICEBOX_SECRET.
// Changing the secret invalidates every client registration and token. The pattern is notefeed's.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type Kind = "client" | "code" | "access" | "refresh";
export type Payloads = {
  client: { client_name?: string; redirect_uris: string[] };
  code: { cid: string; cn: string; redirect_uri: string; code_challenge: string; resource: string; jti: string; sub: string; gid: string };
  access: { aud: string; sub: string; cn: string; gid: string };
  refresh: { cid: string; cn: string; aud: string; jti: string; sub: string; gid: string };
};
export const TTL = { code: 300, access: 3600, refresh: 2592000 } as const;

const key = (secret: string): Buffer => createHmac("sha256", "noticebox-oauth").update(secret).digest();
const mac = (secret: string, body: string): Buffer => createHmac("sha256", key(secret)).update(body).digest();

export function sign<K extends Kind>(secret: string, t: K, p: Payloads[K], now = Date.now()): string {
  const claims = t === "client" ? { ...p, t } : { ...p, t, exp: Math.floor(now / 1000) + TTL[t as Exclude<Kind, "client">] };
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${body}.${mac(secret, body).toString("base64url")}`;
}

export function verify<K extends Kind>(secret: string, t: K, token: string, now = Date.now()): (Payloads[K] & { exp?: number }) | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  const want = mac(secret, body);
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || got.toString("base64url") !== sig || !timingSafeEqual(got, want)) return null;
  let claims: { t?: unknown; exp?: unknown };
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
  if (!claims || typeof claims !== "object" || claims.t !== t) return null;
  if (t !== "client" && !(typeof claims.exp === "number" && now <= claims.exp * 1000)) return null;
  return claims as Payloads[K] & { exp?: number };
}

export const cid = (clientId: string): string => createHash("sha256").update(clientId).digest("base64url").slice(0, 22);

export const newJti = (): string => randomBytes(16).toString("base64url");

// Used code and refresh jtis are kept in memory; after a restart one could be replayed once within its lifetime.
const used = new Map<string, number>();

/** True the first time a jti is seen; `exp` is in seconds, and an expired entry is dropped. */
export function spendOnce(jti: string, exp: number, now = Date.now()): boolean {
  for (const [j, e] of used) if (e * 1000 < now) used.delete(j);
  if (used.has(jti)) return false;
  used.set(jti, exp);
  return true;
}

export const resetTokensForTests = (): void => used.clear();
