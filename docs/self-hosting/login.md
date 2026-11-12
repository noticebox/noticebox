# Sign-in

noticebox signs people in itself, with [Better Auth](https://better-auth.com): a code by email, and any OAuth or OpenID Connect providers you configure. Only the addresses you list get in. The address a person signs in with is the actor of every step they take in the history ([ADR 0002](https://github.com/noticebox/noticebox/blob/main/docs/adr/0002-sign-in-with-better-auth.md)).

## Who may sign in

`NOTICEBOX_ALLOWED_EMAILS` is a comma-separated list of addresses and `@domain` entries:

```sh
NOTICEBOX_ALLOWED_EMAILS=marcel@example.org,@team.example.org
```

Only an address on the list gets in, and only when it is verified: by the code mailed to it, or by a provider that says `email_verified`. An empty list lets nobody in, and the log says so at start. Taking an address off the list stops its next sign-in. A session that is already open runs until it ends or the person signs out.

## Ways to sign in

**By email.** With `NOTICEBOX_SMTP_URL` and `NOTICEBOX_SMTP_FROM` set, the sign-in page asks for an address and mails a code. The same mail also has a link that signs in once. Codes and links are stored only as hashes. An address that is not on the list gets no mail, so nobody can use noticebox to send mail to strangers. When an MCP client is signing in, the mail holds only the code: a link would sign in whichever browser opened it, not the one the client is waiting in.

```sh
NOTICEBOX_SMTP_URL=smtps://inbox%40example.org:app-password@smtp.example.org:465
NOTICEBOX_SMTP_FROM=noticebox <inbox@example.org>
```

**Through a provider.** For each provider, set `NOTICEBOX_OIDC_<NAME>_CLIENT_ID` and `_CLIENT_SECRET`. A generic OpenID Connect provider (Authentik, Keycloak, …) also needs `_ISSUER`, its discovery base. `GITHUB` and `GOOGLE` are built in and need no issuer. `_LABEL` names the button. The provider's callback URL is `<NOTICEBOX_BASE_URL>/api/auth/callback/<name>`, with the name in lowercase.

```sh
NOTICEBOX_OIDC_AUTHENTIK_CLIENT_ID=noticebox
NOTICEBOX_OIDC_AUTHENTIK_CLIENT_SECRET=...
NOTICEBOX_OIDC_AUTHENTIK_ISSUER=https://auth.example.org/application/o/noticebox
NOTICEBOX_OIDC_AUTHENTIK_LABEL=Example login

NOTICEBOX_OIDC_GITHUB_CLIENT_ID=...
NOTICEBOX_OIDC_GITHUB_CLIENT_SECRET=...
```

The sign-in page shows a button for each provider. A provider that refuses a sign-in sends the person back with its error code, which the page shows and the log records. The start fails when there is no way to sign in at all: no SMTP and no provider.

## One person, one address

A person is their verified email address, and the history records that address. What a provider says about a username (`preferred_username`, a GitHub login) counts for nothing, so two providers can't name one person differently.

The address must be verified at every sign-in: by the code mailed to it, or by a provider that sends `email_verified: true`. A provider that sends `false`, or leaves the claim out, gets nobody in. In Authentik, check that the `email` scope mapping sends `email_verified` as true for your users.

A second provider joins the same account only when it reports the same address as verified. Otherwise it is refused, so an address someone typed at a provider never opens another person's account. The history is never rewritten.

## Coming from the login proxy (up to 0.16)

Up to 0.16, a reverse proxy with forward authentication signed people in and passed their name in a header. That header now counts for nothing. Steps recorded before the change keep the name the header carried (`marcel`); steps from now on record the address (`marcel@example.org`). The history is never rewritten. To switch:

1. In Authentik, add an OAuth2/OpenID provider for noticebox with the redirect URI `https://inbox.example.org/api/auth/callback/authentik`, and set the `NOTICEBOX_OIDC_AUTHENTIK_*` variables above. Or skip the provider and sign in by email code.
2. List everyone's address in `NOTICEBOX_ALLOWED_EMAILS`.
3. Remove the forward-auth from the proxy: noticebox is now proxied as a whole, with no paths public or private at the proxy.
4. Remove `NOTICEBOX_USER_HEADER` and `NOTICEBOX_SIGN_OUT_URL` from `.env`.

With Caddy, that leaves:

```caddyfile
inbox.example.org {
    reverse_proxy noticebox:3000
}
```

Every MCP client connects once more, because the connections of the old OAuth server can't be carried over.

## Fails closed

Without a session, noticebox answers `401` to everything that isn't public: a browser gets a link to the sign-in page with it. The public paths check their own credentials, or need none:

```
/f/*   /api/f/*   /health   /mcp   /login   /api/auth/*   /.well-known/*
```

A header such as `X-Authentik-Username` that a proxy or a client sends counts for nothing.

## Where the sign-in data lives

Accounts, sessions and the MCP clients' tokens are in `auth.sqlite`, next to the inbox's database (`/data/auth.sqlite` in the image). Exports and backups of the inbox's database hold none of them. Back it up as well if you want sessions and MCP connections to survive a restore. Without it, everyone just signs in again.

## Signing out

*Sign out* in the user menu ends the session.

## Development

`NOTICEBOX_DEV_USER=you` makes every request that person, without signing in. It is for a machine of your own: the app refuses to start with it when `NODE_ENV=production`, which the image sets.
