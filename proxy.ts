import { NextResponse, type NextRequest } from "next/server";

// The public side: the hosted forms and their endpoint, the health check, MCP and the OAuth endpoints an MCP
// client calls on its own (each checks its token itself). Everything else is the inbox, which the login proxy in
// front of this app guards; it tells us the user in a header, and without that header the inbox answers 401, so
// a deployment without the proxy fails closed.
const FORM = /^\/f\/([a-z0-9][a-z0-9_-]{0,39})$/;
const PUBLIC = /^\/(f\/|api\/f\/|health$|mcp$|oauth\/(token|register)$|\.well-known\/|(icon\.svg|apple-icon\.png|opengraph-image\.png)$)/;

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Pages are GET-only; a form's POST goes to its route handler, which Next can't put next to the page.
  const m = FORM.exec(pathname);
  if (m && req.method !== "GET" && req.method !== "HEAD") return NextResponse.rewrite(new URL(`/api/f/${m[1]}${search}`, req.url));

  if (PUBLIC.test(pathname)) return NextResponse.next();

  const header = (process.env.NOTICEBOX_USER_HEADER ?? "x-authentik-username").toLowerCase();
  const user = req.headers.get(header)?.trim() || process.env.NOTICEBOX_DEV_USER;
  if (!user) return new NextResponse("Sign in first: the inbox is reached through the login in front of it.", { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } });
  const res = NextResponse.next();
  res.headers.set("cache-control", "no-store");
  return res;
}

export const config = {
  matcher: "/((?!_next/|favicon\\.ico).*)",
};
