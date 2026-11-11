// Sign-in: Better Auth, as ADR 0002 and the Better Auth convention set it up, with its tables in their own file,
// auth.sqlite next to the inbox's database, so a backup or export of the inbox holds no sessions or tokens.
//   - People sign in with a code mailed to them (with a link to sign in by in the same mail, outside an MCP sign-in)
//     or through the OAuth/OIDC providers NOTICEBOX_OIDC_<NAME>_* names. Only a verified email on
//     NOTICEBOX_ALLOWED_EMAILS gets in; an empty list lets nobody in.
//   - A person is one account with one username, taken from the first sign-in's claim (preferred_username, GitHub's
//     login), so the name an Authentik login recorded before stays the same. Events record that username as text.
//   - MCP clients sign in through OAuth (@better-auth/mcp), with access tokens bound to /mcp; scripts likewise, with
//     tokens bound to /api/v1, or with an API token (@better-auth/api-key) that works on /api/v1 only (tokens.ts).
// Where this differs from Better Auth's defaults: codes and links are stored hashed; no bearer plugin; telemetry off.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { apiKey } from "@better-auth/api-key";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { defineRequestState, getCurrentAdapter } from "@better-auth/core/context";
import { mcp } from "@better-auth/mcp";
import BetterSqlite3 from "better-sqlite3";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import { emailOTP } from "better-auth/plugins/email-otp";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { jwt } from "better-auth/plugins/jwt";
import { magicLink } from "better-auth/plugins/magic-link";
import { smtpMailer, type Mailer, type Smtp } from "./mail";

/** A provider from NOTICEBOX_OIDC_<NAME>_*: `issuer` is null for GitHub and Google, which Better Auth knows itself. */
export type Provider = { id: string; label: string; clientId: string; clientSecret: string; issuer: string | null };

export type SignInSettings = {
  secret: string;
  baseUrl: string;
  file: string; // auth.sqlite, or ":memory:" in tests
  jwksUrl: string; // where /mcp fetches the keys its tokens are checked with: this process itself, not through the proxy
  allowed: string[]; // addresses and @domain entries, lowercase
  providers: Provider[];
  smtp: Smtp | null;
  mailer?: Mailer; // tests catch the mail here; else SMTP
  log: (line: string) => void;
};

/** Seconds an MCP access token lives: a JWT can't be revoked before it expires, so it is short and the client refreshes it. */
export const ACCESS_TOKEN_SECONDS = 600;

/** Days an API token lives unless its maker chooses otherwise, and the most they may choose (ADR 0002). */
export const API_TOKEN_DAYS = { default: 90, max: 365 };

/** API tokens start with this, so a bearer is told apart from an OAuth access token at a glance (and by a scanner). */
export const API_TOKEN_PREFIX = "nbx_";

/** Intake records its events as `form`; no person may have that name. */
const RESERVED = new Set(["form"]);

export function emailAllowed(allowed: string[], email: string): boolean {
  const e = email.trim().toLowerCase();
  return allowed.some((a) => (a.startsWith("@") ? e.endsWith(a) : e === a));
}

/** A username from a claim: lowercase letters, digits, `.`, `_` and `-`, up to 40 characters. */
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
    .slice(0, 40);
}

/** Only a path of this instance: never another host (`//evil`), so a link can't lead off the inbox. */
export function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

// Whether this request comes from a sign-in page an MCP client sent the browser to: its signed query comes along (the
// browser client adds it to every request from that page). The body the endpoints see has it stripped, so a hook notes it.
const oauthSignIn = defineRequestState(() => false);

// The username a provider claims for the person (preferred_username, GitHub's login), from its profile to the hook
// that creates the user. `username` can't travel in the mapped profile itself: it is not an input field, so nobody can
// set or change it through Better Auth's API, and Better Auth drops it from the profile for that reason.
const claimedUsername = defineRequestState((): string | null => null);

/** A request state's value, or `fallback` outside a request (a server-side call, such as the e2e setup's). */
async function stateOr<T>(state: { get(): Promise<T> }, fallback: T): Promise<T> {
  try {
    return await state.get();
  } catch {
    return fallback;
  }
}

async function claim(name: unknown): Promise<Record<string, never>> {
  if (typeof name === "string" && name) await claimedUsername.set(name);
  return {};
}

// A sign-in link is made only while a code mail is being written, and goes into that mail: the link plugin's own endpoint,
// called from anywhere else, mails nothing.
const linkFor = new AsyncLocalStorage<{ url?: string }>();

const UNTRACKED = { ipAddress: "", userAgent: "" };

type Lookup = { findOne(q: { model: string; where: { field: string; value: string }[] }): Promise<Record<string, unknown> | null> };

/**
 * The adapter of the transaction a hook runs in, if any: Better Auth creates a user, its account and its session in
 * one transaction on the one SQLite connection, so a query through the plain adapter would wait for it forever.
 */
async function adapterIn(ctx: unknown): Promise<Lookup | null> {
  const plain = (ctx as { context?: { adapter?: unknown } } | null | undefined)?.context?.adapter;
  return plain ? ((await getCurrentAdapter(plain as Parameters<typeof getCurrentAdapter>[0])) as unknown as Lookup) : null;
}

function options(s: SignInSettings, database: BetterSqlite3.Database, self: () => Auth) {
  const mail = s.mailer ?? (s.smtp ? smtpMailer(s.smtp, s.log) : null);
  const builtIn = (id: string) => s.providers.find((p) => p.id === id && p.issuer === null);
  const github = builtIn("github");
  const google = builtIn("google");

  /** A sign-in link for `email`, to the page the sign-in page was asked for (its `next`, read off the Referer). */
  async function signInLink(email: string, headers: Headers | undefined): Promise<string | undefined> {
    let next = "/";
    try {
      next = safeNext(new URL(headers?.get("referer") ?? "").searchParams.get("next"));
    } catch {
      // No Referer, or not a URL: the link opens the inbox.
    }
    const slot: { url?: string } = {};
    await linkFor.run(slot, () =>
      self().api.signInMagicLink({
        body: { email, callbackURL: next, errorCallbackURL: `/login?${new URLSearchParams({ next })}` },
        headers: headers ?? new Headers(),
      }),
    );
    return slot.url;
  }

  return {
    appName: "noticebox",
    baseURL: s.baseUrl,
    basePath: "/api/auth",
    secret: s.secret,
    database,
    // Nothing turns telemetry on: no `telemetry` option and no BETTER_AUTH_TELEMETRY.
    emailAndPassword: { enabled: false },
    // Better Auth's lines go to noticebox's log. On SQLite it stores its list fields as JSON text and then reports each
    // as "a different type in the database" at every start; that one is dropped, everything else is kept.
    logger: {
      log: (level: string, message: string) => {
        if (!/has a different type in the database/.test(message)) s.log(`better-auth ${level}: ${message}`);
      },
    },
    user: { additionalFields: { username: { type: "string" as const, required: false, input: false, unique: true } } },
    // A second sign-in joins an account only when its provider says the address is verified. A provider listed in
    // trustedProviders would join even without that, so none is listed.
    account: { accountLinking: { enabled: true, trustedProviders: [] as string[] } },
    socialProviders: {
      ...(github
        ? { github: { clientId: github.clientId, clientSecret: github.clientSecret, mapProfileToUser: (p: { login?: string }) => claim(p.login) } }
        : {}),
      ...(google ? { google: { clientId: google.clientId, clientSecret: google.clientSecret } } : {}),
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // API tokens are made, listed and revoked only through noticebox (tokens.ts), with its checks of name, scope and
        // lifetime: the plugin's own endpoints answer server-side calls only, never a request from outside.
        if (ctx.path.startsWith("/api-key/") && ctx.request) throw new APIError("NOT_FOUND");
        if ((ctx.body as { oauth_query?: unknown } | undefined)?.oauth_query) await oauthSignIn.set(true);
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // Who may sign in, and the one username a person keeps: from the claim, else the address, never one taken.
          // `false` refuses: Better Auth then sends a provider sign-in back to the sign-in page with an error code,
          // where a thrown error would end on a bare JSON answer.
          before: async (user: { email: string; emailVerified: boolean }, ctx: unknown) => {
            if (!emailAllowed(s.allowed, user.email) || !user.emailVerified) {
              s.log(
                `sign-in: refused a new account (${emailAllowed(s.allowed, user.email) ? "address not verified" : "address not on NOTICEBOX_ALLOWED_EMAILS"})`,
              );
              return false;
            }
            const adapter = await adapterIn(ctx);
            const base = slug((await stateOr(claimedUsername, null)) || user.email.split("@")[0]!) || "person";
            let username = base;
            for (let n = 2; RESERVED.has(username) || (await adapter?.findOne({ model: "user", where: [{ field: "username", value: username }] })); n++)
              username = `${base}-${n}`;
            return { data: { ...user, username } };
          },
        },
      },
      session: {
        create: {
          // The allowlist holds at every sign-in, not only the first: an address taken off the list can't sign in again.
          // Better Auth writes the client's address and browser into every session; nothing reads them, so neither is stored.
          before: async (session: Record<string, unknown>, ctx: unknown) => {
            const adapter = await adapterIn(ctx);
            const user = adapter ? await adapter.findOne({ model: "user", where: [{ field: "id", value: String(session.userId) }] }) : null;
            if (adapter && (!user || !emailAllowed(s.allowed, String(user.email)))) {
              s.log("sign-in: refused a session (address no longer on NOTICEBOX_ALLOWED_EMAILS)");
              return false;
            }
            return { data: { ...session, ...UNTRACKED } };
          },
        },
        update: { before: async (session: Record<string, unknown>) => ({ data: { ...session, ...UNTRACKED } }) },
      },
    },
    plugins: [
      // Signs the access tokens; /mcp checks them against /api/auth/jwks.
      jwt(),
      mcp({
        loginPage: "/login",
        consentPage: "/consent",
        resource: `${s.baseUrl}/mcp`,
        // The REST API is a second resource: a script registers for it (`resources`) and asks for a token with
        // resource=<base>/api/v1, which is then bound to that alone. An /mcp token is refused there, and the reverse.
        resources: [`${s.baseUrl}/api/v1`],
        clientRegistrationAllowedResources: [`${s.baseUrl}/api/v1`],
        accessTokenExpiresIn: ACCESS_TOKEN_SECONDS,
        // Tokens only ever stand for a person: no client_credentials grant, whose tokens name nobody.
        grantTypes: ["authorization_code", "refresh_token"],
        // claude.ai registers itself (RFC 7591); clients with a metadata document use cimd() below.
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
      // API tokens: stored hashed, with a name, a scope (`inbox: read` or `inbox: read, write`) and an expiry. A key never
      // stands for a session (enableSessionForAPIKeys stays off), and only /api/v1 reads it, from the Authorization header.
      apiKey({
        defaultPrefix: API_TOKEN_PREFIX,
        requireName: true,
        // tokens.ts always passes the lifetime itself (90 days unless chosen); null there must mean none, which the
        // plugin only honours when its own default is none.
        keyExpiration: { defaultExpiresIn: null, maxExpiresIn: API_TOKEN_DAYS.max },
        // Its default is ten requests a day per key; noticebox's own limits apply instead.
        rateLimit: { enabled: false },
        permissions: { defaultPermissions: { inbox: ["read"] } },
      }),
      // Codes and links are stored hashed: auth.sqlite holds no usable code or link.
      emailOTP({
        storeOTP: "hashed",
        sendVerificationOTP: async ({ email, otp, type }: { email: string; otp: string; type: string }, ctx?: { request?: Request }) => {
          if (type !== "sign-in") return;
          if (!mail) throw new APIError("BAD_REQUEST", { message: "Sign-in by email is off on this instance" });
          // No mail to an address that may not sign in: nobody can use noticebox to send mail to strangers.
          if (!emailAllowed(s.allowed, email)) return;
          // During an MCP sign-in (the sign-in page's signed query came along) the mail holds only the code: a link would
          // sign in whichever browser opens it, not the one the authorization waits in.
          const link = (await stateOr(oauthSignIn, false)) ? undefined : await signInLink(email, ctx?.request?.headers);
          await mail(email, otp, link);
        },
      }),
      magicLink({
        storeToken: "hashed",
        sendMagicLink: ({ url }: { url: string }) => {
          const slot = linkFor.getStore();
          if (slot) slot.url = url;
        },
      }),
      genericOAuth({
        config: s.providers
          .filter((p) => p.issuer !== null)
          .map((p) => ({
            providerId: p.id,
            discoveryUrl: `${p.issuer}/.well-known/openid-configuration`,
            clientId: p.clientId,
            clientSecret: p.clientSecret || undefined,
            scopes: ["openid", "email", "profile"],
            pkce: true,
            mapProfileToUser: (profile: Record<string, unknown>) => claim(profile.preferred_username),
          })),
      }),
    ],
  };
}

export type Auth = ReturnType<typeof betterAuth<ReturnType<typeof options>>>;

/** Opens auth.sqlite, creates or extends Better Auth's own tables as its version and plugins need, and starts it. */
export async function openAuth(s: SignInSettings): Promise<Auth> {
  const database = new BetterSqlite3(s.file, { timeout: 5000 });
  try {
    database.pragma("journal_mode = wal");
    // Migrated before Better Auth starts, which would otherwise report the tables it is about to get as missing.
    const started: { auth?: Auth } = {};
    const opts = options(s, database, () => started.auth!);
    const { runMigrations } = await getMigrations(opts);
    await runMigrations();
    started.auth = betterAuth(opts);
    return started.auth;
  } catch (e) {
    database.close();
    throw e;
  }
}

type Env = Record<string, string | undefined>;

/**
 * The sign-in settings from the environment, checked at start: a provider needs its client id and secret (and an
 * issuer, unless it is GITHUB or GOOGLE); some way in must exist; NOTICEBOX_DEV_USER never runs in production.
 */
export function signInFromEnv(env: Env, file: string, log: (line: string) => void): SignInSettings {
  const dev = env.NOTICEBOX_DEV_USER || null;
  if (dev && env.NODE_ENV === "production") throw new Error("NOTICEBOX_DEV_USER signs everyone in without a password: it is refused when NODE_ENV=production");
  const providers: Provider[] = [];
  for (const key of Object.keys(env).sort()) {
    const m = /^NOTICEBOX_OIDC_([A-Z0-9_]+?)_CLIENT_ID$/.exec(key);
    if (!m) continue;
    const name = m[1]!;
    const at = `NOTICEBOX_OIDC_${name}`;
    const builtIn = name === "GITHUB" || name === "GOOGLE";
    const issuer = env[`${at}_ISSUER`]?.replace(/\/$/, "") || null;
    if (!builtIn && !issuer) throw new Error(`${at}_ISSUER is needed: the OIDC discovery base of the provider`);
    const clientSecret = env[`${at}_CLIENT_SECRET`] ?? "";
    if (builtIn && !clientSecret) throw new Error(`${at}_CLIENT_SECRET is needed`);
    const id = name.toLowerCase().replace(/_/g, "-");
    const label = env[`${at}_LABEL`] || (name === "GITHUB" ? "GitHub" : name === "GOOGLE" ? "Google" : name.charAt(0) + name.slice(1).toLowerCase());
    providers.push({ id, label, clientId: env[key]!, clientSecret, issuer: builtIn ? null : issuer });
  }
  const smtp = env.NOTICEBOX_SMTP_URL ? { url: env.NOTICEBOX_SMTP_URL, from: env.NOTICEBOX_SMTP_FROM || "noticebox <noticebox@localhost>" } : null;
  if (!dev && !smtp && providers.length === 0)
    throw new Error("there is no way to sign in: set NOTICEBOX_SMTP_URL for sign-in by email, or a provider (NOTICEBOX_OIDC_<NAME>_CLIENT_ID and the rest)");
  let secret = env.NOTICEBOX_SECRET ?? "";
  if (secret.length < 32) {
    if (!dev) throw new Error("NOTICEBOX_SECRET must be set, with at least 32 characters (openssl rand -base64 48)");
    // Development without a secret: a new one at every start, so sessions don't outlive the process.
    secret = randomBytes(32).toString("hex");
  }
  const baseUrl = env.NOTICEBOX_BASE_URL?.replace(/\/$/, "") || (dev ? `http://localhost:${env.PORT || 3000}` : "");
  if (!baseUrl) throw new Error("NOTICEBOX_BASE_URL must be set: the public URL of the inbox, which sign-in links and MCP tokens name");
  const allowed = (env.NOTICEBOX_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0 && !dev) log("warning: NOTICEBOX_ALLOWED_EMAILS is empty, so nobody can sign in");
  return { secret, baseUrl, file, jwksUrl: `http://127.0.0.1:${env.PORT || 3000}/api/auth/jwks`, allowed, providers, smtp, log };
}

/** What the sign-in page offers: email (when mail can be sent) and a button per provider. */
export function signInMethods(s: SignInSettings): { email: boolean; providers: { id: string; label: string; builtIn: boolean }[] } {
  return { email: s.smtp !== null || s.mailer !== undefined, providers: s.providers.map((p) => ({ id: p.id, label: p.label, builtIn: p.issuer === null })) };
}
