# Upgrading

Images are `ghcr.io/noticebox/noticebox:<version>`: each release is pushed as `X.Y.Z`, as `X.Y` (the newest of that line) and as `latest`. A `vX.Y.Z` tag of the repository is a release, and its [release notes on GitHub](https://github.com/noticebox/noticebox/releases) list the pull requests that went into it. Pin the version in your compose file and change it on purpose.

```sh
docker compose pull && docker compose up -d
```

The database schema is brought up to date at start: each release carries the schema changes since the first as numbered migrations, and the database records which have run (its `user_version`), so every change is applied exactly once, in order, each in a transaction. A migration that fails is rolled back and the app does not start, with the reason in the log. A downgrade is not supported: a release refuses a database that a newer one has migrated. Take a [backup](retention.md#backups) before an upgrade that the notes call out as changing the database.

## From the forms file to the database

Up to 0.15, boxes and forms were in a JSON file (`NOTICEBOX_CONFIG`). From 0.16 they are in the database ([ADR 0004](https://github.com/noticebox/noticebox/blob/main/docs/adr/0004-forms-live-in-the-database.md)). The first start of 0.16 or later imports the file once, if the database has no boxes or forms yet: the same boxes and forms, `${VAR}` references as written, and every submission still with its form. The log says so:

```
forms: imported 3 forms from /data/noticebox.json into the database; the file is no longer read and can be removed
```

After that the file is not read again, and changing it has no effect; each later start logs that it can be removed. A database that already has forms ignores the file and logs that too. A file that does not parse stops that first start with the reason in the log, and nothing is imported.

Once the import is in the log, remove the file, drop `NOTICEBOX_CONFIG` from `.env` and the forms file from your stack repository. The forms are in the database [backup](retention.md#backups) from then on.
