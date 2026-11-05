// Issues as links: the new-issue page of the form's repository, filled in with everything the person sent except their
// email, cut to fit a URL GitHub takes.
import { expect, test } from "vitest";
import { parseConfig } from "./config";
import { issueDraft, issueUrl } from "./github";
import { BASE, REPORT, testConfig, testRuntime } from "./testutil";

function setup(fields: Record<string, string> = REPORT) {
  const c = testConfig();
  c.forms.report!.github = { repo: "acme/site", labels: ["report", "triage"] };
  const rt = testRuntime({ config: c });
  const form = rt.config.forms.report!;
  return { form, s: rt.store.receive(form, fields, null, new Date("2026-11-01T10:00:00Z")) };
}

test("github is a repository, as a string or with labels", () => {
  const form = (github: unknown) => parseConfig({ forms: { r: { kind: "report", github } } }).forms.r!.github;
  expect(form(undefined)).toBeNull();
  expect(form("acme/site")).toEqual({ repo: "acme/site", labels: [] });
  expect(form({ repo: "acme/site.io", labels: ["report", " "] })).toEqual({ repo: "acme/site.io", labels: ["report"] });
  expect(() => form("acme")).toThrow(/owner\/name/);
});

test("the draft has every field the person sent but the email, the link and where it is in the inbox", () => {
  const { form, s } = setup();
  const d = issueDraft(form, s, BASE);
  expect(d.body).toContain("**Reason:** Spam");
  expect(d.body).toContain("**What is wrong**\n\n> This is spam.\n> Second line.");
  expect(d.body).toContain("**Open the note:** https://notes.test/r/r1/n1");
  expect(d.body).toContain(`${BASE}/forms/report/submissions/${s.id}`);
  expect(d.body).not.toContain("who@example.org");
  expect(d.title).toBe("This is spam. Second line.");
});

test("an undescribed field holding an email address is left out too; a title field becomes the title", () => {
  const c = parseConfig({ forms: { g: { kind: "message", github: "acme/game", fields: { title: { label: "Title" }, text: { type: "textarea" } } } } });
  const rt = testRuntime({ config: c });
  const s = rt.store.receive(rt.config.forms.g!, { title: "Crash on start", text: "It crashes.", contact: "me@example.org", platform: "Linux" }, null, new Date());
  const d = issueDraft(rt.config.forms.g!, s, BASE);
  expect(d.title).toBe("Crash on start");
  expect(d.body).toContain("**platform:** Linux");
  expect(d.body).not.toContain("me@example.org");
});

test("the link is the repository's new-issue page with title, body and labels; none without a repository", () => {
  const { form, s } = setup();
  const u = new URL(issueUrl(form, s, BASE)!);
  expect(u.origin + u.pathname).toBe("https://github.com/acme/site/issues/new");
  expect(u.searchParams.get("title")).toBe("This is spam. Second line.");
  expect(u.searchParams.get("body")).toContain("**Reason:** Spam");
  expect(u.searchParams.get("labels")).toBe("report,triage");
  expect(issueUrl({ ...form, github: null }, s, BASE)).toBeNull();
});

test("a long submission is cut to fit the link, and says so", () => {
  const { form, s } = setup({ ...REPORT, text: "ä long line ".repeat(800) });
  const url = issueUrl(form, s, BASE)!;
  expect(url.length).toBeLessThanOrEqual(7500);
  expect(new URL(url).searchParams.get("body")).toContain("Cut to fit the link");
});
