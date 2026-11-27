// An upgrade to next-app-kit keeps what people had: an auth.sqlite that noticebox 0.22.0 made (backend/fixtures) opens
// on the kit with its person still signed in, both API tokens working within their scopes, and the MCP client still
// allowed. Only the tokens' scope needs a change in place (accounts.ts, renameTokenScopes); everything else is read as
// it was written.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { makeSignature } from "better-auth/crypto";
import { whoFor } from "next-app-kit/mcp";
import type { SignInSettings } from "next-app-kit/signin";
import { expect, test } from "vitest";
import { renameTokenScopes } from "./accounts";
import { connections, listApiTokens } from "./admin";
import { personOf } from "./auth";
import { mcpContext } from "./mcp";
import { BASE, restRoute, testRuntime } from "./testutil";

const ADA = "L16emyZQhVd9oag1jZgQyDTsuOXERXMX";
const SESSION = "x0LhYbJ372g3gCY9Wjhf62DF7YfAuquC";
const READ_WRITE = "nbx_RMGVoDUIFSUsLuPHPsacfouunDuaqPxWIBXePUEhFuWbaYSpsoNlRVquHKdglyqH";
const READ = "nbx_yuowYPLJeaYMfRufejxRorRuZaEzthYALCKabphVmJIVSOXccfSEAkBabMMqBNlY";
const SECRET = "f".repeat(40);

/** A copy of the 0.22.0 auth.sqlite in a folder of its own. */
function oldAuthFile(): string {
  const file = join(mkdtempSync(join(tmpdir(), "noticebox-upgrade-")), "auth.sqlite");
  const db = new BetterSqlite3(file);
  db.exec(readFileSync(join(import.meta.dirname, "fixtures/auth-0.22.sql"), "utf8"));
  db.close();
  return file;
}

test("an auth.sqlite from 0.22.0 keeps its session, its API tokens and their scopes, and its MCP consent", async () => {
  const file = oldAuthFile();
  const signIn: SignInSettings = {
    prefix: "NOTICEBOX",
    appName: "noticebox",
    secret: SECRET,
    baseUrl: BASE,
    file,
    jwksUrl: "http://127.0.0.1:3000/api/auth/jwks",
    allowed: ["ada@test.example"],
    providers: [],
    smtp: null,
    mailer: async () => {},
    devUser: null,
    passkey: { rpName: "noticebox" },
    log: () => {},
  };
  const rt = testRuntime({ signIn });

  // Still signed in: the session cookie the browser holds (on https, Better Auth's __Secure- name, as before) names the
  // same person.
  const cookie = `__Secure-better-auth.session_token=${encodeURIComponent(`${SESSION}.${await makeSignature(SESSION, SECRET)}`)}`;
  expect(await personOf(new Headers({ cookie }), rt)).toEqual({ id: ADA, email: "ada@test.example" });

  // Both tokens still work, each within its scope: read+write writes, read only reads.
  expect((await listApiTokens(rt, ADA)).map((t) => [t.name, t.scope]).sort()).toEqual([
    ["backup", "read+write"],
    ["reader", "read"],
  ]);
  const api = (method: string, path: string, token: string, body?: unknown) =>
    restRoute(
      new Request(`${BASE}/api/v1${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      }),
      rt,
    );
  expect((await api("GET", "/forms", READ)).status).toBe(200);
  expect((await api("POST", "/boxes", READ, { name: "Shop" })).status).toBe(403);
  expect((await api("POST", "/boxes", READ_WRITE, { name: "Shop" })).status).toBe(201);

  // The assistant she allowed is still allowed, and acts in her name.
  expect((await connections(rt, ADA)).map((c) => c.client_name)).toEqual(["Claude"]);
  expect(await whoFor(await mcpContext(rt), ADA, "claude")).toMatchObject({ actor: "ada@test.example via Claude", person: ADA });

  // The rename happened once: a second start finds nothing left to change.
  expect(renameTokenScopes(file)).toBe(0);
});
