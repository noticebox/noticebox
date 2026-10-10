import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { expand, loadConfig, parseConfig } from "./config";

test("defaults fill in what the file leaves out", () => {
  const c = parseConfig({ forms: { contact: { kind: "message", fields: { email: { type: "email" }, message: { type: "textarea", required: true }, topic: { type: "select", options: ["a"] } } } } });
  const f = c.forms.contact!;
  expect(f.title).toBe("contact");
  expect(f.box).toBe("forms");
  expect(f.link).toBeNull();
  expect(f.retentionDays).toBe(180);
  expect(f.origins).toEqual([]);
  expect(f.redirect).toBeNull();
  expect(f.notify).toEqual([]);
  expect(c.boxes).toEqual(["forms"]);
  expect(f.fields.email).toEqual({ type: "email", label: "email", required: false, max: 254, options: [], personal: true, help: "" });
  expect(f.fields.message!.max).toBe(10000);
  expect(f.fields.topic!.personal).toBe(false);
});

test("mistakes are named with their place", () => {
  const bad = (raw: unknown, re: RegExp) => expect(() => parseConfig(raw)).toThrow(re);
  bad({ forms: [] }, /forms: must be an object/);
  bad({ forms: { "Bad Name": { kind: "report", fields: { a: {} } } } }, /form name "Bad Name"/);
  bad({ forms: { x: { kind: "poll", fields: { a: {} } } } }, /kind must be "report" or "message"/);
  bad({ forms: { x: { kind: "report", fields: {} } } }, /form x: no fields/);
  bad({ forms: { x: { kind: "report", fields: { _gotcha: {} } } } }, /field name "_gotcha"/);
  bad({ forms: { x: { kind: "report", fields: { a: { type: "select" } } } } }, /a select needs options/);
  bad({ forms: { x: { kind: "report", fields: { a: { type: "text", options: ["x"] } } } } }, /only a select has options/);
  bad({ forms: { x: { kind: "report", fields: { a: { type: "date" } } } } }, /fields.a.type: one of/);
  bad({ forms: { x: { kind: "report", fields: { a: {} }, origins: ["example.org"] } } }, /origins: "example.org" is not a URL/);
  bad({ forms: { x: { kind: "report", fields: { a: {} }, origins: ["https://example.org/path"] } } }, /must be an origin/);
  bad({ forms: { x: { kind: "report", fields: { a: {} }, retentionDays: 0 } } }, /retentionDays/);
  bad({ forms: { x: { kind: "report", fields: { a: {} }, notify: { ntfy: "ntfy.sh/topic" } } } }, /notify.ntfy/);
  bad({ forms: { x: { kind: "report", fields: { a: {} }, redirect: "ftp://x" } } }, /redirect: must be http/);
});

test("origins lose a trailing slash and the file may take values from the environment", () => {
  const c = parseConfig({ forms: { x: { kind: "report", fields: { a: {} }, origins: ["https://example.org/"] } } });
  expect(c.forms.x!.origins).toEqual(["https://example.org"]);
  expect(expand('{"a": "${TOPIC}"}', { TOPIC: 'quo"te' })).toBe('{"a": "quo\\"te"}');
  expect(() => expand("${MISSING}", {})).toThrow(/\$\{MISSING\} is not set/);
  const path = join(tmpdir(), `noticebox-${process.pid}.json`);
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
