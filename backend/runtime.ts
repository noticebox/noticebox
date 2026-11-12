// What a request handler needs: the forms, the store, the rate limiter and the settings from the environment. One per
// process, kept on globalThis so a dev server's reloads reuse the open database. Tests build their own.
//   NOTICEBOX_DB           the SQLite file (default data/noticebox.sqlite); it holds the boxes and forms too
//   NOTICEBOX_CONFIG       deprecated: the forms file of releases before 0.16, imported once (default noticebox.json)
//   NOTICEBOX_BASE_URL     the public URL of the inbox: links, sign-in, and the OAuth issuer for MCP
//   NOTICEBOX_SECRET       Better Auth's secret (32+ characters)
//   NOTICEBOX_ALLOWED_EMAILS, NOTICEBOX_SMTP_URL, NOTICEBOX_SMTP_FROM, NOTICEBOX_OIDC_<NAME>_*: who signs in, and how (accounts.ts)
//   NOTICEBOX_DEV_USER     a fixed user without signing in, for development; refused when NODE_ENV=production
//   NOTICEBOX_TRUST_PROXY  0 to take client addresses from the socket instead of X-Forwarded-For
//   NOTICEBOX_RATE_LIMIT   submissions per client and form in ten minutes (default 10; 0 switches the limit off)
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { openAuth, signInFromEnv, type Auth, type SignInSettings } from "./accounts";
import type { Config } from "./config";
import { Forms } from "./forms";
import { Store } from "./db";
import type { Fetch } from "./notify";

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
  baseUrl: string | null;
  devUser: string | null;
  trustProxy: boolean;
  bodyLimit: number;
  now: () => Date;
  fetch: Fetch;
  log: (line: string) => void;
};

export function makeRuntime(o: Partial<Omit<Runtime, "config" | "auth">> & { forms?: Forms; config?: Config; store: Store }): Runtime {
  const forms = o.forms ?? new Forms(o.store, {}, o.log);
  if (!o.forms && o.config) {
    const r = forms.replace(toRaw(o.config));
    if (!r.ok) throw new Error(r.error);
  }
  const { config: _ignored, ...rest } = o;
  void _ignored;
  const log = o.log ?? ((line: string) => console.error(line));
  const signIn: SignInSettings = o.signIn ?? {
    secret: randomBytes(32).toString("hex"),
    baseUrl: o.baseUrl ?? "http://localhost:3000",
    file: ":memory:",
    jwksUrl: "http://127.0.0.1:3000/api/auth/jwks",
    allowed: [],
    providers: [],
    smtp: null,
    log,
  };
  let opened: Promise<Auth> | undefined;
  return {
    rate: new Rate(10),
    baseUrl: null,
    devUser: null,
    trustProxy: true,
    bodyLimit: 64 * 1024,
    now: () => new Date(),
    fetch,
    log: (line) => console.error(line),
    ...rest,
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
  const dbPath = env.NOTICEBOX_DB ?? "data/noticebox.sqlite";
  mkdirSync(dirname(dbPath), { recursive: true });
  const log = (line: string) => console.error(line);
  // Sign-in data lives in its own file next to the inbox's database, so a backup or export of the inbox holds none of it.
  const signIn = signInFromEnv(env, join(dirname(dbPath), "auth.sqlite"), log);
  const store = new Store(dbPath);
  const forms = new Forms(store, env);
  forms.importFile(env.NOTICEBOX_CONFIG ?? "noticebox.json");
  if (env.NOTICEBOX_DEV_USER) log(`warning: NOTICEBOX_DEV_USER is set, everyone reaching the inbox is "${env.NOTICEBOX_DEV_USER}"`);
  return makeRuntime({
    forms,
    store,
    signIn,
    rate: new Rate(env.NOTICEBOX_RATE_LIMIT === undefined ? 10 : Number(env.NOTICEBOX_RATE_LIMIT)),
    baseUrl: signIn.baseUrl,
    devUser: env.NOTICEBOX_DEV_USER || null,
    trustProxy: env.NOTICEBOX_TRUST_PROXY !== "0",
    log,
  });
}

const g = globalThis as { __noticebox?: Runtime };

export function runtime(): Runtime {
  if (!g.__noticebox) g.__noticebox = fromEnv(process.env);
  return g.__noticebox;
}

/** Retention, run at start and then every six hours (instrumentation.ts). */
export function sweepNow(rt: Runtime = runtime()): { purged: number; deleted: number } {
  const purged = rt.store.sweep(rt.config, rt.now());
  const deleted = rt.store.expire(rt.config, rt.now());
  const plural = (n: number) => `${n} closed submission${n === 1 ? "" : "s"}`;
  if (purged) rt.log(`retention: personal fields removed from ${plural(purged)}`);
  if (deleted) rt.log(`retention: deleted ${plural(deleted)} with their history`);
  return { purged, deleted };
}
