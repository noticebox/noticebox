// The schema, as an ordered list of migrations applied at open. Each runs exactly once, in its own transaction, and
// the database records how many have run in `PRAGMA user_version`. A migration that has shipped is never edited,
// because databases out there have already run it: a change to the schema is a new migration at the end of the list.
// The list is plain SQL, so it does not depend on the library that runs the queries.
//
// Migration 1 is the schema as 0.10.0 left it. Releases before migrations ran the same script at every start, so it
// is written to succeed on such a database as well as on a new one.
export type Migration = { name: string; sql: string };

export const MIGRATIONS: Migration[] = [
  {
    name: "submissions, events and grants",
    sql: `
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
drop table if exists form_tokens;
drop table if exists issues;
`,
  },
  {
    // Boxes and forms move here from the forms file (ADR 0004). A form is kept as the JSON it was written as, with its
    // `${VAR}` references, because parsing fills in defaults and expands them; `box` is a column for queries.
    name: "boxes, forms and settings",
    sql: `
create table boxes (
  name text primary key,
  position integer not null
);
create table forms (
  name text primary key,
  box text not null,
  definition text not null,
  position integer not null
);
create table settings (
  key text primary key,
  value text not null
);
`,
  },
  {
    // MCP clients sign in through Better Auth now (ADR 0002), whose data is in auth.sqlite; the old grants can't be
    // carried over, so every client connects once more.
    name: "drop grants",
    sql: `drop table grants;`,
  },
  {
    // Files that came with a submission (ADR 0007): kept in the database like everything else, so a backup holds them
    // and retention removes them in the same transaction as the fields they belong with. The bytes are in chunks of a
    // megabyte, so a file of any size is written and read without holding all of it in memory.
    name: "files",
    sql: `
create table files (
  id text primary key,
  submission_id text not null references submissions (id),
  field text not null,
  name text not null,
  type text not null,
  size integer not null
);
create index files_by_submission on files (submission_id, id);
create table file_chunks (
  file_id text not null references files (id),
  seq integer not null,
  data blob not null,
  primary key (file_id, seq)
) without rowid;
`,
  },
];

/** What a migration needs of a connection: better-sqlite3 has it, and so does any other SQLite driver. */
export type Connection = { exec(sql: string): unknown; prepare(sql: string): { get(): unknown } };

/**
 * Brings the database up to the last migration and returns how many ran. A failing migration is rolled back and
 * thrown, so the store refuses to open on a half-migrated database; one newer than this release knows is refused too.
 */
export function migrate(db: Connection, migrations: Migration[] = MIGRATIONS): number {
  const version = () => (db.prepare("pragma user_version").get() as { user_version: number }).user_version;
  let ran = 0;
  for (;;) {
    // The version is read under the write lock, so two processes opening the same file at once never run one twice.
    db.exec("begin immediate");
    const current = version();
    if (current >= migrations.length) {
      db.exec("rollback");
      if (current > migrations.length)
        throw new Error(`the database is at schema version ${current}, newer than this release knows (${migrations.length}); a downgrade is not supported`);
      return ran;
    }
    const m = migrations[current]!;
    try {
      db.exec(m.sql);
      db.exec(`pragma user_version = ${current + 1}`);
      db.exec("commit");
      ran++;
    } catch (e) {
      // SQLite may have rolled back by itself already (a full disk, say); the migration's own error is the one to report.
      try {
        db.exec("rollback");
      } catch {}
      throw new Error(`migration ${current + 1} (${m.name}) failed: ${(e as Error).message}`);
    }
  }
}
