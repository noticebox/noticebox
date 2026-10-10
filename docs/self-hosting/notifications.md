# Notifications

A notification says that something arrived and where to look, never what it says: a topic at ntfy.sh and a webhook travel through other people's servers, and the content stays in the box behind the login.

## ntfy

```json
"notify": { "ntfy": "https://ntfy.sh/${NTFY_TOPIC}" }
```

A post to the topic with the title *New report: <form title>*, the link to the submission as the text and as the click action, priority 4 and a mailbox tag. The topic's name is the secret; keep it in the environment and reference it with `${…}`.

## Webhook

```json
"notify": { "webhook": "https://hooks.example.org/noticebox" }
```

A JSON post:

```json
{ "form": "contact", "kind": "message", "id": "kemGIkDjIh9Y", "received_at": "2026-10-10T14:20:11.000Z", "url": "https://inbox.example.org/forms/contact/submissions/kemGIkDjIh9Y" }
```

Both can be set on the same form. A notification that fails is logged and never delays or fails the submission: the answer to the poster goes out first.
