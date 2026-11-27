// What a request handler needs: the forms, the store, the rate limiter and the settings from the environment. One per
// process, kept on globalThis so a dev server's reloads reuse the open database. Tests build their own.
//   DATA_DIR               where everything kept lives (default data): noticebox.sqlite, with the boxes and forms
//                          too, and auth.sqlite, the sign-in's (next-app-kit/signin)
//   PUBLIC_URL             the public URL of the inbox: links, sign-in, and the OAuth issuer for MCP
//   NOTICEBOX_CONFIG       deprecated: the forms file of releases before 0.16, imported once (default noticebox.json)
//   NOTICEBOX_SECRET       Better Auth's secret (32+ characters)
//   NOTICEBOX_ALLOWED_EMAILS, NOTICEBOX_SMTP_URL, NOTICEBOX_SMTP_FROM, NOTICEBOX_OIDC_<NAME>_*: who signs in, and how (the kit)
//   NOTICEBOX_DEV_USER     a fixed user without signing in, for development; refused when NODE_ENV=production
//   NOTICEBOX_TRUST_PROXY  0 to take client addresses from the socket instead of X-Forwarded-For
//   NOTICEBOX_RATE_LIMIT   submissions per client and form in ten minutes (default 10; 0 switches the limit off)
//   TMPDIR                 where a post's files wait while it is checked (the system's temporary folder; not data)
//   NOTICEBOX_METRICS_TOKEN the bearer token /metrics wants (32+ characters); without it /metrics is not there
//   NOTICEBOX_MAIL_TO      the addresses and @domains a form's mail target may write to (comma-separated); without it, none
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { openAuth, PREFIX, signInFromEnv, type Auth, type SignInSettings } from "./accounts";
import type { Config } from "./config";
import { Forms } from "./forms";
import { Store } from "./db";
import { Counters } from "./metrics";
import { smtpSend, type Fetch, type Mail } from "./notify";

export class Rate {
  private hits = new Map<string, number[]>();
  private max: number;
  private windowMs: number;
  constructor(max: number, windowMs = 10 * 60 * 1000) {
    this.max = max;
    this.windowMs = windowMs;
  }
  allow(key: string, now: number): boolean {
    if (this.max <= 0) return true;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
    const ok = recent.length < this.max;
    if (ok) recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10000) for (const [k, v] of this.hits) if (!v.some((t) => t > now - this.windowMs)) this.hits.delete(k);
    return ok;
  }
}

export type Runtime = {
  forms: Forms; // the boxes and forms, editable
  readonly config: Config; // what they are now
  store: Store;
  signIn: SignInSettings;
  auth: () => Promise<Auth>; // Better Auth, opened on first use
  rate: Rate;
  devUser: string | null;
  trustProxy: boolean;
  bodyLimit: number;
  now: () => Date;
  fetch: Fetch;
  mail: Mail | null; // arrivals by mail, through the sign-in SMTP; null without one
  metricsToken: string | null; // what /metrics wants as bearer; null: no /metrics
  counters: Counters; // arrivals and failed announcements since start, for /metrics
  log: (line: string) => void;
};

export function makeRuntime(
  o: Partial<Omit<Runtime, "config" | "auth">> & { forms?: Forms; config?: Config; store: Store; baseUrl?: string; mailTo?: string[] },
): Runtime {
  const { config: _ignored, baseUrl, mailTo: _mailTo, ...rest } = o;
  void _mailTo;
  void _ignored;
  const log = o.log ?? ((line: string) => console.error(line));
  const signIn: SignInSettings = o.signIn ?? {
    prefix: PREFIX,
    appName: "noticebox",
    secret: randomBytes(32).toString("hex"),
    baseUrl: baseUrl ?? "http://localhost:3000",
    file: ":memory:",
    jwksUrl: "http://127.0.0.1:3000/api/auth/jwks",
    allowed: ["@test.example"], // the tests' people

    providers: [],
    smtp: null,
    devUser: null,
    passkey: { rpName: "noticebox" },
    log,
  };
  const mailTo = o.mailTo ?? [];
  const mail = o.mail !== undefined ? o.mail : signIn.smtp ? { send: smtpSend(signIn.smtp), mailTo } : null;
  const forms = o.forms ?? new Forms(o.store, {}, o.log);
  forms.mailPolicy = { mailTo: mail?.mailTo ?? mailTo, smtp: mail !== null };
  if (!o.forms && o.config) {
    const r = forms.replace(toRaw(o.config));
    if (!r.ok) throw new Error(r.error);
  }
  let opened: Promise<Auth> | undefined;
  return {
    rate: new Rate(10),
    devUser: null,
    trustProxy: true,
    bodyLimit: 64 * 1024,
    now: () => new Date(),
    fetch,
    log: (line) => console.error(line),
    metricsToken: null,
    counters: new Counters(),
    ...rest,
    mail,
    signIn,
    // A failed open is not remembered, so the next request tries again.
    auth: () => {
      if (!opened) {
        const p = openAuth(signIn);
        opened = p;
        p.catch(() => {
          if (opened === p) opened = undefined;
        });
      }
      return opened;
    },
    forms,
    get config() {
      return forms.config;
    },
  };
}

/** A parsed configuration as a raw object (tests build runtimes from parsed configurations). */
function toRaw(c: Config): { boxes: string[]; forms: Record<string, Record<string, unknown>> } {
  const entries = Object.entries(c.forms).map(([n, f]) => {
    const { name, ...rest } = f;
    void name;
    // A parsed file field keeps its limits in `files`; written out, they are the keys a form is written with.
    const fields = Object.fromEntries(
      Object.entries(f.fields).map(([k, { files, ...field }]) => [
        k,
        files ? { ...field, accept: files.accept, maxFiles: files.maxFiles, maxMegabytes: files.maxBytes / 1024 / 1024 } : field,
      ]),
    );
    return [n, { ...rest, fields }];
  });
  return { boxes: c.boxes, forms: Object.fromEntries(entries) };
}

function fromEnv(env: Record<string, string | undefined>): Runtime {
  const dataDir = env.DATA_DIR || "data";
  mkdirSync(dataDir, { recursive: true });
  const log = (line: string) => console.error(line);
  // Sign-in data lives in its own file next to the inbox's database, so a backup or export of the inbox holds none of it.
  const signIn = signInFromEnv(env, dataDir, log);
  const store = new Store(join(dataDir, "noticebox.sqlite"));
  const forms = new Forms(store, env);
  forms.importFile(env.NOTICEBOX_CONFIG ?? "noticebox.json");
  return makeRuntime({
    forms,
    store,
    signIn,
    rate: new Rate(env.NOTICEBOX_RATE_LIMIT === undefined ? 10 : Number(env.NOTICEBOX_RATE_LIMIT)),
    devUser: signIn.devUser,
    trustProxy: env.NOTICEBOX_TRUST_PROXY !== "0",
    metricsToken: metricsTokenFrom(env),
    mailTo: mailToFrom(env),
    log,
  });
}

/** NOTICEBOX_METRICS_TOKEN, or null; one too short to be a secret stops the start, as NOTICEBOX_SECRET does. */
/** NOTICEBOX_MAIL_TO as a list: lower-case addresses and `@domain` entries; anything else stops the start with the reason. */
export function mailToFrom(env: Record<string, string | undefined>): string[] {
  const entries = (env.NOTICEBOX_MAIL_TO ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  for (const e of entries) if (!/^[^\s@]*@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error(`NOTICEBOX_MAIL_TO: "${e}" is neither an address nor an @domain`);
  return entries;
}

export function metricsTokenFrom(env: Record<string, string | undefined>): string | null {
  const token = env.NOTICEBOX_METRICS_TOKEN?.trim();
  if (!token) return null;
  if (token.length < 32) throw new Error("NOTICEBOX_METRICS_TOKEN must be at least 32 characters (openssl rand -hex 32)");
  return token;
}

const g = globalThis as { __noticebox?: Runtime };

export function runtime(): Runtime {
  if (!g.__noticebox) g.__noticebox = fromEnv(process.env);
  return g.__noticebox;
}

/** Retention, run at start and then every minute (instrumentation.ts); a few small queries when nothing is due. */
export function sweepNow(rt: Runtime = runtime()): { purged: number; deleted: number } {
  const purged = rt.store.sweep(rt.config, rt.now());
  const deleted = rt.store.expire(rt.config, rt.now());
  const plural = (n: number) => `${n} closed submission${n === 1 ? "" : "s"}`;
  if (purged) rt.log(`retention: personal fields removed from ${plural(purged)}`);
  if (deleted) rt.log(`retention: deleted ${plural(deleted)} with their history`);
  return { purged, deleted };
}
