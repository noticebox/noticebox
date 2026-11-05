// Issues from submissions: what the draft carries (never a personal field), the call GitHub gets, one issue per
// submission, and the refusals.
import { expect, test } from "vitest";
import { parseConfig } from "./config";
import { gitHubToken, issueDraft, openIssue, setGitHubToken } from "./github";
import { SECRET } from "./testutil";
import { REPORT, testConfig, testRuntime } from "./testutil";

const withGitHub = () => {
  const c = testConfig();
  c.forms.report!.github = { repo: "acme/site", labels: ["report"] };
  return c;
};

const TOKEN = "github_pat_" + "a".repeat(40);

function githubRuntime(status = 201, token: string | null = TOKEN) {
  const calls: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const rt = testRuntime({
    config: withGitHub(),
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(String(init.body)) as Record<string, unknown> });
      return status === 201 ? Response.json({ number: 7, html_url: "https://github.com/acme/site/issues/7" }, { status }) : Response.json({ message: "Not Found" }, { status });
    }) as typeof fetch,
  });
  if (token) expect(setGitHubToken(rt, "report", token, "marcel")).toEqual({ ok: true });
  const s = rt.store.receive(rt.config.forms.report!, REPORT, null, new Date("2026-11-01T10:00:00Z"));
  return { rt, s, calls };
}

test("github is a repository, as a string or with labels", () => {
  const form = (github: unknown) => parseConfig({ forms: { r: { kind: "report", github } } }).forms.r!.github;
  expect(form(undefined)).toBeNull();
  expect(form("acme/site")).toEqual({ repo: "acme/site", labels: [] });
  expect(form({ repo: "acme/site.io", labels: ["report", " "] })).toEqual({ repo: "acme/site.io", labels: ["report"] });
  expect(() => form("acme")).toThrow(/owner\/name/);
  expect(() => form({ repo: "acme/site", labels: "x" })).toThrow(/labels/);
});

test("the draft carries the fields that are not personal, the link and the id, never the text or the email", () => {
  const { rt, s } = githubRuntime();
  const d = issueDraft(rt.config.forms.report!, s);
  expect(d.body).toContain("**Reason:** Spam");
  expect(d.body).toContain("**File:** a.png");
  expect(d.body).toContain("**Open the note:** https://notes.test/r/r1/n1");
  expect(d.body).toContain(s.id);
  expect(d.body).not.toContain("spam.");
  expect(d.body).not.toContain("who@example.org");
  expect(d.title).toBe("Report content: a.png");
});

test("an issue is opened in the form's repository, recorded in the history, and only once", async () => {
  const { rt, s, calls } = githubRuntime();
  const r = await openIssue(rt, s.id, "marcel", { title: "Spam on a note" });
  expect(r.ok).toBe(true);
  expect(calls).toHaveLength(1);
  expect(calls[0]!.url).toBe("https://api.github.com/repos/acme/site/issues");
  expect(calls[0]!.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
  expect(calls[0]!.body).toMatchObject({ title: "Spam on a note", labels: ["report"] });
  expect(calls[0]!.body.body).not.toContain("who@example.org");
  expect(rt.store.issue(s.id)).toMatchObject({ repo: "acme/site", number: 7, url: "https://github.com/acme/site/issues/7", actor: "marcel" });
  const note = rt.store.events(s.id).at(-1)!;
  expect(note).toMatchObject({ actor: "marcel", to_state: null, reason: "Opened GitHub issue acme/site#7: https://github.com/acme/site/issues/7" });
  const again = await openIssue(rt, s.id, "marcel");
  expect(again).toEqual({ ok: false, error: expect.stringContaining("already has issue acme/site#7") });
  expect(calls).toHaveLength(1);
});

test("refused without a repository, without a token, and when GitHub says no", async () => {
  const noToken = githubRuntime(201, null);
  expect(await openIssue(noToken.rt, noToken.s.id, "marcel")).toEqual({ ok: false, error: expect.stringContaining("has no GitHub token") });
  const contact = noToken.rt.store.receive(noToken.rt.config.forms["contact-open"]!, { a: "b" }, null, new Date());
  const plain = githubRuntime();
  expect((await openIssue(plain.rt, contact.id, "marcel")).ok).toBe(false);
  const denied = githubRuntime(404);
  const r = await openIssue(denied.rt, denied.s.id, "marcel");
  expect(r).toEqual({ ok: false, error: expect.stringContaining("may not open issues in acme/site") });
  expect(denied.rt.store.issue(denied.s.id)).toBeUndefined();
  expect(await openIssue(denied.rt, denied.s.id, "marcel", { title: " " })).toEqual({ ok: false, error: "an issue needs a title" });
});

test("a form's token is kept sealed, shown only as who set it, and lost with the secret", () => {
  const { rt } = githubRuntime();
  const row = rt.store.formToken("report")!;
  expect(row.sealed).not.toContain(TOKEN.slice(11));
  expect(gitHubToken(rt, "report")).toMatchObject({ set_by: "marcel", readable: true });
  expect(setGitHubToken(rt, "report", "hunter2", "marcel")).toEqual({ ok: false, error: "that does not look like a GitHub token" });
  expect(setGitHubToken(rt, "nope", TOKEN, "marcel").ok).toBe(false);
  rt.secret = "another-secret-".padEnd(32, "y");
  expect(gitHubToken(rt, "report")!.readable).toBe(false);
  rt.secret = SECRET;
  expect(setGitHubToken(rt, "report", "", "marcel")).toEqual({ ok: true });
  expect(gitHubToken(rt, "report")).toBeNull();
  const noSecret = testRuntime({ secret: null });
  expect(setGitHubToken(noSecret, "report", TOKEN, "marcel").ok).toBe(false);
});
