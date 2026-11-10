# 0005: A form may have retention delete the whole record, events included

- Status: accepted
- Date: 2026-11-10

## Context and Problem Statement

Up to 0.10.0, retention has one step: `retentionDays` after a submission is closed, its personal fields are blanked. The anonymised record stays for good: the ids, the category, the states and every event with its reason. `events` is append-only. Nothing in noticebox ever changes or removes an event, and the record is the proof that a submission was handled.

"For good" is longer than any audit needs. A privacy page that says *kept for audit purposes*, with no end, is a weaker promise than one with a date. notefeed's plan for reports kept the bare record for a year (#11). The retention docs page told operators who promise deletion to delete rows from the database by hand.

## Considered Options

1. Keep the anonymised record for good, and leave deletion to the operator by hand.
2. An optional second step per form, `deleteAfterDays`, counted from closing and at least `retentionDays` long. Once it has passed, the submission and its events are deleted.
3. One deletion period for the whole instance.

## Decision Outcome

Option 2, from 0.11.0. Each form already sets its own retention, and a contact form and a report form have different audit needs. Unset is the default, so an upgrade deletes nothing. Deletion is the sweep's second pass (`Store.expire`), counted from `closed_at` like the first. A reopened submission has no `closed_at`, so it is never due, and its clock starts again when it is closed again.

`events` stays append-only in every other respect: no code path edits an event, and the only deletion removes a submission together with all of its events, in one transaction.

### Consequences

- Good: an operator can promise a date for deletion and keep it, without touching the database.
- Good: the default is unchanged, so no data goes on upgrade.
- Bad: after deletion there is no proof inside noticebox that the submission was handled. `/export.json` before the date is the way to keep one; the retention page says so.
- Bad: the overview's per-day chart forgets deleted submissions. No counter is kept, because `deleteAfterDays` is months and the chart covers 30 days.
- Bad: "append-only" now has an exception that a reader of the code has to know about; CLAUDE.md names it.
