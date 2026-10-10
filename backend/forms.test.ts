import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { Forms } from "./forms";

const FILE = { boxes: ["empty"], forms: { report: { box: "notes", kind: "report", fields: { text: { type: "textarea", required: true } }, notify: [{ type: "ntfy", url: "https://ntfy.sh/${TOPIC}" }] } } };

function fresh(): { path: string; forms: Forms } {
  const path = join(tmpdir(), `noticebox-forms-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(path, JSON.stringify(FILE));
  return { path, forms: new Forms(path, { TOPIC: "secret-topic" }) };
}

test("boxes and forms are created, changed and removed through the file, which keeps its ${VAR} references", () => {
  const { path, forms } = fresh();
  expect(forms.config.boxes).toEqual(["empty", "notes"]);
  expect(forms.config.forms.report!.notify[0]!.url).toBe("https://ntfy.sh/secret-topic");

  expect(forms.createBox("site")).toEqual({ ok: true });
  expect(forms.createBox("notes")).toEqual({ ok: false, error: 'there is already a box called "notes"' });
  expect(forms.createForm("contact", "site", "message", "Contact")).toEqual({ ok: true });
  expect(forms.config.forms.contact!.fields).toEqual({}); // the fields come with the first submission
  expect(forms.config.boxes).toEqual(["empty", "notes", "site"]);
  expect(forms.createForm("Bad Name", "site", "message", "")).toMatchObject({ ok: false });

  expect(forms.updateForm("contact", { ...forms.rawForm("contact")!, title: "Write to us", retentionDays: 0 })).toEqual({ ok: false, error: "form contact.retentionDays: a whole number of days, at least 1" });
  expect(forms.config.forms.contact!.title).toBe("Contact"); // untouched after a refused edit
  expect(forms.updateForm("contact", { ...forms.rawForm("contact")!, title: "Write to us", notify: [{ type: "webhook", url: "https://hooks.test/x" }] })).toEqual({ ok: true });
  expect(forms.config.forms.contact!.notify).toEqual([{ type: "webhook", url: "https://hooks.test/x" }]);

  expect(forms.renameBox("site", "notes")).toMatchObject({ ok: false });
  expect(forms.renameBox("site", "example.org")).toEqual({ ok: true });
  expect(forms.config.forms.contact!.box).toBe("example.org");
  expect(forms.deleteBox("example.org")).toMatchObject({ ok: false });
  expect(forms.deleteForm("contact", true)).toMatchObject({ ok: false });
  expect(forms.deleteForm("contact", false)).toEqual({ ok: true });
  expect(forms.config.boxes).toContain("example.org"); // an emptied box stays until deleted
  expect(forms.deleteBox("example.org")).toEqual({ ok: true });

  const written = JSON.parse(readFileSync(path, "utf8")) as typeof FILE;
  expect(written.forms.report.notify[0]!.url).toBe("https://ntfy.sh/${TOPIC}"); // never the expanded secret
  expect(written.boxes).toEqual(["empty"]); // only the box no form names
  expect(new Forms(path, { TOPIC: "x" }).config.boxes).toEqual(["empty", "notes"]);
});
