// Who is asking, and where this instance lives. A page request names its person by Better Auth's HttpOnly session
// cookie (next-app-kit/signin); nothing else counts, a header a proxy might set included. /mcp and /api/v1 check their
// own tokens (next-app-kit/mcp, next-app-kit/tokens).
import { personOf as kitPersonOf, type Person } from "next-app-kit/signin";
import type { Runtime } from "./runtime";

export type { Person };

/** The person behind a page request's session cookie; NOTICEBOX_DEV_USER when there is none (development only). */
export async function personOf(h: Headers, rt: Runtime): Promise<Person | null> {
  return kitPersonOf(h, await rt.auth(), rt.devUser);
}

export type PasskeyView = { id: string; name: string | null; createdAt: string };

/** The signed-in person's passkeys, newest first, for Your settings. None for the dev user, who has no Better Auth account to hold any. */
export async function passkeysOf(h: Headers, rt: Runtime): Promise<PasskeyView[]> {
  const person = await personOf(h, rt);
  if (!person || person.id.startsWith("dev:")) return [];
  const list = await (await rt.auth()).api.listPasskeys({ headers: h });
  return list
    .map((p) => ({ id: p.id, name: p.name || null, createdAt: new Date(p.createdAt).toISOString() }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The name an action is recorded under: the signed-in person's address, or null without a session. */
export async function actorOf(h: Headers, rt: Runtime): Promise<string | null> {
  return (await personOf(h, rt))?.email ?? null;
}

/** The instance's public URL: PUBLIC_URL, never taken from a request's headers. */
export const publicUrl = (rt: Runtime): string => rt.signIn.baseUrl;

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
