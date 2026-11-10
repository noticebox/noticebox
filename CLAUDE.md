# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

noticebox: an inbox for forms on static pages. Follows Marceltov/engineering-conventions; the rules here win where they differ. Next.js 16 app + a framework-free TypeScript backend, one SQLite file (`better-sqlite3` with typed `kysely` queries, Node ≥ 22), an MCP endpoint behind OAuth 2.1. User docs: `docs/` (MkDocs, `mkdocs build --strict`); README has the deployment and env-var reference.

## Commands

```sh
NOTICEBOX_CONFIG=noticebox.example.json NOTICEBOX_DEV_USER=dev NTFY_REPORTS_TOPIC=x NTFY_CONTACT_TOPIC=y npm run dev
npm test                                  # vitest: backend/**/*.test.ts, app/**/*.test.ts (the palette check) and proxy.test.ts; each test gets its own temp NOTICEBOX_DB/CONFIG (vitest.setup.ts)
npx vitest run backend/intake.test.ts -t "name"   # one file / one test
npm run typecheck                         # next typegen && tsc --noEmit
npm run lint
npm run test:e2e                          # next build, then Playwright on :3300 against e2e/noticebox.json
npx playwright test e2e/inbox.spec.ts     # after a build; reuses a running server outside CI
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit, e2e, then builds the image and smoke-tests `/health` and that `/` answers 401 before pushing.

Release: `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z` on `main`, with `X.Y.Z` = `package.json`'s version (CI refuses another). CI pushes the image as `X.Y.Z`, `X.Y` and `latest`, then makes the GitHub release with notes generated from the merged PRs.

Dependabot (`.github/dependabot.yml`) opens weekly grouped bumps; patch and minor ones merge by themselves once `check` is green (`dependabot-automerge.yml`, the one exception to merging only when the maintainer says so). `main` requires `check` through a ruleset; majors wait for review.

## Architecture

- **The boundary is lint-enforced** (`eslint.config.mjs`): `app/` and `proxy.ts` import the backend only through `@/backend` (`backend/index.ts`, the one door; export new things there). `backend/` never imports next/react or the frontend, and uses relative imports internally.
- **Runtime** (`backend/runtime.ts`): one `Runtime` per process on `globalThis` (forms, store, rate limiter, env settings, injectable `now`/`fetch`/`log`). Route handlers and server actions call `runtime()`; tests build their own with `makeRuntime` / helpers in `backend/testutil.ts`. Backend route handlers (`intakeRoute`, `mcpRoute`, OAuth routes) take the runtime and are thin re-exports in `app/**/route.ts`.
- **Auth is the reverse proxy's**: `proxy.ts` lets the public paths through (`/f/…`, `/api/f/…`, `/health`, `/mcp`, `/oauth/token|register`, `/.well-known/…`) and answers 401 on everything else without the user header; fail closed. It also rewrites non-GET `/f/<form>` to `/api/f/<form>`. Actions are attributed via `actorOf`; MCP actions as `<person> via <client>`.
- **The forms file is the configuration and is editable** (`backend/forms.ts`): every change mutates a copy of the raw JSON, parses it whole (`backend/config.ts`), then writes it. `${VAR}` references stay unexpanded in the file — never write the expanded config back.
- **Store** (`backend/db.ts`): `submissions` + append-only `events` (only retention's optional second step, `deleteAfterDays`, deletes a submission together with its events); a submission's state is derived from its events and only cached on the row. The schema is ordered migrations (`backend/migrations.ts`, recorded in `PRAGMA user_version`) applied at open; a shipped migration is never edited, a change is a new one. Queries are `kysely` builders typed by `Tables`, only compiled by kysely and run synchronously on `better-sqlite3`, so the store stays synchronous. Kinds (`backend/kinds.ts`) are presets of states (`closed`, `reason` flags); any state may move to any other.
- **MCP first**: every inbox feature is an MCP tool too (`backend/mcp.ts`), and a new feature lands as a tool first. Server actions and tools are thin adapters over the same backend functions (`backend/admin.ts` for boxes, forms, connections, export); every tool result carries `next: string[]`, built in the tool layer from what the call did, and the `url` of each item it names.
- **Retention** runs at start and every 6 h (`instrumentation.ts` → `sweepNow`): closed submissions past `retentionDays` lose personal fields; ids, states and events stay, until the form's optional `deleteAfterDays` deletes the submission and its events (`Store.expire`, ADR 0005).
- **Privacy rules**: notifications carry only that something arrived and a link, never content; GitHub issues are prefilled new-issue links without the email, no token or API call (see `docs/adr/0001-…`).

## Conventions

- Changes are judged against `docs/values.md`; a review names the point it touches ("breaks V1").
- The roadmap is `docs/roadmap.yml`; the PR that finishes or changes a step updates it.
- Each feature PR bumps `version` in `package.json` (and `package-lock.json`) and updates README + the matching `docs/` page; commit titles look like `NOTICEBOX #<issue>: <what>; noticebox <version>`.
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
