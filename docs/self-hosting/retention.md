# Retention, export and backups

## What is removed, and when

A submission is closed when it reaches a closed state: `acted_on` or `rejected` for a report, `answered` for a message. `retentionDays` after that, its personal fields are removed: every field marked `personal`, which free text, textareas and email addresses are by default. What stays is the ids and other fields marked `personal: false`, the chosen category of a `select`, the states, the history with every reason, and the time of the removal. The submission's page says *Personal fields removed* with the date.

The sweep runs at start and every six hours. A report reopened before the sweep keeps its fields until it is closed again and the days have passed again.

Nothing is deleted entirely. The anonymised record is the proof that submissions were handled; if your privacy page promises deletion after a period, say instead that the record without personal data is kept, or remove rows from the database yourself.

## Export

`/export.json`, behind the login, returns every submission with its history, newest first, up to 1000; `?form=<name>` limits it to one form. It is the audit export and the way out.

## Backups

Everything is in the one SQLite file (`NOTICEBOX_DB`, `/data/noticebox.sqlite` in the image), in WAL mode, so the `-wal` and `-shm` files next to it belong to it. Copy it with SQLite's own backup, which is consistent while the app runs:

```sh
docker exec noticebox node -e '
  const { DatabaseSync } = require("node:sqlite");
  new DatabaseSync("/data/noticebox.sqlite").exec("VACUUM INTO \x27/data/backup.sqlite\x27")'
```

or stop the container and copy the three files. The forms file is in your repository already.
