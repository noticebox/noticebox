import { expect, test } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const post = (path: string) => proxy(new NextRequest(new URL(path, "http://localhost"), { method: "POST" }));

test("a form's POST is rewritten to its route handler, also when the name starts with a digit", () => {
  for (const name of ["contact", "3dbruckner-order"]) {
    expect(post(`/f/${name}`).headers.get("x-middleware-rewrite")).toBe(`http://localhost/api/f/${name}`);
  }
});

test("a name that starts with - is not a form", () => {
  expect(post("/f/-x").headers.get("x-middleware-rewrite")).toBeNull();
});

const get = (path: string, headers: Record<string, string> = {}) => proxy(new NextRequest(new URL(path, "http://localhost"), { headers }));
const passes = (r: Response) => r.headers.get("x-middleware-next") === "1";

test("the public paths need no session", () => {
  for (const path of [
    "/f/contact",
    "/f/contact/thanks",
    "/api/f/contact",
    "/health",
    "/mcp",
    "/login",
    "/api/auth/sign-in/email-otp",
    "/api/auth/oauth2/token",
    "/api/auth/jwks",
    "/api/v1/forms",
    "/api/v1/openapi.json",
    "/.well-known/oauth-protected-resource/mcp",
    "/.well-known/oauth-authorization-server/api/auth",
    "/icon.svg",
  ])
    expect(passes(get(path)), path).toBe(true);
});

test("everything else answers 401 without a session cookie, whatever header a proxy in front sets", async () => {
  for (const path of ["/", "/forms/contact", "/settings", "/export.json", "/consent", "/s/abc"]) {
    const r = get(path, { "x-authentik-username": "marcel", "x-user": "marcel" });
    expect(r.status, path).toBe(401);
    expect(r.headers.get("cache-control")).toBe("no-store");
  }
  const html = await get("/forms/contact?state=open").text();
  expect(html).toContain('href="/login?next=%2Fforms%2Fcontact%3Fstate%3Dopen"');
});

test("with Better Auth's session cookie the inbox is let through to the pages, which check the session itself", () => {
  const r = get("/forms/contact", { cookie: "better-auth.session_token=abc.def" });
  expect(passes(r)).toBe(true);
  expect(r.headers.get("cache-control")).toBe("no-store");
});

test("a file with a signed link goes through to its route, which checks the signature; without one it needs a session", () => {
  expect(passes(get("/files/HW7PEbxnVeTT?exp=1794566518&sig=abc"))).toBe(true);
  expect(get("/files/HW7PEbxnVeTT").status).toBe(401);
  expect(get("/files/HW7PEbxnVeTT/other?sig=abc").status).toBe(401);
  expect(get("/forms/order?sig=abc").status).toBe(401);
});
