# Upgrading

Images are `ghcr.io/noticebox/noticebox:<version>`: each release is pushed as `X.Y.Z`, as `X.Y` (the newest of that line) and as `latest`. A `vX.Y.Z` tag of the repository is a release, and its [release notes on GitHub](https://github.com/noticebox/noticebox/releases) list the pull requests that went into it. Pin the version in your compose file and change it on purpose.

```sh
docker compose pull && docker compose up -d
```

The database schema is created at start and, where a release changes it, brought up to date then; a downgrade is not supported. Take a [backup](retention.md#backups) before an upgrade that the notes call out as changing the database.

The forms file is read at start; after a change to it, restart the container. A file that does not parse stops the start with the reason in the log.
