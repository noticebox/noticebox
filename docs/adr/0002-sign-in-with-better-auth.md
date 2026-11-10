# 0002: Sign-in with Better Auth, several providers and an email allowlist

- Status: accepted
- Date: 2026-11-10

## Context and Problem Statement

Up to 0.10.0, the reverse proxy (Authentik forward-auth) signs people in and tells noticebox the username in a header, which noticebox trusts. For MCP, noticebox runs an OAuth 2.1 server of its own: dynamic client registration, PKCE and HMAC-signed tokens. Both conflict with the Sign-in convention, which rules out trusting a forwarded user id and hand-written OAuth code (#28). A proxy that passes the header through unchecked would hand anyone the inbox, and the OAuth code is security code we would keep maintaining alone. A REST API (#47) would need yet another kind of token.

## Considered Options

1. Keep the proxy header and the own OAuth server, and add a proxy-login case to the convention.
2. Better Auth with its own sign-in methods (passkeys, email codes), no external provider.
3. Better Auth, signing in through one or more OAuth/OIDC providers (Authentik, GitHub, Google), with `@better-auth/mcp` for MCP clients.

## Decision Outcome

Option 3.

- **Providers** come from env vars, one set per provider: `NOTICEBOX_OIDC_<NAME>_CLIENT_ID`, `_CLIENT_SECRET`, `_ISSUER` for a generic OIDC provider, and an optional `_LABEL`, as the Better Auth convention names them. `GITHUB` and `GOOGLE` use Better Auth's built-in providers and need no issuer.
- **Who may sign in** is `NOTICEBOX_ALLOWED_EMAILS`, a list of addresses and `@domain` entries. An empty list lets nobody in. A provider like GitHub lets anyone finish a sign-in, so the provider can't decide this.
- **A person is one account with one username.** The first sign-in's claim sets the username, so Authentik's `marcel` stays `marcel` and the history recorded before the change still matches. A further provider joins an account only with the same verified email. Events keep recording the username as text, and history is never rewritten. `form` is reserved for intake.
- **Forward-auth is no longer needed.** `proxy.ts` checks for a Better Auth session and still fails closed. `NOTICEBOX_USER_HEADER` and `NOTICEBOX_SIGN_OUT_URL` go away.
- **MCP clients** sign in through `@better-auth/mcp`, with tokens bound to `/mcp`.
- **API tokens** exist from the start, rather than when the first headless script appears. Each belongs to a person and has:
  - a name, a `read` or `read+write` scope, and an expiry (90 days by default, at most a year, or none when chosen explicitly)
  - hashed storage: the token is shown once, and it is revocable
  - REST only: it fails on `/mcp`, as an MCP token fails on REST

  They are created, listed and revoked in *Your settings* and also over MCP. Creating one over MCP is a deliberate choice: the person asks for it in the chat and takes the token from there.
- **Sign-in data lives in its own `auth.sqlite`,** so exports and backups of the inbox hold no sessions or tokens.
- **Tests and dev:** e2e tests create a user and a session through Better Auth's server API before they run, with no OAuth and no test-only way into the app. `NOTICEBOX_DEV_USER` keeps local development free of a provider, and the app refuses to start with it in production.

### Consequences

- Good: noticebox no longer depends on a proxy configured correctly in front of it. A forged header does nothing.
- Good: the hand-written OAuth server and token code go away. Sessions, account linking and MCP OAuth are Better Auth's, maintained upstream.
- Good: self-hosters need only an OAuth app at a provider, not a forward-auth proxy.
- Good: REST, MCP and the browser each have their own credentials, and a token leaked from one doesn't open another.
- Bad: a bigger change than keeping the header, and a dependency whose upgrades can touch sign-in.
- Bad: every MCP client must reconnect once, because the old grants can't be carried over.
- Bad: the allowlist is one more thing to configure, and a typo locks a person out.
- Bad: an API token created over MCP passes through the chat, the one place the Secrets convention otherwise keeps credentials out of. The person chooses that when they ask for it, and can revoke the token at any time.
- Bad: usernames come from the first provider's claim. A person whose first sign-in is through a different provider than before gets a different name, unless their email links them to the existing account.
