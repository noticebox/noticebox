# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

noticebox: an inbox for forms on static pages. Follows Marceltov/engineering-conventions; the rules here win where they differ. Next.js 16 app + a framework-free TypeScript backend, one SQLite file (Node's built-in `node:sqlite`, Node ≥ 22.13), an MCP endpoint behind OAuth 2.1. User docs: `docs/` (MkDocs, `mkdocs build --strict`); README has the deployment and env-var reference.

## Commands

```sh
NOTICEBOX_CONFIG=noticebox.example.json NOTICEBOX_DEV_USER=dev NTFY_REPORTS_TOPIC=x NTFY_CONTACT_TOPIC=y npm run dev
npm test                                  # vitest: backend/**/*.test.ts and proxy.test.ts
npx vitest run backend/intake.test.ts -t "name"   # one file / one test
npm run typecheck                         # next typegen && tsc --noEmit
npm run lint
npm run test:e2e                          # next build, then Playwright on :3300 against e2e/noticebox.json
npx playwright test e2e/inbox.spec.ts     # after a build; reuses a running server outside CI
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit, e2e, then builds the image and smoke-tests `/health` and that `/` answers 401 before pushing.

## Architecture

- **The boundary is lint-enforced** (`eslint.config.mjs`): `app/` and `proxy.ts` import the backend only through `@/backend` (`backend/index.ts`, the one door; export new things there). `backend/` never imports next/react or the frontend, and uses relative imports internally.
- **Runtime** (`backend/runtime.ts`): one `Runtime` per process on `globalThis` (forms, store, rate limiter, env settings, injectable `now`/`fetch`/`log`). Route handlers and server actions call `runtime()`; tests build their own with `makeRuntime` / helpers in `backend/testutil.ts`. Backend route handlers (`intakeRoute`, `mcpRoute`, OAuth routes) take the runtime and are thin re-exports in `app/**/route.ts`.
- **Auth is the reverse proxy's**: `proxy.ts` lets the public paths through (`/f/…`, `/api/f/…`, `/health`, `/mcp`, `/oauth/token|register`, `/.well-known/…`) and answers 401 on everything else without the user header; fail closed. It also rewrites non-GET `/f/<form>` to `/api/f/<form>`. Actions are attributed via `actorOf`; MCP actions as `<person> via <client>`.
- **The forms file is the configuration and is editable** (`backend/forms.ts`): every change mutates a copy of the raw JSON, parses it whole (`backend/config.ts`), then writes it. `${VAR}` references stay unexpanded in the file — never write the expanded config back.
- **Store** (`backend/db.ts`): `submissions` + append-only `events` (only retention's optional second step, `deleteAfterDays`, deletes a submission together with its events); a submission's state is derived from its events and only cached on the row. Schema is applied at open; dropping obsolete tables happens there too. Kinds (`backend/kinds.ts`) are presets of states (`closed`, `reason` flags); any state may move to any other.
- **Retention** runs at start and every 6 h (`instrumentation.ts` → `sweepNow`): closed submissions past `retentionDays` lose personal fields; ids, states and events stay, until the form's optional `deleteAfterDays` deletes the submission and its events (`Store.expire`, ADR 0005).
- **Privacy rules**: notifications carry only that something arrived and a link, never content; GitHub issues are prefilled new-issue links without the email, no token or API call (see `docs/adr/0001-…`).

## Conventions

- Each feature PR bumps `version` in `package.json` (and `package-lock.json`) and updates README + the matching `docs/` page; commit titles look like `NOTICEBOX #<issue>: <what>; noticebox <version>`.
- Architecturally significant decisions get an ADR in `docs/adr/`.
- Comments explain why, in full sentences, at the top of each module; keep that style.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for noticebox/noticebox, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
