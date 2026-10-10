# noticebox

Documentation: https://noticebox.github.io/noticebox/

An inbox for the forms on static pages. A page points its form at `https://inbox.example.org/f/<form>`; what comes in lands in one SQLite file and in an inbox where each submission is walked through its states, with every step, who took it and why, kept as an audit trail. Reports about content and contact messages are the two kinds it knows. The page with the form stays yours: noticebox hosts no forms, only the endpoint, the inbox and a thank-you page for forms that name no `redirect`.

One container, no database server, no accounts of its own: the login is the reverse proxy's (Authentik or any forward-auth), which tells noticebox who is signed in. An MCP endpoint, guarded by OAuth 2.1, lets an assistant read, annotate and decide submissions in that person's name.

## How it works

- **A form** is declared in `noticebox.json`: the box it belongs to (a site, a project; the sidebar groups by it), its kind, its fields, where it may be posted from, where the browser goes afterwards, how long closed submissions keep personal data, where to say that something arrived, and a `link`, a URL template over the form's fields (`https://notefeed.me/r/{read_id}/{note_id}`) that opens what a submission is about, from the table, the detail and the MCP tools. See `noticebox.example.json`.
- **A kind** is a small state machine. A `report` starts `open`, can be `in_review`, and ends `acted_on` or `rejected`; the two closing states need a written reason, which becomes the record of the decision. A `message` is `new` until `answered`. Any state can be reopened.
- **Intake** is `POST /f/<form>`, as a plain form post (answered with a redirect) or as JSON (answered with the id, or the errors). A hidden field nobody sees catches bots, each client gets ten submissions per form in ten minutes, and a form with `origins` refuses posts from anywhere else. A refused plain post is sent back to the page it came from with `?error=…` and what was typed, so the page can show both; a page without JavaScript needs nothing more.
- **Notifications** say that something arrived and where to look, never what it says: an ntfy topic gets a title and the link, a webhook gets `{form, kind, id, received_at, url}`.
- **Retention**: a submission closed longer ago than the form's `retentionDays` loses its personal fields (free text, email; anything not marked `personal: false`). The ids, the category, the states and the audit trail stay.
- **The inbox**: the sidebar lists the boxes and their forms with what is open; a form has an overview (what waits, received per day, the endpoint and the fields) and the table of its submissions, where the state of each row is a dropdown: choose the next state, write the reason in the dialog, confirm. `/forms/<form>/submissions/<id>` shows one submission with its fields and history; notifications link there. `/export.json` gives everything with its events.
- **MCP** at `/mcp` has five tools: `list_forms`, `list_submissions`, `get_submission`, `add_note`, `decide`. An MCP client registers itself, the signed-in person allows it on `/oauth/authorize`, and everything the assistant does is recorded as `<person> via <client>`.

## Deploying

```yaml
# compose.yml, see compose.example.yml
services:
  noticebox:
    image: ghcr.io/noticebox/noticebox:latest
    environment:
      NOTICEBOX_BASE_URL: https://inbox.example.org
      NOTICEBOX_SECRET: ${NOTICEBOX_SECRET}   # 32+ random characters; signs the MCP tokens
    volumes: ["./noticebox.json:/app/noticebox.json:ro", "./data:/data"]
    ports: ["127.0.0.1:3000:3000"]
```

| Variable | Meaning |
|---|---|
| `NOTICEBOX_CONFIG` | the forms file (default `noticebox.json`; `/app/noticebox.json` in the image) |
| `NOTICEBOX_DB` | the SQLite file (default `data/noticebox.sqlite`; `/data/noticebox.sqlite` in the image) |
| `NOTICEBOX_BASE_URL` | the public URL, for links in notifications and as the OAuth issuer |
| `NOTICEBOX_USER_HEADER` | the header the login proxy sets (default `X-Authentik-Username`) |
| `NOTICEBOX_SECRET` | signs the OAuth tokens; without it there is no MCP |
| `NOTICEBOX_RATE_LIMIT` | submissions per client and form in ten minutes (default 10, 0 for none) |
| `NOTICEBOX_TRUST_PROXY` | `0` to ignore `X-Forwarded-For` |
| `NOTICEBOX_DEV_USER` | a fixed user for development without a proxy; never in production |

The `${VAR}` references in `noticebox.json` are filled from the container's environment, so topics and other secrets stay out of the file.

**The login in front.** Everything except `/f/` (the endpoint and the thank-you page), `/healthz`, `/mcp`, `/oauth/token`, `/oauth/register` and `/.well-known/` must go through the proxy's login, and the proxy must pass the user's name in a header. With Caddy and an Authentik proxy outpost:

```caddyfile
inbox.example.org {
    @public path /f/* /healthz /mcp /oauth/token /oauth/register /.well-known/*
    handle @public {
        reverse_proxy noticebox:3000
    }
    handle {
        forward_auth authentik-server:9000 {
            uri /outpost.goauthentik.io/auth/caddy
            copy_headers X-Authentik-Username X-Authentik-Email
        }
        reverse_proxy noticebox:3000
    }
}
```

Without that header the inbox answers 401, so a deployment that forgot the proxy fails closed rather than open.

**A form on a static page** needs nothing but the action:

```html
<form method="post" action="https://inbox.example.org/f/contact">
  <input name="name" required> <input name="email" type="email" required>
  <textarea name="message" required></textarea>
  <input name="_gotcha" style="position:absolute;left:-10000px" tabindex="-1" autocomplete="off">
  <button>Send</button>
</form>
```

Name the page's origin in the form's `origins`, and set `redirect` to the page's thank-you URL. A script may `fetch` the same URL with JSON (`{"id"}` on 201, `{"errors": [...]}` on 400); the preflight is answered for the allowed origins. A page that wants to carry ids into the form, as notefeed's `/report` does with the note it is about, puts them into hidden fields.

**MCP.** In Claude Code: `claude mcp add --transport http noticebox https://inbox.example.org/mcp`, then sign in when the browser opens. The authorize page is behind the same login as the inbox.

## Development

```sh
npm install
NOTICEBOX_CONFIG=noticebox.example.json NOTICEBOX_DEV_USER=dev NTFY_REPORTS_TOPIC=x NTFY_CONTACT_TOPIC=y npm run dev
npm test            # unit tests (vitest)
npm run typecheck
npm run lint
npm run test:e2e    # builds, then Playwright against the production build
```

Node 22.13 or newer: SQLite is Node's own module. `backend/` is framework-free and imported by the app only through `@/backend`.

## Licence

AGPL-3.0-only.
