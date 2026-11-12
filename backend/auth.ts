// Who is asking, and where this instance lives. A page request names its person by Better Auth's HttpOnly session
// cookie (accounts.ts); nothing else counts, a header a proxy might set included. /mcp checks its own tokens (mcp.ts).
import type { Runtime } from "./runtime";

/** A signed-in person: Better Auth's user id, and the verified address the inbox shows and events record. */
export type Person = { id: string; email: string };

/** The person behind a page request's session cookie; NOTICEBOX_DEV_USER when there is none (development only). */
export async function personOf(h: Headers, rt: Runtime): Promise<Person | null> {
  const s = await (await rt.auth()).api.getSession({ headers: h });
  if (s) return { id: s.user.id, email: s.user.email };
  return rt.devUser ? { id: `dev:${rt.devUser}`, email: rt.devUser } : null;
}

/** The name an action is recorded under: the signed-in person's address, or null without a session. */
export async function actorOf(h: Headers, rt: Runtime): Promise<string | null> {
  return (await personOf(h, rt))?.email ?? null;
}

/** The instance's public URL: configured, or from the proxy's forwarded headers, or the request's own host. */
export function publicUrl(h: Headers, rt: Runtime): string {
  if (rt.baseUrl) return rt.baseUrl;
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host") || "localhost";
  return `${proto}://${host}`;
}

export function clientIp(h: Headers, rt: Runtime): string {
  const first = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (rt.trustProxy && first) || "?";
}

/** The origin a browser says it posts from, else the referer's origin; null when neither is there. */
export function originOf(h: Headers): string | null {
  const origin = h.get("origin");
  if (origin && origin !== "null") return origin;
  const referer = h.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }
  return null;
}

/** A POST from our own pages: the browser's fetch-metadata says so, or an Origin that is our own host. */
export function sameSite(h: Headers, rt: Runtime): boolean {
  const site = h.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  const origin = h.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(publicUrl(h, rt)).host;
  } catch {
    return false;
  }
}
