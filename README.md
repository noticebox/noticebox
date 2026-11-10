# noticebox

An inbox for the forms on static pages. A page points its form at `https://inbox.example.org/f/<form>`; what comes in lands in one SQLite file and in an inbox where each submission is walked through its states, with every step, who took it and why, kept as an audit trail. Reports about content and contact messages are the two kinds it knows. The page with the form stays yours: noticebox hosts no forms, only the endpoint, the inbox and a thank-you page.

One container, no database server, no accounts of its own: the login is the reverse proxy's, which tells noticebox who is signed in. Notifications say that something arrived, never what it says; closed submissions lose their personal fields after a retention period. An MCP endpoint, behind OAuth 2.1, lets an assistant do in the inbox what the person who allowed it can do, recorded in their name.

**Documentation: https://noticebox.github.io/noticebox/** — what it does, how to post to it from a page, the configuration, the login in front, MCP.

## Install

```sh
curl -fsSLO https://raw.githubusercontent.com/noticebox/noticebox/main/compose.yaml
curl -fsSL https://raw.githubusercontent.com/noticebox/noticebox/main/.env.example -o .env && chmod 600 .env
# fill in .env, put the login proxy in front, then:
docker compose pull && docker compose up -d
```

The [quick start](https://noticebox.github.io/noticebox/get-started/quick-start/) runs it on your machine in a few minutes; [self-hosting](https://noticebox.github.io/noticebox/self-hosting/configuration/) covers every setting and [the login in front](https://noticebox.github.io/noticebox/self-hosting/login/).

## Development

```sh
npm install
NOTICEBOX_CONFIG=noticebox.example.json NOTICEBOX_DEV_USER=dev NTFY_REPORTS_TOPIC=x NTFY_CONTACT_TOPIC=y npm run dev
npm test            # unit tests (vitest)
npm run typecheck
npm run lint
npm run test:e2e    # builds, then Playwright against the production build
```

Node 22 or newer. The store is SQLite through `better-sqlite3` (prebuilt binaries, no compiler needed) with typed `kysely` queries. `backend/` is framework-free and imported by the app only through `@/backend`. [CLAUDE.md](CLAUDE.md) has the architecture.

## Licence

AGPL-3.0-only. Contributions are welcome under the [contributor licence agreement](CLA.md); see [CONTRIBUTING.md](CONTRIBUTING.md).
