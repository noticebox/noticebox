# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

noticebox: an inbox for forms on static pages. Follows Marceltov/engineering-conventions; the rules here win where they differ. Next.js 16 app + a framework-free TypeScript backend, one SQLite file (`better-sqlite3` with typed `kysely` queries, Node ≥ 26, the major in `.nvmrc` and the Dockerfile), an MCP endpoint behind OAuth 2.1. User docs: `docs/` (MkDocs, `mkdocs build --strict`) are the one place for usage, deployment and settings; README only says what noticebox is, installs it in a few lines and links there.

## Commands

```sh
NOTICEBOX_CONFIG=noticebox.example.json NOTICEBOX_DEV_USER=dev NTFY_REPORTS_TOPIC=x NTFY_CONTACT_TOPIC=y npm run dev   # imports the example forms into data/ once; the dev user needs no sign-in
npm test                                  # vitest: backend/**/*.test.ts, app/**/*.test.ts (the palette check) and proxy.test.ts; each test gets its own temp NOTICEBOX_DB/CONFIG (vitest.setup.ts); backend/accounts.test.ts runs sign-in and MCP OAuth over HTTP
npx vitest run backend/intake.test.ts -t "name"   # one file / one test
npm run generate                          # rewrites openapi.json from the REST route table (backend/rest.ts); the unit tests fail while it is stale
npm run typecheck                         # next typegen && tsc --noEmit
npm run lint
npm run format                            # Prettier at 160 columns (format:check in CI); not the MkDocs Markdown in docs/
npm run test:e2e                          # next build, then Playwright on :3300; e2e/seed.ts creates the forms before the server starts, e2e/global-setup.ts the signed-in session
npx playwright test e2e/inbox.spec.ts     # after a build; reuses a running server outside CI
```

CI (`.github/workflows/ci.yml`) runs `format:check`, lint, typecheck, unit, e2e, then builds the image and smoke-tests `/health` and that `/` answers 401 before pushing (the image needs `NOTICEBOX_BASE_URL`, `NOTICEBOX_SECRET` and a way to sign in to start).

Release: `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z` on `main`, with `X.Y.Z` = `package.json`'s version (CI refuses another). CI pushes the image as `X.Y.Z`, `X.Y` and `latest`, then makes the GitHub release with notes generated from the merged PRs.

Dependabot (`.github/dependabot.yml`) opens weekly grouped bumps; patch and minor ones merge by themselves once `check` is green (`dependabot-automerge.yml`, the one exception to merging only when the maintainer says so). `main` requires `check` through a ruleset; majors wait for review.

## Architecture

- **The boundary is lint-enforced** (`eslint.config.mjs`): `app/` and `proxy.ts` import the backend only through `@/backend` (`backend/index.ts`, the one door; export new things there). `backend/` never imports next/react or the frontend, and uses relative imports internally.
- **Runtime** (`backend/runtime.ts`): one `Runtime` per process on `globalThis` (forms, store, rate limiter, env settings, injectable `now`/`fetch`/`log`). Route handlers and server actions call `runtime()`; tests build their own with `makeRuntime` / helpers in `backend/testutil.ts`. Backend route handlers (`intakeRoute`, `mcpRoute`, OAuth routes) take the runtime and are thin re-exports in `app/**/route.ts`.
- **Sign-in is Better Auth's** (`backend/accounts.ts`, ADR 0002), in its own `auth.sqlite` next to the inbox's database: email code (+ link outside MCP sign-ins), OIDC/GitHub/Google providers from `NOTICEBOX_OIDC_<NAME>_*`, the `NOTICEBOX_ALLOWED_EMAILS` allowlist, and `@better-auth/mcp` as the OAuth server for `/mcp`. `proxy.ts` lets the public paths through (`/f/…`, `/api/f/…`, `/api/auth/…`, `/health`, `/mcp`, `/login`, `/.well-known/…`) and answers 401 on everything else without the session cookie; fail closed; no header counts. It also rewrites non-GET `/f/<form>` to `/api/f/<form>`. Pages check the session with `personOf`/`actorOf` (async); events record the verified email address (no provider username claim counts; unverified is refused at every sign-in), MCP actions `<email> via <client>`; `/mcp` checks the person's consent on every call (`whoFor`), so revoking is immediate. Better Auth hooks must query through `getCurrentAdapter` (one SQLite connection, one transaction).
- **Boxes and forms live in the database** (`backend/forms.ts`, ADR 0004): each form is stored as the JSON it was written as. Every change mutates a copy of the raw JSON, parses it whole (`backend/config.ts`), then rewrites the `boxes`/`forms` rows. `${VAR}` references stay unexpanded in the store — never store the expanded config; a variable unset at load only marks the notify targets that need it. The deprecated forms file (`NOTICEBOX_CONFIG`) is only imported once (`Forms.importFile`).
- **Store** (`backend/db.ts`): `submissions` + append-only `events` (only retention's optional second step, `deleteAfterDays` or a closed state's `deleteAfterMinutes`, deletes a submission together with its events); a submission's state is derived from its events and only cached on the row. The schema is ordered migrations (`backend/migrations.ts`, recorded in `PRAGMA user_version`) applied at open; a shipped migration is never edited, a change is a new one. Queries are `kysely` builders typed by `Tables`, only compiled by kysely and run synchronously on `better-sqlite3`, so the store stays synchronous. Kinds (`backend/kinds.ts`) are presets of states (`closed`, `reason` flags, `deleteAfterMinutes`); any state may move to any other.
- **MCP first**: every inbox feature is an MCP tool too (`backend/mcp.ts`), and a new feature lands as a tool first. The REST API (`backend/rest.ts`, `/api/v1`) mirrors the tools one operation per tool (a test checks the two lists); both build their results from `backend/views.ts`. REST callers are API tokens (`nbx_…`, Better Auth's api-key plugin, `backend/tokens.ts`; `read` tokens only GET) or OAuth tokens for the `/api/v1` audience; neither works on `/mcp`, and the plugin's own `/api/auth/api-key/*` endpoints are closed to HTTP. Server actions and tools are thin adapters over the same backend functions (`backend/admin.ts` for boxes, forms, connections, export); every tool result carries `next: string[]`, built in the tool layer from what the call did, and the `url` of each item it names.
- **Files** (`backend/files.ts`, ADR 0007): only `file` fields take them (`accept`, `maxFiles`, `maxMegabytes`), read as they arrive into temporary files (`backend/multipart.ts`, cut off when they break the rule), then stored in 1 MB chunks (`file_chunks`) in the same transaction as the submission and removed with the personal fields or the record; served as a stream. MCP `get_file` hands out a 15-minute signed link, never the bytes (a picture only with `show`). A stranger's file is never rendered: downloads as `application/octet-stream` with `nosniff` and a sandbox CSP, only PNG/JPEG/GIF/WebP/AVIF inline, never SVG.
- **Retention** runs at start and every minute (`instrumentation.ts` → `sweepNow`): closed submissions past `retentionDays` lose personal fields; ids, states and events stay, until the form's optional `deleteAfterDays` deletes the submission and its events (`Store.expire`, ADR 0005). A closed state's `deleteAfterMinutes` (tests, spam) deletes sooner. The sweep logs only when it removed something.
- **Privacy rules**: notifications carry only that something arrived and a link, never content; GitHub issues are prefilled new-issue links without the email, no token or API call (see `docs/adr/0001-…`).

## Conventions

- Changes are judged against `docs/values.md`; a review names the point it touches ("breaks V1").
- The roadmap is `docs/roadmap.yml`; the PR that finishes or changes a step updates it.
- Each feature PR bumps `version` in `package.json` (and `package-lock.json`) and updates the matching `docs/` page (README only when what noticebox is or how it installs changes); commit titles look like `NOTICEBOX #<issue>: <what>; noticebox <version>`.
- Architecturally significant decisions get an ADR in `docs/adr/`.
- UI text is English and comes from `app/_lib/copy/en.ts` through `t` (`@/app/_lib/copy`), never inline in a component or server action; another language is one file typed as `Copy`. Backend messages (validation errors, shared with MCP) stay in the backend, in English.
- Comments explain why, in full sentences, at the top of each module; keep that style.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for noticebox/noticebox, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
