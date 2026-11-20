# Notifications

A notification says that something happened and where to look, never what it says: a topic at ntfy.sh and a webhook travel through other people's servers, and the content stays in the box behind the login.

## ntfy

```json
"notify": [{ "type": "ntfy", "url": "https://ntfy.sh/${NTFY_TOPIC}" }]
```

A post to the topic with the title *New report: <form title>*, the link to the submission as the text and as the click action, priority 4 and a mailbox tag. The topic's name is the secret; keep it in the environment and reference it with `${…}`.

## Webhook

```json
"notify": [{ "type": "webhook", "url": "https://hooks.example.org/noticebox" }]
```

A JSON post when a submission arrives:

```json
{ "event": "received", "form": "contact", "kind": "message", "id": "kemGIkDjIh9Y", "received_at": "2026-10-10T14:20:11.000Z", "url": "https://inbox.example.org/forms/contact/submissions/kemGIkDjIh9Y" }
```

### Decisions

A webhook can also be told about every decision: a submission moved to another state, in the inbox, over MCP or through the API. It names what it wants in `on`:

```json
"notify": [{ "type": "webhook", "url": "https://hooks.example.org/noticebox", "on": ["decided"] }]
```

`on` lists `received` (a submission arrived) and `decided` (a decision); without it a webhook gets arrivals only, as it always did. A decision posts:

```json
{ "event": "decided", "form": "contact", "kind": "message", "id": "kemGIkDjIh9Y", "from": "new", "to": "answered", "at": "2026-10-11T08:02:40.000Z", "url": "https://inbox.example.org/forms/contact/submissions/kemGIkDjIh9Y" }
```

It names the two states, never the reason or who decided: both stay in the history, behind the login. The post goes out after the decision is stored and never delays or fails it. This is how another service picks up a case once a person has decided on it (moved it to an "accepted" state, say) and reads it with an API token: the person's decision starts it, and the content leaves only through that read. ntfy announces arrivals only.

The form's *Settings* tab sets a webhook's events too (new submissions, decisions or both).

## Test posts

A post with the [`_test` hint](../integrations/forms.md#a-plain-form) is stored and announced like any other, so a site can check in CI that its form reaches the inbox and the phone. Its announcement says it is a test: the ntfy title starts with *Test:*, the priority is 1 (no sound or vibration) and the tag a test tube; a webhook's body carries `"test": true`.

Any number of targets can be set on a form, on its *Settings* tab or in the file. A notification that fails is logged and never delays or fails the submission: the answer to the poster goes out first.

## Certificates

ntfy and webhook calls verify TLS against the image's certificate store, the operating system's, not only the list built into Node. A target whose certificate comes from your own CA (an internal ntfy behind a corporate root, say) works once that CA is in the store: mount its certificate, PEM-encoded with a `.crt` name, into `/usr/local/share/ca-certificates/`, and the container adds it at start.

```yaml
    volumes:
      - ./my-root-ca.crt:/usr/local/share/ca-certificates/my-root-ca.crt:ro
```

Checking is never switched off.
