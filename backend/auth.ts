// Who is asking, and where this instance lives. The login itself is the reverse proxy's (Authentik in front of
// everything but the public paths); it tells us the user in a header. No header, no user.
import type { Runtime } from "./runtime";

export function actorOf(h: Headers, rt: Runtime): string | null {
  const v = h.get(rt.userHeader)?.trim();
  if (v) return v;
  return rt.devUser;
}

/** The instance's public URL: configured, or from the proxy's forwarded headers, or the request's own host. */
export function publicUrl(h: Headers, rt: Runtime): string {
  if (rt.baseUrl) return rt.baseUrl;
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host") || "localhost";
  return `${proto}://${host}`;
}

export const mcpResource = (h: Headers, rt: Runtime): string => `${publicUrl(h, rt)}/mcp`;

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

export const bearerOf = (authorization: string | null): string => (authorization?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "");
