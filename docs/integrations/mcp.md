# MCP

noticebox has an MCP endpoint at `/mcp`, so an assistant can read, annotate and decide submissions, in the name of the person who allowed it. Everything it does is in the history as *name via client*.

## Connecting

In Claude Code:

```sh
claude mcp add --transport http noticebox https://inbox.example.org/mcp
```

The client registers itself, the browser opens the authorize page, which is behind the same login as the inbox, and *Allow* sends the client its token. Tokens are signed with `NOTICEBOX_SECRET`; without that setting the endpoint does not exist.

## Tools

| Tool | What it does |
|---|---|
| `list_forms` | The forms with their kinds and states |
| `list_submissions` | Submissions, filtered by form, state or open/closed; each with its summary, its URL in the inbox and its link |
| `get_submission` | One submission with its fields and history |
| `add_note` | A note on a submission |
| `decide` | A move to another state, with the reason; refused like in the UI when the reason is missing or the move is not allowed |

A summary carries `link`, the form's link template filled in, so an assistant can look at what a report is about before suggesting a decision.

## How the OAuth works

noticebox is its own authorization server: RFC 8414 and RFC 9728 metadata under `/.well-known/`, dynamic client registration at `/oauth/register`, the code flow with PKCE at `/oauth/authorize` and `/oauth/token`, rotating refresh tokens. Access tokens last an hour, refresh tokens thirty days, and every token is bound to this instance's `/mcp` as its audience. The authorize page is the only step that needs the login proxy; the rest checks for itself and must be public, see [The login in front](../self-hosting/login.md).
