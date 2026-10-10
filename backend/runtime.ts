// What a request handler needs: the forms, the store, the rate limiter and the settings from the environment. One per
// process, kept on globalThis so a dev server's reloads reuse the open database. Tests build their own.
//   NOTICEBOX_CONFIG       the forms file (default noticebox.json)
//   NOTICEBOX_DB           the SQLite file (default data/noticebox.sqlite)
//   NOTICEBOX_BASE_URL     the public URL of the inbox, for links and as the OAuth issuer (else taken from the request)
//   NOTICEBOX_USER_HEADER  the header the login proxy sets (default X-Authentik-Username)
//   NOTICEBOX_DEV_USER     a fixed user when running without a proxy; never set this in production
//   NOTICEBOX_SECRET       signs the OAuth tokens for MCP (32+ characters); unset, there is no MCP
//   NOTICEBOX_TRUST_PROXY  0 to take client addresses from the socket instead of X-Forwarded-For
//   NOTICEBOX_RATE_LIMIT   submissions per client and form in ten minutes (default 10; 0 switches the limit off)
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { loadConfig, type Config } from "./config";
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
  config: Config;
  store: Store;
  rate: Rate;
  baseUrl: string | null;
  userHeader: string;
  devUser: string | null;
  trustProxy: boolean;
  secret: string | null;
  bodyLimit: number;
  now: () => Date;
  fetch: Fetch;
  log: (line: string) => void;
};

export function makeRuntime(o: Partial<Runtime> & { config: Config; store: Store }): Runtime {
  return {
    rate: new Rate(10),
    baseUrl: null,
    devUser: null,
    trustProxy: true,
    secret: null,
    bodyLimit: 64 * 1024,
    now: () => new Date(),
    fetch,
    log: (line) => console.error(line),
    ...o,
    userHeader: (o.userHeader ?? "x-authentik-username").toLowerCase(),
  };
}

function fromEnv(env: Record<string, string | undefined>): Runtime {
  const config = loadConfig(env.NOTICEBOX_CONFIG ?? "noticebox.json", env);
  const dbPath = env.NOTICEBOX_DB ?? "data/noticebox.sqlite";
  mkdirSync(dirname(dbPath), { recursive: true });
  const secret = env.NOTICEBOX_SECRET ?? null;
  if (secret !== null && secret.length < 32) throw new Error("NOTICEBOX_SECRET must have at least 32 characters");
  if (env.NOTICEBOX_DEV_USER) console.error(`warning: NOTICEBOX_DEV_USER is set, everyone reaching the inbox is "${env.NOTICEBOX_DEV_USER}"`);
  return makeRuntime({
    config,
    store: new Store(dbPath),
    rate: new Rate(env.NOTICEBOX_RATE_LIMIT === undefined ? 10 : Number(env.NOTICEBOX_RATE_LIMIT)),
    baseUrl: env.NOTICEBOX_BASE_URL?.replace(/\/$/, "") ?? null,
    userHeader: env.NOTICEBOX_USER_HEADER,
    devUser: env.NOTICEBOX_DEV_USER || null,
    trustProxy: env.NOTICEBOX_TRUST_PROXY !== "0",
    secret,
  });
}

const g = globalThis as { __noticebox?: Runtime };

export function runtime(): Runtime {
  if (!g.__noticebox) g.__noticebox = fromEnv(process.env);
  return g.__noticebox;
}

/** Retention, run at start and then every six hours (instrumentation.ts). */
export function sweepNow(rt: Runtime = runtime()): number {
  const n = rt.store.sweep(rt.config, rt.now());
  if (n) console.log(`retention: personal fields removed from ${n} closed submission${n === 1 ? "" : "s"}`);
  return n;
}
