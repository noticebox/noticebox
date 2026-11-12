# REST API

noticebox has a REST API under `/api/v1` for scripts. [MCP](mcp.md) is the main interface, and the API follows it: every operation does what one MCP tool does, over the same data and rules, and the API never has a feature MCP lacks. The answers are plain JSON, without the `next` hints the tools give an assistant.

The description is OpenAPI 3.1. The instance serves it at `/api/v1/openapi.json`, and the repository commits it as [`openapi.json`](https://github.com/noticebox/noticebox/blob/main/openapi.json).

## Tokens

Every request carries a bearer token: `Authorization: Bearer <token>`. Without one, or with one that isn't valid, the answer is `401` with a `WWW-Authenticate` header that points to `/.well-known/oauth-protected-resource/api/v1`.

**API tokens** are for scripts that run on their own. Make one under *Your settings* → *API tokens*, or ask an assistant to make one over MCP (`create_api_token`). Every token:

- belongs to you and acts as you: what it does is recorded under your name;
- has a name, and a scope: *read only*, which may only `GET` and gets `403` on any change, or *read and write*;
- expires after 90 days by default, 1 to 365 days if you choose, or never when you choose that explicitly;
- starts with `nbx_`, is shown once and stored only as a hash, and lists its last use;
- can be revoked under *Your settings* or with `revoke_api_token`, and is refused from the next request on;
- works on `/api/v1` only, never on `/mcp` and never as a browser session.

A token made over MCP passes through the chat: ask for one there only when that's fine, and revoke it when the script no longer needs it.

**OAuth** works for a script that can open a browser once. It signs in as an MCP client does ([How the OAuth works](mcp.md#how-the-oauth-works)), but registers for and asks for the resource `<NOTICEBOX_BASE_URL>/api/v1`. The access token it gets is bound to the API: it is refused on `/mcp`, and an `/mcp` token is refused here.

```sh
curl -H "Authorization: Bearer $NOTICEBOX_TOKEN" https://inbox.example.org/api/v1/submissions?form=contact
```

## Operations

| Operation | MCP tool |
|---|---|
| `GET /forms` | `list_forms` |
| `GET /forms/{name}` | `get_form` |
| `PUT /forms/{name}` | `put_form` |
| `DELETE /forms/{name}` | `delete_form` |
| `POST /boxes` | `create_box` |
| `PATCH /boxes/{name}` | `rename_box` |
| `DELETE /boxes/{name}` | `delete_box` |
| `GET /submissions` | `list_submissions` |
| `GET /submissions/{id}` | `get_submission` |
| `POST /submissions/{id}/notes` | `add_note` |
| `POST /submissions/{id}/decisions` | `decide` |
| `GET /export` | `export` |
| `GET /connections` | `list_connections` |
| `DELETE /connections/{id}` | `revoke_connection` |
| `GET /tokens` | `list_api_tokens` |
| `POST /tokens` | `create_api_token` |
| `DELETE /tokens/{id}` | `revoke_api_token` |

Each one's parameters and answers are in `openapi.json`. Every error is `{"error": "...", "code": "..."}`, with one of these codes: `invalid_input` (400), `unauthorized` (401), `forbidden` (403, a read-only token) or `not_found` (404).
