# Notifications

A notification says that something arrived and where to look, never what it says: a topic at ntfy.sh and a webhook travel through other people's servers, and the content stays in the box behind the login.

## ntfy

```json
"notify": [{ "type": "ntfy", "url": "https://ntfy.sh/${NTFY_TOPIC}" }]
```

A post to the topic with the title *New report: <form title>*, the link to the submission as the text and as the click action, priority 4 and a mailbox tag. The topic's name is the secret; keep it in the environment and reference it with `${…}`.

## Webhook

```json
"notify": [{ "type": "webhook", "url": "https://hooks.example.org/noticebox" }]
```

A JSON post:

```json
{ "form": "contact", "kind": "message", "id": "kemGIkDjIh9Y", "received_at": "2026-10-10T14:20:11.000Z", "url": "https://inbox.example.org/forms/contact/submissions/kemGIkDjIh9Y" }
```

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
