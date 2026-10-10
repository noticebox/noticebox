// Shared by the tests: a configuration with one form of each kind, a runtime on an in-memory store, and request helpers.
import { parseConfig, type Config } from "./config";
import { Store } from "./db";
import { makeRuntime, Rate, type Runtime } from "./runtime";

export type Hit = { url: string; headers: Record<string, string>; body: string };

export const SECRET = "test-secret-".padEnd(32, "x");
export const BASE = "https://inbox.test";

export function testConfig(ntfy: string | null = "https://ntfy.test/topic", webhook: string | null = "https://hook.test/in"): Config {
  return parseConfig({
    forms: {
      report: {
        kind: "report",
        title: "Report content",
        intro: "Say what is wrong.",
        fields: {
          read_id: { type: "hidden" },
          note_id: { type: "hidden" },
          file: { type: "text", label: "File", personal: false },
          reason: { type: "select", label: "Reason", required: true, options: ["Illegal content", "Personal data", "Spam", "Other"] },
          text: { type: "textarea", label: "What is wrong", required: true, max: 2000 },
          email: { type: "email", label: "Your email", help: "Only to answer you." },
        },
        retentionDays: 90,
        notify: { ntfy, webhook },
        link: { url: "https://notes.test/r/{read_id}/{note_id}", label: "Open the note" },
      },
      contact: {
        kind: "message",
        title: "Contact",
        fields: { name: { required: true }, email: { type: "email", required: true }, message: { type: "textarea", required: true } },
        origins: ["https://example.org"],
        redirect: "https://example.org/thanks",
        retentionDays: 30,
      },
    },
  });
}

export type TestRuntime = Runtime & { hits: Hit[] };

export function testRuntime(o: Partial<Runtime> = {}): TestRuntime {
  const hits: Hit[] = [];
  const rt = makeRuntime({
    config: testConfig(),
    store: new Store(":memory:"),
    baseUrl: BASE,
    userHeader: "x-user",
    secret: SECRET,
    rate: new Rate(10),
    log: () => {},
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      const headers = Object.fromEntries(new Headers(init?.headers).entries());
      hits.push({ url: String(url), headers, body: String(init?.body ?? "") });
      return new Response("ok");
    }) as typeof fetch,
    ...o,
  });
  return Object.assign(rt, { hits });
}

export const REPORT = { read_id: "r1", note_id: "n1", file: "a.png", reason: "Spam", text: "This is spam.\r\nSecond line.", email: "who@example.org" };

export function formPost(path: string, data: Record<string, string>, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(data).toString() });
}

export function jsonPost(path: string, data: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof data === "string" ? data : JSON.stringify(data) });
}

export async function until(check: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 5));
  }
}
