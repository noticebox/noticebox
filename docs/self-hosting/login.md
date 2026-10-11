# The login in front

noticebox has no accounts. A reverse proxy with forward authentication puts the login in front of the inbox and tells noticebox, in a header, who is signed in. That name is the actor of every step in the history.

## What must be public

The endpoint, the thank-you page, the health check, the MCP endpoint and its OAuth paths check for themselves and must bypass the login:

```
/f/*   /health   /mcp   /oauth/token   /oauth/register   /.well-known/*
```

Everything else, the inbox and the OAuth authorize page included, must go through the login, and the proxy must pass the person's name in the header named by `NOTICEBOX_USER_HEADER` (`X-Authentik-Username` by default).

## Fails closed

Without the header, noticebox answers `401` to everything that is not public. A deployment that forgot the proxy, or a proxy that forgot the header, shows nothing rather than everything. The proxy must also drop that header when a client sends it itself, so nobody can claim a name.

## Caddy and Authentik

With Caddy and an Authentik proxy outpost (a forward-auth provider in *forward single* mode whose external host is the inbox's name):

```caddyfile
inbox.example.org {
    @public path /f/* /health /mcp /oauth/token /oauth/register /.well-known/*
    handle @public {
        request_header -X-Authentik-Username
        reverse_proxy noticebox:3000
    }
    handle {
        request_header -X-Authentik-Username
        reverse_proxy /outpost.goauthentik.io/* authentik-server:9000
        forward_auth authentik-server:9000 {
            uri /outpost.goauthentik.io/auth/caddy
            copy_headers X-Authentik-Username
        }
        reverse_proxy noticebox:3000
    }
}
```

!!! note "The outpost must know the provider"
    A new proxy provider is answered by Authentik's embedded outpost only when it is in that outpost's list of providers. Without it the host answers `404` instead of sending to the login.

Any other forward-auth setup works the same way: one public set of paths, the rest behind the login, a header with the name.

## Signing out

*Sign out* in the user menu goes to `NOTICEBOX_SIGN_OUT_URL`, the Authentik outpost's `/outpost.goauthentik.io/sign_out` by default, which the proxy serves on the inbox's host. Another forward-auth setup names its own sign-out there.

## Development

`NOTICEBOX_DEV_USER=you` stands in for the proxy and makes every request that person. It is for a machine of your own and must never be set in production.
