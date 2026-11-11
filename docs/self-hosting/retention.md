# Retention, export and backups

## What is removed, and when

A submission is closed when it reaches a closed state: `acted_on` or `rejected` for a report, `answered` for a message. `retentionDays` after that, its personal fields are removed: every field marked `personal`, which free text, textareas and email addresses are by default. What stays is the ids and other fields marked `personal: false`, the chosen category of a `select`, the states, the history with every reason, and the time of the removal. The submission's page says *Personal fields removed* with the date.

The sweep runs at start and every six hours. A report reopened before the sweep keeps its fields until it is closed again and the days have passed again.

By default nothing is deleted entirely: the anonymised record is the proof that submissions were handled.

## Deleting the record too

A form may set `deleteAfterDays`, a whole number of days counted from closing like `retentionDays`, and at least as long. Once that has passed, the sweep deletes the submission together with its history; the log says how many. Set it when your privacy page promises deletion after a period (a year is common for an audit trail). The form's overview and its *Settings* tab show it beside the retention; MCP's `get_form` and `put_form` carry it as `deleteAfterDays`, and `list_forms` as `delete_after_days`.

A submission that is reopened is not deleted; its clock starts again when it is closed again. A deleted submission also leaves the overview's chart of the last 30 days, which matters only if `deleteAfterDays` is shorter than that.

If you need a copy beyond that period, keep one with the [export](#export) before it runs out.

## Export

`/export.json`, behind the login, returns every submission with its history, newest first, up to 1000; `?form=<name>` limits it to one form. It is the audit export and the way out.

## Backups

Everything is in the one SQLite file (`NOTICEBOX_DB`, `/data/noticebox.sqlite` in the image), in WAL mode, so the `-wal` and `-shm` files next to it belong to it. Copy it with SQLite's own backup, which is consistent while the app runs:

```sh
docker exec noticebox node -e '
  const Database = require("better-sqlite3");
  new Database("/data/noticebox.sqlite").exec("VACUUM INTO \x27/data/backup.sqlite\x27")'
```

or stop the container and copy the three files. The boxes and forms are in the same file, so the backup has them too.
