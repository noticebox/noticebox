# 0003: The store runs on better-sqlite3 and kysely, with ordered migrations

- Status: accepted
- Date: 2026-11-10

## Context and Problem Statement

Up to 0.10.0, the store uses Node's built-in `node:sqlite` with hand-written SQL. Its schema is a set of `create table if not exists` statements, plus `drop table` lines for tables that were removed. No database records which schema it has. The SQLite convention asks for `better-sqlite3`, typed `kysely` queries and ordered migrations in code (#46, #48). Better Auth (ADR 0002) builds on `kysely` too.

## Considered Options

1. Keep `node:sqlite` and raw SQL, and write down why.
2. Move to `better-sqlite3` and `kysely`.

## Decision Outcome

Option 2, after the ordered migrations land on the current library. The migrations come first and are written so they work with either library, so each step is small and can be released on its own.

### Consequences

- Good: typed queries catch a renamed column at compile time, not in production.
- Good: one database layer for the inbox and for Better Auth, as in the other apps.
- Good: each database records its schema version. A schema change is a new migration, and a shipped one is never edited.
- Bad: `better-sqlite3` is a native module. The image depends on its prebuilt binary for alpine, and a Node upgrade can wait on a new build of it.
- Bad: one more dependency where Node had one built in.
- Bad: the 19 queries in the store are rewritten, which risks small behaviour changes; the existing tests guard against them.
