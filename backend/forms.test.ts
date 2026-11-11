import { readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "vitest";
import { Store } from "./db";
import { Forms } from "./forms";
import { notify } from "./notify";

const FILE = {
  boxes: ["empty"],
  forms: {
    report: {
      box: "notes",
      kind: "report",
      fields: { text: { type: "textarea", required: true } },
      notify: [{ type: "ntfy", url: "https://ntfy.sh/${TOPIC}" }],
    },
  },
};

const quiet = () => {};

/** A store on the test's own temporary database (vitest.setup.ts), so reopening it is a restart. */
function open(): Store {
  return new Store(process.env.NOTICEBOX_DB!);
}

function stored(store: Store, name: string): { box: string; definition: string } | undefined {
  return store.db.prepare("select box, definition from forms where name = ?").get(name) as { box: string; definition: string } | undefined;
}

test("boxes and forms are created, changed and removed in the database, which keeps their ${VAR} references", () => {
  let store = open();
  const forms = new Forms(store, { TOPIC: "secret-topic" }, quiet);
  expect(forms.config).toEqual({ boxes: [], forms: {} }); // a fresh instance starts without forms
  expect(forms.replace(FILE)).toEqual({ ok: true });
  expect(forms.config.boxes).toEqual(["empty", "notes"]);
  expect(forms.config.forms.report!.notify[0]!.url).toBe("https://ntfy.sh/secret-topic");

  expect(forms.createBox("site")).toEqual({ ok: true });
  expect(forms.createBox("notes")).toEqual({ ok: false, error: 'there is already a box called "notes"' });
  expect(forms.createForm("contact", "site", "message", "Contact")).toEqual({ ok: true });
  expect(forms.config.forms.contact!.fields).toEqual({}); // the fields come with the first submission
  expect(forms.config.boxes).toEqual(["empty", "notes", "site"]);
  expect(forms.createForm("Bad Name", "site", "message", "")).toMatchObject({ ok: false });

  expect(forms.updateForm("contact", { ...forms.rawForm("contact")!, title: "Write to us", retentionDays: 0 })).toEqual({
    ok: false,
    error: "form contact.retentionDays: a whole number of days, at least 1",
  });
  expect(forms.config.forms.contact!.title).toBe("Contact"); // untouched after a refused edit
  expect(JSON.parse(stored(store, "contact")!.definition).title).toBe("Contact");
  expect(
    forms.updateForm("contact", { ...forms.rawForm("contact")!, title: "Write to us", notify: [{ type: "webhook", url: "https://hooks.test/x" }] }),
  ).toEqual({ ok: true });
  expect(forms.config.forms.contact!.notify).toEqual([{ type: "webhook", url: "https://hooks.test/x" }]);

  expect(forms.renameBox("site", "notes")).toMatchObject({ ok: false });
  expect(forms.renameBox("site", "example.org")).toEqual({ ok: true });
  expect(forms.config.forms.contact!.box).toBe("example.org");
  expect(stored(store, "contact")!.box).toBe("example.org");
  expect(forms.deleteBox("example.org")).toMatchObject({ ok: false });
  expect(forms.deleteForm("contact", true)).toMatchObject({ ok: false });
  expect(forms.deleteForm("contact", false)).toEqual({ ok: true });
  expect(stored(store, "contact")).toBeUndefined();
  expect(forms.config.boxes).toContain("example.org"); // an emptied box stays until deleted
  expect(forms.deleteBox("example.org")).toEqual({ ok: true });

  expect(stored(store, "report")!.definition).toContain("https://ntfy.sh/${TOPIC}"); // never the expanded secret
  store.close();
  store = open();
  const again = new Forms(store, { TOPIC: "x" }, quiet);
  expect(again.config.boxes).toEqual(["empty", "notes"]);
  expect(again.config.forms.report!.notify[0]!.url).toBe("https://ntfy.sh/x");
  expect(again.rawForm("report")).toEqual(FILE.forms.report);
  store.close();
});

test("a variable the environment lacks is refused on save, logged at start and when a notification needs it", async () => {
  let store = open();
  const forms = new Forms(store, { TOPIC: "t" }, quiet);
  expect(forms.putForm("x", { kind: "report", notify: [{ type: "ntfy", url: "https://ntfy.sh/${NOT_SET}" }] })).toEqual({
    ok: false,
    error: "${NOT_SET} is not set in the environment",
  });
  expect(forms.replace(FILE)).toEqual({ ok: true });
  expect(forms.createForm("other", "notes", "message", "")).toEqual({ ok: true });
  store.close();

  // Restarted without TOPIC: the forms load, other forms can still be changed, and the notification is skipped.
  store = open();
  const lines: string[] = [];
  const later = new Forms(store, {}, (l) => lines.push(l));
  expect(lines).toEqual(["forms: ${TOPIC} is not set in the environment; what needs it is skipped"]);
  expect(later.config.forms.report!.notify[0]!.unset).toBe("TOPIC");
  expect(later.updateForm("other", { ...later.rawForm("other")!, title: "Other" })).toEqual({ ok: true });
  const hits: string[] = [];
  const fetchFn = (async (url: string) => (hits.push(url), new Response("ok"))) as unknown as typeof fetch;
  const s = { id: "s1", received_at: "2026-01-01T00:00:00.000Z" } as Parameters<typeof notify>[1];
  await notify(later.config.forms.report!, s, "https://inbox.test", fetchFn, (l) => lines.push(l));
  expect(hits).toEqual([]);
  expect(lines.at(-1)).toBe("notify report s1 ntfy: ${TOPIC} is not set in the environment");
  store.close();
});

test("the forms file of an older release is imported once, with its ${VAR} references, and not read after that", () => {
  const path = process.env.NOTICEBOX_CONFIG!;
  writeFileSync(path, JSON.stringify(FILE));
  let store = open();
  const lines: string[] = [];
  const forms = new Forms(store, {}, (l) => lines.push(l));
  forms.importFile(path, new Date("2026-11-11T10:00:00Z"));
  expect(forms.config.boxes).toEqual(["empty", "notes"]);
  expect(forms.rawForm("report")).toEqual(FILE.forms.report);
  expect(lines.at(-1)).toBe(`forms: imported 1 form from ${path} into the database; the file is no longer read and can be removed`);
  expect(store.setting("forms_file_imported_at")).toBe("2026-11-11T10:00:00.000Z");
  store.close();

  // The file changes, the forms are all deleted in the inbox, and the instance restarts: nothing comes back.
  writeFileSync(path, JSON.stringify({ forms: { changed: { kind: "message" } } }));
  store = open();
  const after = new Forms(store, { TOPIC: "t" }, (l) => lines.push(l));
  expect(after.deleteForm("report", false)).toEqual({ ok: true });
  expect(after.deleteBox("notes")).toEqual({ ok: true });
  expect(after.deleteBox("empty")).toEqual({ ok: true });
  after.importFile(path);
  expect(after.config).toEqual({ boxes: [], forms: {} });
  expect(lines.at(-1)).toBe(`forms: ${path} was imported on 2026-11-11 and is no longer read; remove it and NOTICEBOX_CONFIG`);
  expect(JSON.parse(readFileSync(path, "utf8")).forms.changed).toBeDefined(); // the file itself is left alone
  store.close();
});

test("a database that already has forms ignores the file and says so; an invalid file stops the start", () => {
  const path = process.env.NOTICEBOX_CONFIG!;
  writeFileSync(path, JSON.stringify(FILE));
  const store = open();
  const lines: string[] = [];
  const forms = new Forms(store, {}, (l) => lines.push(l));
  expect(forms.createForm("contact", "site", "message", "")).toEqual({ ok: true });
  forms.importFile(path);
  expect(Object.keys(forms.config.forms)).toEqual(["contact"]);
  expect(lines.at(-1)).toBe(`forms: the database already has boxes and forms, so ${path} is ignored; remove it and NOTICEBOX_CONFIG`);
  store.close();

  const fresh = new Store(":memory:");
  writeFileSync(path, JSON.stringify({ forms: { x: { kind: "poll" } } }));
  expect(() => new Forms(fresh, {}, quiet).importFile(path)).toThrow(`${path}: form x: kind must be "report" or "message"`);
  writeFileSync(path, "{ not json");
  expect(() => new Forms(fresh, {}, quiet).importFile(path)).toThrow(path);
  expect(fresh.setting("forms_file_imported_at")).toBeUndefined();
});

test("an instance upgraded with a forms file starts with the same forms, and its submissions stay attached", async () => {
  const { runtime } = await import("./runtime");
  writeFileSync(process.env.NOTICEBOX_CONFIG!, JSON.stringify(FILE));
  const old = open(); // a 0.15 database: submissions, no forms yet
  old.db.exec("drop table settings; drop table forms; drop table boxes; pragma user_version = 1");
  old.db
    .prepare("insert into submissions (id, form, kind, state, fields, received_at) values ('s1', 'report', 'report', 'new', '{}', '2026-11-01T00:00:00Z')")
    .run();
  old.close();
  process.env.TOPIC = "t";
  try {
    const rt = runtime();
    expect(rt.config.boxes).toEqual(["empty", "notes"]);
    expect(rt.forms.rawForm("report")).toEqual(FILE.forms.report);
    expect(rt.store.list({ form: "report" }).map((s) => s.id)).toEqual(["s1"]);
  } finally {
    delete process.env.TOPIC;
  }
});
