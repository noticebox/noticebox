# Upgrading

Images are `ghcr.io/noticebox/noticebox:<version>`; a `vX.Y.Z` tag of the repository is a release, and the release notes on GitHub say what changed. Pin the version in your compose file and change it on purpose.

```sh
docker compose pull && docker compose up -d
```

The database schema is brought up to date at start: each release carries the schema changes since the first as numbered migrations, and the database records which have run (its `user_version`), so every change is applied exactly once, in order, each in a transaction. A migration that fails is rolled back and the app does not start, with the reason in the log. A downgrade is not supported: a release refuses a database that a newer one has migrated. Take a [backup](retention.md#backups) before an upgrade that the notes call out as changing the database.

The forms file is read at start; after a change to it, restart the container. A file that does not parse stops the start with the reason in the log.
