// The store: one SQLite file with the boxes and forms, the submissions and their append-only events. Nothing is ever updated in `events`; a
// submission's state is the result of its events and is kept on the row only to list and filter quickly. The schema
// is the migrations' (migrations.ts), applied when the store opens.
// Queries are built with kysely, typed by the tables below, and run synchronously on better-sqlite3: kysely only
// compiles them, so the store keeps its synchronous interface and a transaction is one plain function call.
import { randomBytes } from "node:crypto";
import { closeSync, openSync, readSync } from "node:fs";
import BetterSqlite3 from "better-sqlite3";
import { DummyDriver, Kysely, sql, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler, type Compilable, type Generated } from "kysely";
import type { Config, Form } from "./config";
import { stateOf, type KindName } from "./kinds";
import { migrate } from "./migrations";

export type Submission = {
  id: string;
  form: string;
  kind: KindName;
  state: string;
  fields: Record<string, string>;
  received_at: string;
  closed_at: string | null;
  purged_at: string | null;
  origin: string | null;
};

export type Event = {
  id: number;
  submission_id: string;
  at: string;
  actor: string;
  from_state: string | null;
  to_state: string | null; // null for a note that changes nothing
  reason: string;
};

/** A file that came with a submission, without its bytes. */
export type StoredFile = { id: string; submission_id: string; field: string; name: string; type: string; size: number };

/** A file as it arrives, checked, before it has an id: its bytes, or the temporary file that holds them (multipart.ts). */
export type Upload = { field: string; name: string; type: string } & ({ data: Uint8Array } | { path: string; size: number });

/** How large the chunks of a file are in the database. */
export const CHUNK_BYTES = 1024 * 1024;

/** A file's bytes in chunks, read from memory or from its temporary file one chunk at a time. */
function* chunksOf(f: Upload): Generator<Uint8Array> {
  if ("data" in f) {
    for (let at = 0; at < f.data.byteLength; at += CHUNK_BYTES) yield f.data.subarray(at, at + CHUNK_BYTES);
    return;
  }
  const fd = openSync(f.path, "r");
  try {
    for (;;) {
      const buf = Buffer.allocUnsafe(CHUNK_BYTES);
      const n = readSync(fd, buf, 0, CHUNK_BYTES, null);
      if (n === 0) return;
      yield buf.subarray(0, n);
    }
  } finally {
    closeSync(fd);
  }
}

export type ListFilter = { form?: string; state?: string; open?: boolean; limit?: number };
export type Outcome = { ok: true } | { ok: false; error: string };

/** The tables as the migrations leave them. */
export type Tables = {
  submissions: {
    id: string;
    form: string;
    kind: string;
    state: string;
    fields: string;
    received_at: string;
    closed_at: string | null;
    purged_at: string | null;
    origin: string | null;
  };
  events: { id: Generated<number>; submission_id: string; at: string; actor: string; from_state: string | null; to_state: string | null; reason: string };
  boxes: { name: string; position: number };
  forms: { name: string; box: string; definition: string; position: number };
  settings: { key: string; value: string };
  files: { id: string; submission_id: string; field: string; name: string; type: string; size: number };
  file_chunks: { file_id: string; seq: number; data: Uint8Array };
};

/** The boxes and forms as stored: each form as written, `${VAR}` references and all, in the order they were made. */
export type StoredForms = { boxes: string[]; forms: Record<string, Record<string, unknown>> };

type Row = Tables["submissions"];

const DAY = 86400000;

/** What `Store.figures` returns; see there. */
export type Figures = {
  open: number;
  openByState: { state: string; n: number }[];
  oldestOpen: { id: string; received_at: string } | null;
  days: number;
  closed: number;
  closedByState: { state: string; n: number }[];
  nextErase: { day: string; n: number } | null;
};

/** Builds queries and compiles them to SQL; it never connects to anything. */
const q = new Kysely<Tables>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

export class Store {
  readonly db: BetterSqlite3.Database;

  constructor(path: string) {
    this.db = new BetterSqlite3(path, { timeout: 5000 });
    try {
      this.db.pragma("journal_mode = wal");
      this.db.pragma("foreign_keys = on");
      migrate(this.db);
    } catch (e) {
      this.db.close();
      throw e;
    }
  }

  private all<O>(query: Compilable<O>): O[] {
    const c = query.compile();
    return this.db.prepare(c.sql).all(...c.parameters) as O[];
  }

  private first<O>(query: Compilable<O>): O | undefined {
    const c = query.compile();
    return this.db.prepare(c.sql).get(...c.parameters) as O | undefined;
  }

  /** Runs a write and returns how many rows it changed. */
  private run(query: Compilable<unknown>): number {
    const c = query.compile();
    return this.db.prepare(c.sql).run(...c.parameters).changes;
  }

  /** Throws unless the database can be read and written (a write lock is taken and released, nothing is stored). */
  ping(): void {
    this.first(q.selectFrom("submissions").select(sql.lit(1).as("one")).limit(1)); // a constant, not a column: kysely's literal
    this.db.exec("begin immediate; rollback"); // taking the write lock is not a query kysely builds
  }

  /** Stores a new submission in its kind's first state, with the `received` event and the files that came with it. */
  receive(form: Form, fields: Record<string, string>, origin: string | null, now: Date, files: Upload[] = []): Submission {
    const id = newId();
    const at = now.toISOString();
    const state = form.states[0]!.name;
    this.db.transaction(() => {
      this.run(q.insertInto("submissions").values({ id, form: form.name, kind: form.kind, state, fields: JSON.stringify(fields), received_at: at, origin }));
      this.run(q.insertInto("events").values({ submission_id: id, at, actor: "form", from_state: null, to_state: state, reason: "" }));
      for (const f of files) {
        const fileId = newId();
        const size = "data" in f ? f.data.byteLength : f.size;
        this.run(q.insertInto("files").values({ id: fileId, submission_id: id, field: f.field, name: f.name, type: f.type, size }));
        let seq = 0;
        for (const data of chunksOf(f)) this.run(q.insertInto("file_chunks").values({ file_id: fileId, seq: seq++, data }));
      }
    })();
    return { id, form: form.name, kind: form.kind, state, fields, received_at: at, closed_at: null, purged_at: null, origin };
  }

  get(id: string): Submission | undefined {
    const row = this.first(q.selectFrom("submissions").selectAll().where("id", "=", id));
    return row ? toSubmission(row) : undefined;
  }

  list(filter: ListFilter = {}): Submission[] {
    let query = q.selectFrom("submissions").selectAll();
    if (filter.form) query = query.where("form", "=", filter.form);
    if (filter.state) query = query.where("state", "=", filter.state);
    if (filter.open === true) query = query.where("closed_at", "is", null);
    if (filter.open === false) query = query.where("closed_at", "is not", null);
    query = query
      .orderBy("received_at", "desc")
      .orderBy("id")
      .limit(Math.min(filter.limit ?? 200, 1000));
    return this.all(query).map(toSubmission);
  }

  /** The files of a submission, without their bytes, in the order they came. */
  files(submissionId: string): StoredFile[] {
    return this.all(
      q
        .selectFrom("files")
        .select(["id", "submission_id", "field", "name", "type", "size"])
        .where("submission_id", "=", submissionId)
        .orderBy(sql`rowid`),
    );
  }

  /** One file, without its bytes. */
  file(id: string): StoredFile | undefined {
    return this.first(q.selectFrom("files").selectAll().where("id", "=", id));
  }

  /** The `seq`th chunk of a file's bytes (from 0), or undefined past the last. */
  chunk(id: string, seq: number): Uint8Array | undefined {
    return this.first(q.selectFrom("file_chunks").select("data").where("file_id", "=", id).where("seq", "=", seq))?.data;
  }

  events(id: string): Event[] {
    return this.all(q.selectFrom("events").selectAll().where("submission_id", "=", id).orderBy("id"));
  }

  /** The names of every field that ever arrived for a form, described or not, for the settings page. */
  fieldsSeen(form: string): string[] {
    const each = sql<{ key: string }>`json_each(submissions.fields)`.as("j"); // a table-valued function, written by hand
    return this.all(q.selectFrom(["submissions", each]).select("j.key as name").distinct().where("form", "=", form).orderBy("name")).map((r) => r.name);
  }

  /** Counts per form and state, for the overview. */
  counts(): { form: string; state: string; n: number }[] {
    return this.all(
      q
        .selectFrom("submissions")
        .select(["form", "state", (eb) => eb.fn.countAll<number>().as("n")])
        .groupBy(["form", "state"]),
    );
  }

  /**
   * A form's figures at a glance: what is open (per state), the oldest open submission, what was closed in the last
   * `days` days (per state), and the next day personal fields are removed with how many submissions lose them then.
   * Retention removes them `retentionDays` after closing, at the next sweep, so the day is when they become due.
   */
  figures(form: Pick<Form, "name" | "retentionDays">, now: Date, days = 30): Figures {
    const perState = (closedSince: string | null) => {
      let query = q
        .selectFrom("submissions")
        .select(["state", (eb) => eb.fn.countAll<number>().as("n")])
        .where("form", "=", form.name);
      query = closedSince === null ? query.where("closed_at", "is", null) : query.where("closed_at", ">=", closedSince);
      return this.all(query.groupBy("state").orderBy("state"));
    };
    const open = perState(null);
    const closed = perState(new Date(now.getTime() - days * DAY).toISOString());
    const oldest = this.first(
      q
        .selectFrom("submissions")
        .select(["id", "received_at"])
        .where("form", "=", form.name)
        .where("closed_at", "is", null)
        .orderBy("received_at")
        .orderBy("id")
        .limit(1),
    );
    const due = q.selectFrom("submissions").where("form", "=", form.name).where("closed_at", "is not", null).where("purged_at", "is", null);
    const first = this.first(due.select((eb) => eb.fn.min<string>("closed_at").as("at")))?.at;
    let nextErase: Figures["nextErase"] = null;
    if (first) {
      const day = new Date(first.slice(0, 10) + "T00:00:00.000Z");
      const end = new Date(day.getTime() + DAY).toISOString();
      const n = this.first(due.select((eb) => eb.fn.countAll<number>().as("n")).where("closed_at", "<", end))?.n ?? 0;
      nextErase = { day: new Date(day.getTime() + form.retentionDays * DAY).toISOString().slice(0, 10), n };
    }
    const sum = (rows: { n: number }[]) => rows.reduce((a, r) => a + r.n, 0);
    return { open: sum(open), openByState: open, oldestOpen: oldest ?? null, days, closed: sum(closed), closedByState: closed, nextErase };
  }

  /** How many a form received per day (UTC) since `since`, for the overview's chart; days without any are absent. */
  daily(form: string, since: Date): { day: string; n: number }[] {
    return this.all(
      q
        .selectFrom("submissions")
        // The UTC day is the first ten characters of the ISO time; substr's positions are literals, not parameters.
        .select([(eb) => eb.fn<string>("substr", ["received_at", sql.lit(1), sql.lit(10)]).as("day"), (eb) => eb.fn.countAll<number>().as("n")])
        .where("form", "=", form)
        .where("received_at", ">=", since.toISOString())
        .groupBy("day")
        .orderBy("day"),
    );
  }

  /** Adds a note: an event that changes no state. */
  note(id: string, actor: string, reason: string, now: Date): Outcome {
    const s = this.get(id);
    if (!s) return { ok: false, error: "no such submission" };
    if (!reason.trim()) return { ok: false, error: "a note needs text" };
    this.run(q.insertInto("events").values({ submission_id: id, at: now.toISOString(), actor, from_state: s.state, to_state: null, reason: reason.trim() }));
    return { ok: true };
  }

  /** Moves a submission to another of its form's states, recording who, when and why. */
  transition(form: Form, id: string, actor: string, to: string, reason: string, now: Date): Outcome {
    const s = this.get(id);
    if (!s || s.form !== form.name) return { ok: false, error: "no such submission" };
    const target = stateOf(form.states, to);
    if (!target) return { ok: false, error: `this form has no state "${to}"` };
    if (to === s.state) return { ok: false, error: `already ${to}` };
    const text = reason.trim();
    if (target.reason && !text) return { ok: false, error: `${to} needs a reason` };
    const at = now.toISOString();
    const closed = target.closed ? at : null;
    this.db.transaction(() => {
      this.run(q.updateTable("submissions").set({ state: to, closed_at: closed }).where("id", "=", id));
      this.run(q.insertInto("events").values({ submission_id: id, at, actor, from_state: s.state, to_state: to, reason: text }));
    })();
    return { ok: true };
  }

  /**
   * Retention: a submission closed longer ago than its form's retention loses its personal fields. The ids, the
   * categories, the states and the events stay, so the decision remains on record without the person.
   */
  sweep(config: Config, now: Date): number {
    let purged = 0;
    for (const form of Object.values(config.forms)) {
      const before = new Date(now.getTime() - form.retentionDays * 86400000).toISOString();
      const due = this.all(
        q
          .selectFrom("submissions")
          .select(["id", "fields"])
          .where("form", "=", form.name)
          .where("closed_at", "is not", null)
          .where("closed_at", "<", before)
          .where("purged_at", "is", null),
      );
      for (const row of due) {
        const fields = JSON.parse(row.fields) as Record<string, string>;
        const kept = Object.fromEntries(Object.entries(fields).filter(([name]) => form.fields[name] && !form.fields[name].personal));
        // Files count as personal unless their field says otherwise, like undescribed fields.
        const keptFiles = Object.entries(form.fields)
          .filter(([, f]) => f.type === "file" && !f.personal)
          .map(([name]) => name);
        this.db.transaction(() => {
          this.run(
            q
              .updateTable("submissions")
              .set({ fields: JSON.stringify(kept), purged_at: now.toISOString(), origin: null })
              .where("id", "=", row.id),
          );
          let gone = q.selectFrom("files").select("id").where("submission_id", "=", row.id);
          if (keptFiles.length) gone = gone.where("field", "not in", keptFiles);
          this.run(q.deleteFrom("file_chunks").where("file_id", "in", gone));
          this.run(q.deleteFrom("files").where("id", "in", gone));
        })();
        purged++;
      }
    }
    return purged;
  }

  /**
   * The optional second step: a submission closed longer ago than its form's `deleteAfterDays` is deleted with its
   * events. Forms without it keep the anonymised record. A reopened submission has no `closed_at` and is never due.
   */
  expire(config: Config, now: Date): number {
    let deleted = 0;
    for (const form of Object.values(config.forms)) {
      if (form.deleteAfterDays === null) continue;
      const before = new Date(now.getTime() - form.deleteAfterDays * 86400000).toISOString();
      const due = q.selectFrom("submissions").select("id").where("form", "=", form.name).where("closed_at", "is not", null).where("closed_at", "<", before);
      this.db.transaction(() => {
        this.run(q.deleteFrom("events").where("submission_id", "in", due));
        this.run(q.deleteFrom("file_chunks").where("file_id", "in", q.selectFrom("files").select("id").where("submission_id", "in", due)));
        this.run(q.deleteFrom("files").where("submission_id", "in", due));
        deleted += this.run(q.deleteFrom("submissions").where("id", "in", due));
      })();
    }
    return deleted;
  }

  /** Every box (also those a form names) and every form, each in its stored order. */
  readForms(): StoredForms {
    const boxes = this.all(q.selectFrom("boxes").select("name").orderBy("position")).map((b) => b.name);
    const rows = this.all(q.selectFrom("forms").select(["name", "definition"]).orderBy("position"));
    return { boxes, forms: Object.fromEntries(rows.map((r) => [r.name, JSON.parse(r.definition) as Record<string, unknown>])) };
  }

  /**
   * Replaces the boxes and forms in one transaction. They are a handful of rows, rewritten whole after each change, so
   * the stored order is always the order the forms module has them in. `boxOf` is each form's box after parsing.
   */
  writeForms(stored: StoredForms, boxOf: (form: string) => string): void {
    this.db.transaction(() => {
      this.run(q.deleteFrom("forms"));
      this.run(q.deleteFrom("boxes"));
      stored.boxes.forEach((name, position) => this.run(q.insertInto("boxes").values({ name, position })));
      Object.entries(stored.forms).forEach(([name, f], position) =>
        this.run(q.insertInto("forms").values({ name, box: boxOf(name), definition: JSON.stringify(f), position })),
      );
    })();
  }

  setting(key: string): string | undefined {
    return this.first(q.selectFrom("settings").select("value").where("key", "=", key))?.value;
  }

  setSetting(key: string, value: string): void {
    this.run(
      q
        .insertInto("settings")
        .values({ key, value })
        .onConflict((oc) => oc.column("key").doUpdateSet({ value })),
    );
  }

  close(): void {
    this.db.close();
  }
}

/** Named column by column, so a column a later migration adds never reaches the pages or MCP unasked. */
function toSubmission(row: Row): Submission {
  return {
    id: row.id,
    form: row.form,
    kind: row.kind as KindName,
    state: row.state,
    fields: JSON.parse(row.fields) as Record<string, string>,
    received_at: row.received_at,
    closed_at: row.closed_at,
    purged_at: row.purged_at,
    origin: row.origin,
  };
}

function newId(): string {
  return randomBytes(9).toString("base64url");
}
