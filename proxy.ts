import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { t } from "@/app/_lib/copy";

// The public side: the hosted forms and their endpoint, the health check, MCP, the REST API, Better Auth's own endpoints and the
// OAuth metadata (each checks its credentials itself), and the sign-in page. Everything else is the inbox, which needs
// a Better Auth session: without its cookie, a request gets 401, with a link to the sign-in page for a browser. Only
// the cookie's presence is checked here; the pages check the session itself (personOf), so a forged cookie gets nowhere.
// A header a proxy in front might set (X-Authentik-Username) counts for nothing.
const FORM = /^\/f\/([a-z0-9][a-z0-9_-]{0,39})$/;
const PUBLIC = /^\/(f\/|api\/f\/|api\/auth\/|api\/v1\/|health$|mcp$|login$|\.well-known\/|(icon\.svg|apple-icon\.png|opengraph-image\.png)$)/;

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`);

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Pages are GET-only; a form's POST goes to its route handler, which Next can't put next to the page.
  const m = FORM.exec(pathname);
  if (m && req.method !== "GET" && req.method !== "HEAD") return NextResponse.rewrite(new URL(`/api/f/${m[1]}${search}`, req.url));

  if (PUBLIC.test(pathname)) return NextResponse.next();

  if (getSessionCookie(req) || process.env.NOTICEBOX_DEV_USER) {
    const res = NextResponse.next();
    res.headers.set("cache-control", "no-store");
    return res;
  }
  // 401, not a redirect: a script or monitor sees that the inbox is closed; a person gets the way to sign in.
  const login = `/login${pathname === "/" ? "" : `?${new URLSearchParams({ next: pathname + search })}`}`;
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="refresh" content="0; url=${escape(login)}"><title>${escape(t.closed.title)}</title><p>${escape(t.closed.text)} <a href="${escape(login)}">${escape(t.closed.link)}</a></p>`;
  return new NextResponse(html, { status: 401, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export const config = {
  matcher: "/((?!_next/|favicon\\.ico).*)",
};
