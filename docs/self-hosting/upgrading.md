# Upgrading

Images are `ghcr.io/noticebox/noticebox:<version>`: each release is pushed as `X.Y.Z`, as `X.Y` (the newest of that line) and as `latest`. A `vX.Y.Z` tag of the repository is a release, and its [release notes on GitHub](https://github.com/noticebox/noticebox/releases) list the pull requests that went into it. Pin the version in your compose file and change it on purpose.

```sh
docker compose pull && docker compose up -d
```

The database schema is brought up to date at start: each release carries the schema changes since the first as numbered migrations, and the database records which have run (its `user_version`), so every change is applied exactly once, in order, each in a transaction. A migration that fails is rolled back and the app does not start, with the reason in the log. A downgrade is not supported: a release refuses a database that a newer one has migrated. Take a [backup](retention.md#backups) before an upgrade that the notes call out as changing the database.

## Mail targets and NOTICEBOX_MAIL_TO (0.29)

From 0.29, a form's [mail target](notifications.md#mail) may write to the addresses and `@domain` entries in `NOTICEBOX_MAIL_TO`, no longer to whoever may sign in. Before upgrading a 0.27 or 0.28 instance with mail targets, list their addresses there (`NOTICEBOX_MAIL_TO=@example.org`). Without that, their mail is skipped and logged, and the forms can't be saved until the list matches. An address that was only on `NOTICEBOX_ALLOWED_EMAILS` so that a form could mail it can come off that list.

## Files through next-app-kit (0.25)

From 0.25, reading, keeping and serving the files that come with a form are next-app-kit's too (`next-app-kit/files`). Nothing changes for senders or in the inbox: the same rules, the same messages, the same downloads, and a link `get_file` handed out before still works until it runs out. The database changes once at the first start (the files table names its submission `owner`, as the kit does), so take a [backup](retention.md#backups) before upgrading.

## Onto next-app-kit (0.24)

From 0.24, sign-in, API tokens, MCP and the REST API come from [next-app-kit](https://github.com/Marceltov/next-app-kit), the library noticebox's own copy of them was moved into. What people see stays the same; the settings change their names:

| Before 0.24 | From 0.24 |
|---|---|
| `NOTICEBOX_BASE_URL` | `PUBLIC_URL`, the same value. Required, and never taken from a request's headers |
| `NOTICEBOX_DB` (a file) | `DATA_DIR` (its folder): `noticebox.sqlite` and `auth.sqlite` in it. The image's default, `/data`, is where both already were |
| `NOTICEBOX_UPLOAD_DIR` | `TMPDIR`, the system's temporary folder |

The old names are no longer read. A release that finds no `PUBLIC_URL` refuses to start and says so. With the image's defaults, renaming `NOTICEBOX_BASE_URL` in `.env` is the whole change; the inbox, sessions, API tokens and MCP connections carry over, and API tokens keep their scope.

What else changes:

- Every MCP tool result carries `guidance` instead of `next`, the same instructions under the kit's name. **Reconnect every MCP client after the upgrade** (in claude.ai: the connector's settings, disconnect and connect; in Claude Code: `/mcp`): a client keeps the tools' old output schemas, so it rejects each result (*data must have required property 'next'*) until it fetches them again.
- An address taken off `NOTICEBOX_ALLOWED_EMAILS` loses its sessions and MCP and script grants at the next start, and its MCP calls and API tokens are refused at once.
- `APPLE` is a built-in provider, like `GITHUB` and `GOOGLE`.

## From the login proxy to sign-in (0.17)

From 0.17, noticebox signs people in itself and the header a login proxy sets counts for nothing. Before upgrading, set `NOTICEBOX_SECRET`, `NOTICEBOX_ALLOWED_EMAILS` and a way to sign in: SMTP, or a provider such as your Authentik. Without one, the new release refuses to start and says why. [Sign-in](login.md#coming-from-the-login-proxy-up-to-016) walks through it, including keeping the names the history records. Every MCP client connects once more after the upgrade.

## From the forms file to the database

Up to 0.15, boxes and forms were in a JSON file (`NOTICEBOX_CONFIG`). From 0.16 they are in the database ([ADR 0004](https://github.com/noticebox/noticebox/blob/main/docs/adr/0004-forms-live-in-the-database.md)). The first start of 0.16 or later imports the file once, if the database has no boxes or forms yet: the same boxes and forms, `${VAR}` references as written, and every submission still with its form. The log says so:

```
forms: imported 3 forms from /data/noticebox.json into the database; the file is no longer read and can be removed
```

After that the file is not read again, and changing it has no effect; each later start logs that it can be removed. A database that already has forms ignores the file and logs that too. A file that does not parse stops that first start with the reason in the log, and nothing is imported.

Once the import is in the log, remove the file, drop `NOTICEBOX_CONFIG` from `.env` and the forms file from your stack repository. The forms are in the database [backup](retention.md#backups) from then on.
