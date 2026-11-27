// Signs the tests' person in the way Better Auth itself would, through its server side (next-app-kit/testing's
// signedInCookie): a user and a session in the server's auth.sqlite, and the signed session cookie handed to the browser
// as storage state. No provider and no mail run, and the app has no test-only way in. Playwright runs this after the
// server is up, so the server has created Better Auth's tables already.
import { writeFileSync } from "node:fs";
import { signedInCookie } from "next-app-kit/testing";
import { openAuth, signInFromEnv } from "../backend/accounts";
import { E2E_ENV, PERSON } from "./seed";

export default async function globalSetup(): Promise<void> {
  const auth = await openAuth(signInFromEnv(E2E_ENV, E2E_ENV.DATA_DIR!, () => {}));
  const [name, value] = (await signedInCookie(auth, PERSON)).split(/=(.*)/s) as [string, string];
  const state = {
    cookies: [{ name, value, domain: "localhost", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" }],
    origins: [],
  };
  writeFileSync(".e2e/state.json", JSON.stringify(state));
}
