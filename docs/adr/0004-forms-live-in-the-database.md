# 0004: Boxes and forms live in the database, not in a JSON file

- Status: accepted
- Date: 2026-11-10

## Context and Problem Statement

Up to 0.2, the boxes and forms were a read-only JSON file. The operator wrote it, kept it in their stack repository and deployed it with the container. Secrets such as ntfy topics stayed out of it as `${VAR}` references, filled in from the environment. From 0.3.0 the inbox edits forms, and later MCP's `put_form` did too. Both write the file back, unexpanded, inside the container. Since then, the repository's copy goes stale with every edit, and a deploy that copies it over silently undoes them. The file is no longer configuration kept in git, and it is a second thing to back up beside the database (#35, #51).

## Considered Options

1. Keep the file and treat the container's copy as the source: stop keeping it in the stack repository, and back it up with the database.
2. Store boxes and forms in the database, next to the submissions.

## Decision Outcome

Option 2. The inbox and MCP are how forms are made and changed, and the database is where everything else they change lives. On upgrade, an existing forms file is imported once and not read after that. `${VAR}` references keep working in stored values, so secrets can stay in the environment.

### Consequences

- Good: one source and one backup. An edit can't be undone by a deploy.
- Good: forms change through the same store as everything else, with migrations for their shape (ADR 0003).
- Bad: forms can no longer be reviewed or versioned as a file in git. Their history is only what the store records.
- Bad: setting up a new instance means creating its forms in the inbox or over MCP, not copying a file. A test or demo setup seeds them through the backend.
- Bad: a one-time import on upgrade that has to be right the first time. The file stays on disk until the operator removes it.
