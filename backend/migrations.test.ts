// The migrations: a new database, one made before migrations existed, opening twice, a failure, and a newer database.
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, expect, test } from "vitest";
import { Store } from "./db";
import { MIGRATIONS, migrate, type Migration } from "./migrations";
import { REPORT, testConfig } from "./testutil";

const dirs: string[] = [];
function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "noticebox-migrations-"));
  dirs.push(dir);
  return join(dir, "noticebox.sqlite");
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const version = (path: string) => {
  const db = new Database(path);
  const v = (db.prepare("pragma user_version").get() as { user_version: number }).user_version;
  const tables = (db.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name").all() as { name: string }[]).map((t) => t.name);
  db.close();
  return { v, tables };
};

test("a fresh database ends at the latest version with the expected tables", () => {
  const path = tempFile();
  new Store(path).close();
  expect(version(path)).toEqual({ v: MIGRATIONS.length, tables: ["events", "grants", "submissions"] });
});

test("a database made by 0.10.0, before migrations, opens at the latest version and keeps its data", () => {
  const path = tempFile();
  // What 0.9.0 left: its tables, written out here as that release created them (not taken from migration 1, which is
  // what is being tested), with no version recorded, and the table 0.10.0 dropped.
  const old = new Database(path);
  old.exec(`
    create table submissions (id text primary key, form text not null, kind text not null, state text not null, fields text not null,
      received_at text not null, closed_at text, purged_at text, origin text);
    create index submissions_by_form on submissions (form, state, received_at);
    create index submissions_by_time on submissions (received_at);
    create table events (id integer primary key autoincrement, submission_id text not null references submissions (id), at text not null,
      actor text not null, from_state text, to_state text, reason text not null default '');
    create index events_by_submission on events (submission_id, id);
    create table grants (id text primary key, actor text not null, client_hash text not null, client_name text not null,
      created_at text not null, last_used_at text not null, revoked_at text);
    create index grants_by_actor on grants (actor, created_at);
    create table form_tokens (form text primary key, token text);
  `);
  old.exec(`insert into submissions (id, form, kind, state, fields, received_at) values ('s1', 'report', 'report', 'open', '${JSON.stringify(REPORT)}', '2026-01-01T00:00:00.000Z')`);
  old.exec("insert into events (submission_id, at, actor, from_state, to_state) values ('s1', '2026-01-01T00:00:00.000Z', 'form', null, 'open')");
  old.close();

  const store = new Store(path);
  expect(store.get("s1")?.fields).toEqual(REPORT);
  expect(store.events("s1")).toHaveLength(1);
  store.close();
  expect(version(path)).toEqual({ v: MIGRATIONS.length, tables: ["events", "grants", "submissions"] });
});

test("a database written by 0.11.1 (node:sqlite) opens and keeps its data", () => {
  const path = tempFile();
  copyFileSync(new URL("./fixtures/0.11.1.sqlite", import.meta.url), path);
  const store = new Store(path);
  expect(store.list().map((s) => [s.form, s.state]).sort()).toEqual([
    ["contact", "new"],
    ["report", "rejected"],
  ]);
  const report = store.list({ form: "report" })[0]!;
  expect(report.fields).toEqual(REPORT);
  expect(store.events(report.id).map((e) => [e.actor, e.from_state, e.to_state, e.reason])).toEqual([
    ["form", null, "open", ""],
    ["marcel", "open", "rejected", "Not spam."],
    ["marcel via Claude", "rejected", null, "Checked."],
  ]);
  expect(store.grants("marcel").map((g) => g.client_name)).toEqual(["Claude"]);
  store.close();
  expect(version(path).v).toBe(MIGRATIONS.length);
});

test("opening twice applies nothing the second time", () => {
  const path = tempFile();
  const store = new Store(path);
  store.receive(testConfig().forms.report!, REPORT, null, new Date());
  store.close();
  const db = new Database(path);
  expect(migrate(db)).toBe(0);
  expect(migrate(db, [...MIGRATIONS, { name: "later", sql: "create table later (x)" }])).toBe(1);
  expect(migrate(db, [...MIGRATIONS, { name: "later", sql: "create table later (x)" }])).toBe(0);
  db.close();
});

test("a failing migration rolls back and the store refuses to open", () => {
  const db = new Database(":memory:");
  migrate(db);
  const broken: Migration[] = [...MIGRATIONS, { name: "half done", sql: "create table half (x); insert into nowhere values (1);" }];
  expect(() => migrate(db, broken)).toThrow(/migration 2 \(half done\).*nowhere/);
  expect(db.prepare("select name from sqlite_master where name = 'half'").get()).toBeUndefined();
  expect((db.prepare("pragma user_version").get() as { user_version: number }).user_version).toBe(MIGRATIONS.length);
  db.close();
});

test("a database from a newer release is refused, and the store does not open", () => {
  const path = tempFile();
  const db = new Database(path);
  db.exec(`pragma user_version = ${MIGRATIONS.length + 1}`);
  expect(() => migrate(db)).toThrow(/newer/);
  db.close();
  expect(() => new Store(path)).toThrow(/newer than this release knows/);
});
