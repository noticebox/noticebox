// The store: one SQLite file with submissions and their append-only events. Nothing is ever updated in `events`; a
// submission's state is the result of its events and is kept on the row only to list and filter quickly.
// SQLite is Node's own module, taken straight from the runtime so no bundler has to know it.
import { randomBytes } from "node:crypto";
import type { DatabaseSync as Database } from "node:sqlite";
import type { Config, Form } from "./config";
import { KINDS, type KindName } from "./kinds";

const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");

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

export type ListFilter = { form?: string; state?: string; open?: boolean; limit?: number };
export type Outcome = { ok: true } | { ok: false; error: string };

const SCHEMA = `
create table if not exists submissions (
  id text primary key,
  form text not null,
  kind text not null,
  state text not null,
  fields text not null,
  received_at text not null,
  closed_at text,
  purged_at text,
  origin text
);
create index if not exists submissions_by_form on submissions (form, state, received_at);
create index if not exists submissions_by_time on submissions (received_at);
create table if not exists events (
  id integer primary key autoincrement,
  submission_id text not null references submissions (id),
  at text not null,
  actor text not null,
  from_state text,
  to_state text,
  reason text not null default ''
);
create index if not exists events_by_submission on events (submission_id, id);
create table if not exists grants (
  id text primary key,
  actor text not null,
  client_hash text not null,
  client_name text not null,
  created_at text not null,
  last_used_at text not null,
  revoked_at text
);
create index if not exists grants_by_actor on grants (actor, created_at);
`;

export type Grant = { id: string; actor: string; client_hash: string; client_name: string; created_at: string; last_used_at: string; revoked_at: string | null };

type Row = Record<string, string | number | null>;

export class Store {
  readonly db: Database;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 5000;");
    this.db.exec(SCHEMA);
  }

  /** Stores a new submission in its kind's first state, with the `received` event. */
  receive(form: Form, fields: Record<string, string>, origin: string | null, now: Date): Submission {
    const id = newId();
    const at = now.toISOString();
    const state = KINDS[form.kind].initial;
    this.db.exec("begin");
    try {
      this.db
        .prepare("insert into submissions (id, form, kind, state, fields, received_at, origin) values (?, ?, ?, ?, ?, ?, ?)")
        .run(id, form.name, form.kind, state, JSON.stringify(fields), at, origin);
      this.db.prepare("insert into events (submission_id, at, actor, from_state, to_state, reason) values (?, ?, 'form', null, ?, '')").run(id, at, state);
      this.db.exec("commit");
    } catch (e) {
      this.db.exec("rollback");
      throw e;
    }
    return { id, form: form.name, kind: form.kind, state, fields, received_at: at, closed_at: null, purged_at: null, origin };
  }

  get(id: string): Submission | undefined {
    const row = this.db.prepare("select * from submissions where id = ?").get(id) as Row | undefined;
    return row ? toSubmission(row) : undefined;
  }

  list(filter: ListFilter = {}): Submission[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filter.form) {
      where.push("form = ?");
      params.push(filter.form);
    }
    if (filter.state) {
      where.push("state = ?");
      params.push(filter.state);
    }
    if (filter.open === true) where.push("closed_at is null");
    if (filter.open === false) where.push("closed_at is not null");
    const sql = `select * from submissions ${where.length ? "where " + where.join(" and ") : ""} order by received_at desc, id limit ?`;
    params.push(Math.min(filter.limit ?? 200, 1000));
    return (this.db.prepare(sql).all(...params) as Row[]).map(toSubmission);
  }

  events(id: string): Event[] {
    return this.db.prepare("select * from events where submission_id = ? order by id").all(id) as Event[];
  }

  /** Counts per form and state, for the overview. */
  counts(): { form: string; state: string; n: number }[] {
    return this.db.prepare("select form, state, count(*) as n from submissions group by form, state").all() as { form: string; state: string; n: number }[];
  }

  /** How many a form received per day (UTC) since `since`, for the overview's chart; days without any are absent. */
  daily(form: string, since: Date): { day: string; n: number }[] {
    return this.db
      .prepare("select substr(received_at, 1, 10) as day, count(*) as n from submissions where form = ? and received_at >= ? group by day order by day")
      .all(form, since.toISOString()) as { day: string; n: number }[];
  }

  /** Adds a note: an event that changes no state. */
  note(id: string, actor: string, reason: string, now: Date): Outcome {
    const s = this.get(id);
    if (!s) return { ok: false, error: "no such submission" };
    if (!reason.trim()) return { ok: false, error: "a note needs text" };
    this.db.prepare("insert into events (submission_id, at, actor, from_state, to_state, reason) values (?, ?, ?, ?, null, ?)").run(id, now.toISOString(), actor, s.state, reason.trim());
    return { ok: true };
  }

  /** Moves a submission to a state its kind allows from the current one, recording who, when and why. */
  transition(id: string, actor: string, to: string, reason: string, now: Date): Outcome {
    const s = this.get(id);
    if (!s) return { ok: false, error: "no such submission" };
    const kind = KINDS[s.kind];
    const allowed = kind.next[s.state] ?? [];
    if (!allowed.includes(to)) return { ok: false, error: `a ${kind.label} cannot go from ${s.state} to ${to}` };
    const text = reason.trim();
    if (kind.reasonRequired.includes(to) && !text) return { ok: false, error: `${to} needs a reason` };
    const at = now.toISOString();
    const closed = kind.closed.includes(to) ? at : null;
    this.db.exec("begin");
    try {
      this.db.prepare("update submissions set state = ?, closed_at = ? where id = ?").run(to, closed, id);
      this.db.prepare("insert into events (submission_id, at, actor, from_state, to_state, reason) values (?, ?, ?, ?, ?, ?)").run(id, at, actor, s.state, to, text);
      this.db.exec("commit");
    } catch (e) {
      this.db.exec("rollback");
      throw e;
    }
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
      const due = this.db.prepare("select id, fields from submissions where form = ? and closed_at is not null and closed_at < ? and purged_at is null").all(form.name, before) as { id: string; fields: string }[];
      for (const row of due) {
        const fields = JSON.parse(row.fields) as Record<string, string>;
        const kept = Object.fromEntries(Object.entries(fields).filter(([name]) => form.fields[name] && !form.fields[name].personal));
        this.db.prepare("update submissions set fields = ?, purged_at = ?, origin = null where id = ?").run(JSON.stringify(kept), now.toISOString(), row.id);
        purged++;
      }
    }
    return purged;
  }

  /** An MCP client the person allowed: the grant every token of that connection names. */
  grant(actor: string, clientHash: string, clientName: string, now: Date): Grant {
    const g: Grant = { id: newId(), actor, client_hash: clientHash, client_name: clientName, created_at: now.toISOString(), last_used_at: now.toISOString(), revoked_at: null };
    this.db.prepare("insert into grants (id, actor, client_hash, client_name, created_at, last_used_at) values (?, ?, ?, ?, ?, ?)").run(g.id, actor, clientHash, clientName, g.created_at, g.last_used_at);
    return g;
  }

  /** The grant behind a token, if it still stands; `touch` records the use. */
  grantOk(id: string, touch: Date | null = null): boolean {
    const g = this.db.prepare("select revoked_at from grants where id = ?").get(id) as { revoked_at: string | null } | undefined;
    if (!g || g.revoked_at !== null) return false;
    if (touch) this.db.prepare("update grants set last_used_at = ? where id = ?").run(touch.toISOString(), id);
    return true;
  }

  grants(actor: string): Grant[] {
    return this.db.prepare("select * from grants where actor = ? and revoked_at is null order by created_at desc").all(actor) as Grant[];
  }

  /** Revokes one of the person's own grants: every token of that connection stops working at once. */
  revokeGrant(id: string, actor: string, now: Date = new Date()): Outcome {
    const r = this.db.prepare("update grants set revoked_at = ? where id = ? and actor = ? and revoked_at is null").run(now.toISOString(), id, actor);
    return r.changes ? { ok: true } : { ok: false, error: "no such connection" };
  }

  close(): void {
    this.db.close();
  }
}

function toSubmission(row: Row): Submission {
  return {
    id: String(row.id),
    form: String(row.form),
    kind: row.kind as KindName,
    state: String(row.state),
    fields: JSON.parse(String(row.fields)) as Record<string, string>,
    received_at: String(row.received_at),
    closed_at: row.closed_at === null ? null : String(row.closed_at),
    purged_at: row.purged_at === null ? null : String(row.purged_at),
    origin: row.origin === null ? null : String(row.origin),
  };
}

function newId(): string {
  return randomBytes(9).toString("base64url");
}
