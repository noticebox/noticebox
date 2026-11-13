import { writeFileSync } from "node:fs";
import { expect, test } from "vitest";
import { expand, FORM_NAME, loadConfig, parseConfig } from "./config";
import { Store } from "./db";
import { Forms } from "./forms";

test("defaults fill in what the file leaves out", () => {
  const c = parseConfig({
    forms: {
      contact: {
        kind: "message",
        fields: { email: { type: "email" }, message: { type: "textarea", required: true }, topic: { type: "select", options: ["a"] } },
      },
    },
  });
  const f = c.forms.contact!;
  expect(f.title).toBe("contact");
  expect(f.box).toBe("forms");
  expect(f.strict).toBe(false);
  expect(f.states).toEqual([
    { name: "new", closed: false, reason: false },
    { name: "answered", closed: true, reason: false },
  ]);
  const own = parseConfig({
    forms: { x: { kind: "report", strict: true, states: ["open", { name: "lawyer" }, { name: "done", closed: true, reason: true }] } },
  }).forms.x!;
  expect(own.strict).toBe(true);
  expect(own.states.map((s) => [s.name, s.closed, s.reason])).toEqual([
    ["open", false, false],
    ["lawyer", false, false],
    ["done", true, true],
  ]);
  expect(own.fields).toEqual({});
  expect(f.link).toBeNull();
  expect(f.retentionDays).toBe(180);
  expect(f.deleteAfterDays).toBeNull();
  expect(parseConfig({ forms: { x: { kind: "report", retentionDays: 90, deleteAfterDays: 90 } } }).forms.x!.deleteAfterDays).toBe(90);
  expect(f.origins).toEqual([]);
  expect(f.redirect).toBeNull();
  expect(f.notify).toEqual([]);
  expect(c.boxes).toEqual(["forms"]);
  expect(f.fields.email).toEqual({ type: "email", label: "email", required: false, max: 254, options: [], personal: true, help: "", files: null });
  expect(f.fields.message!.max).toBe(10000);
  expect(f.fields.topic!.personal).toBe(false);
});

test("mistakes are named with their place, and a form saved to the database is refused for the same ones", () => {
  const forms = new Forms(new Store(":memory:"), {}, () => {});
  const bad = (raw: unknown, re: RegExp) => {
    expect(() => parseConfig(raw)).toThrow(re);
    const entries = (raw as { forms: unknown }).forms;
    if (Array.isArray(entries)) return; // not a set of forms at all, which saving one form cannot express
    for (const [name, f] of Object.entries(entries as Record<string, Record<string, unknown>>)) {
      const r = forms.putForm(name, f);
      expect(r.ok).toBe(false);
      // A bad name is refused before parsing, in the words the inbox and MCP have always used for it.
      if (!r.ok) expect(r.error).toMatch(FORM_NAME.test(name) ? re : /a form name is lowercase letters/);
    }
    expect(forms.config.forms).toEqual({});
  };
  bad({ forms: [] }, /forms: must be an object/);
  bad({ forms: { "Bad Name": { kind: "report", fields: { a: {} } } } }, /form name "Bad Name"/);
  bad({ forms: { "-x": { kind: "report", fields: { a: {} } } } }, /form name "-x"/);
  bad({ forms: { x: { kind: "poll", fields: { a: {} } } } }, /kind must be "report" or "message"/);
  bad({ forms: { x: { kind: "report", states: [] } } }, /states: a list of at least one state/);
  bad({ forms: { x: { kind: "report", states: ["open", "open"] } } }, /listed twice/);
  bad({ forms: { x: { kind: "report", states: [{ name: "Open" }] } } }, /states\[0\].name/);
  bad({ forms: { x: { kind: "report", fields: { _gotcha: {} } } } }, /field name "_gotcha"/);
  bad({ forms: { x: { kind: "report", fields: { a: { type: "select" } } } } }, /a select needs options/);
  bad({ forms: { x: { kind: "report", fields: { a: { type: "text", options: ["x"] } } } } }, /only a select has options/);
  bad({ forms: { x: { kind: "report", fields: { a: { type: "date" } } } } }, /fields.a.type: one of/);
  bad({ forms: { x: { kind: "report", fields: { a: {} }, origins: ["example.org"] } } }, /origins: "example.org" is not a URL/);
  bad({ forms: { x: { kind: "report", fields: { a: {} }, origins: ["https://example.org/path"] } } }, /must be an origin/);
  bad({ forms: { x: { kind: "report", fields: { a: {} }, retentionDays: 0 } } }, /retentionDays/);
  bad({ forms: { x: { kind: "report", deleteAfterDays: 1.5 } } }, /deleteAfterDays: a whole number of days, at least retentionDays \(180\)/);
  bad({ forms: { x: { kind: "report", deleteAfterDays: 0 } } }, /deleteAfterDays: a whole number/);
  bad({ forms: { x: { kind: "report", retentionDays: 90, deleteAfterDays: 30 } } }, /x.deleteAfterDays: a whole number of days, at least retentionDays \(90\)/);
  bad({ forms: { x: { kind: "report", fields: { a: {} }, notify: { ntfy: "ntfy.sh/topic" } } } }, /notify.ntfy/);
  bad({ forms: { x: { kind: "report", fields: { a: {} }, redirect: "ftp://x" } } }, /redirect: must be http/);
});

test("origins lose a trailing slash and the file may take values from the environment", () => {
  const c = parseConfig({ forms: { x: { kind: "report", fields: { a: {} }, origins: ["https://example.org/"] } } });
  expect(c.forms.x!.origins).toEqual(["https://example.org"]);
  expect(expand('{"a": "${TOPIC}"}', { TOPIC: 'quo"te' })).toBe('{"a": "quo\\"te"}');
  expect(() => expand("${MISSING}", {})).toThrow(/\$\{MISSING\} is not set/);
  const path = process.env.NOTICEBOX_CONFIG!; // the test's own temporary directory (vitest.setup.ts)
  writeFileSync(path, JSON.stringify({ forms: { x: { kind: "report", fields: { a: {} }, notify: { ntfy: "https://ntfy.sh/${TOPIC}" } } } }));
  expect(loadConfig(path, { TOPIC: "t1" }).forms.x!.notify).toEqual([{ type: "ntfy", url: "https://ntfy.sh/t1" }]);
  expect(() => loadConfig("/nonexistent.json")).toThrow(/cannot read/);
});

test("a form's link is a URL template over its own fields", () => {
  const base = { kind: "report", fields: { read_id: { type: "hidden" }, note_id: { type: "hidden" }, text: { type: "textarea" } } };
  const plain = parseConfig({ forms: { r: { ...base, link: "https://notes.test/r/{read_id}/{note_id}" } } }).forms.r!.link;
  expect(plain).toEqual({ url: "https://notes.test/r/{read_id}/{note_id}", label: "Open" });
  const labelled = parseConfig({ forms: { r: { ...base, link: { url: "https://notes.test/r/{read_id}", label: "Open the note" } } } }).forms.r!.link;
  expect(labelled?.label).toBe("Open the note");
  expect(() => parseConfig({ forms: { r: { ...base, link: "https://notes.test/r/{feed}" } } })).toThrow("{feed} is not a field");
  expect(() => parseConfig({ forms: { r: { ...base, link: "notes/{read_id}" } } })).toThrow("not a URL");
  expect(() => parseConfig({ forms: { r: { ...base, link: "ftp://notes.test/{read_id}" } } })).toThrow("http(s)");
});

test("a form name may start with a digit, like a domain", () => {
  expect(Object.keys(parseConfig({ forms: { "3dbruckner-order": { kind: "message", fields: { a: {} } } } }).forms)).toEqual(["3dbruckner-order"]);
});
