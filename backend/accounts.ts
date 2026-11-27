// Sign-in is next-app-kit's (next-app-kit/signin; ADR 0002): Better Auth in its own auth.sqlite in DATA_DIR, next to
// the inbox's database, so a backup or export of the inbox holds no sessions or tokens. What stays noticebox's is what
// the kit asks an app for: its settings prefix (NOTICEBOX_*), the prefix of its API tokens, the words of the sign-in
// mail, and the one change an auth.sqlite from before the kit needs (below).
import { existsSync } from "node:fs";
import { join } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { openAuth as openKitAuth, signInFromEnv as kitSignInFromEnv, type Auth, type MailTexts, type SignInSettings } from "next-app-kit/signin";

export type { Auth, SignInSettings };

/** The settings prefix: NOTICEBOX_SECRET, NOTICEBOX_ALLOWED_EMAILS, NOTICEBOX_OIDC_<NAME>_* and the rest. */
export const PREFIX = "NOTICEBOX";

/** API tokens start with this, so a bearer is told apart from an OAuth access token at a glance (and by a scanner). */
export const API_TOKEN_PREFIX = "nbx_";

/** The sign-in mail, in noticebox's words. */
export const MAIL: Record<string, MailTexts> = {
  en: {
    subject: (code) => `${code} is your noticebox sign-in code`,
    body: (code, link) =>
      [
        `Your sign-in code for noticebox: ${code}`,
        "",
        link ? `Or open this link to sign in:\n${link}\n` : "Type it into the sign-in page that asked for it.\n",
        "It works once, for a few minutes. If you didn't ask for it, ignore this mail.",
      ].join("\n"),
  },
};

type Env = Record<string, string | undefined>;

/** The sign-in settings from the environment (PUBLIC_URL and NOTICEBOX_*), checked at start; auth.sqlite in `dataDir`. */
export function signInFromEnv(env: Env, dataDir: string, log: (line: string) => void): SignInSettings {
  const s = kitSignInFromEnv(env, { prefix: PREFIX, file: join(dataDir, "auth.sqlite"), appName: "noticebox", log });
  // The sender noticebox has always used when NOTICEBOX_SMTP_FROM is unset.
  if (s.smtp && !env.NOTICEBOX_SMTP_FROM) s.smtp = { ...s.smtp, from: "noticebox <noticebox@localhost>" };
  return s;
}

/**
 * API tokens made before the kit carry their scope as `inbox: [...]`; the kit reads `api: [...]`. Renamed once, in
 * place, before Better Auth opens the file, so a read+write token stays read+write. A file without tokens, or one
 * already renamed, is left as it is.
 */
export function renameTokenScopes(file: string): number {
  if (file === ":memory:" || !existsSync(file)) return 0;
  const db = new BetterSqlite3(file, { timeout: 5000 });
  try {
    const table = db.prepare("select 1 from sqlite_master where type = 'table' and name = 'apikey'").get();
    if (!table) return 0;
    return db
      .prepare(
        `update "apikey" set "permissions" = json_set(json_remove("permissions", '$.inbox'), '$.api', json_extract("permissions", '$.inbox'))
         where json_valid("permissions") and json_extract("permissions", '$.inbox') is not null`,
      )
      .run().changes;
  } finally {
    db.close();
  }
}

/** Better Auth for the inbox, as the kit opens it. */
export async function openAuth(s: SignInSettings): Promise<Auth> {
  const renamed = renameTokenScopes(s.file);
  if (renamed) s.log(`sign-in: ${renamed} API token${renamed === 1 ? "" : "s"} from before next-app-kit now carry their scope as the kit reads it`);
  return openKitAuth(s, { apiTokenPrefix: API_TOKEN_PREFIX, texts: MAIL });
}
