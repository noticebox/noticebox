// Signs the tests' person in the way Better Auth itself would, through its server side: a user and a session in the
// server's auth.sqlite, and the signed session cookie handed to the browser as storage state. No provider and no
// mail run, and the app has no test-only way in. Playwright runs this after the server is up, so the server has
// created Better Auth's tables already.
import { writeFileSync } from "node:fs";
import { makeSignature } from "better-auth/crypto";
import { openAuth, signInFromEnv } from "../backend/accounts";
import { E2E_ENV, PERSON } from "./seed";

export default async function globalSetup(): Promise<void> {
  const settings = signInFromEnv(E2E_ENV, ".e2e/auth.sqlite", () => {});
  const auth = await openAuth(settings);
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({ email: PERSON, name: "Marcel", emailVerified: true }, { method: "email-otp" });
  const session = await ctx.internalAdapter.createSession(user.id);
  const value = encodeURIComponent(`${session.token}.${await makeSignature(session.token, settings.secret)}`);
  const state = {
    cookies: [{ name: "better-auth.session_token", value, domain: "localhost", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" }],
    origins: [],
  };
  writeFileSync(".e2e/state.json", JSON.stringify(state));
}
