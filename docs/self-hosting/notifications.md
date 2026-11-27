# Notifications

A notification says that something happened and where to look, never what it says: a topic at ntfy.sh, a webhook and a mail travel through other people's servers, and the content stays in the box behind the login.

## ntfy

```json
"notify": [{ "type": "ntfy", "url": "https://ntfy.sh/${NTFY_TOPIC}" }]
```

A post to the topic with the title *New report: <form title>*, the link to the submission as the text and as the click action, priority 4 and a mailbox tag. The topic's name is the secret; keep it in the environment and reference it with `${…}`.

### A push can be lost

ntfy delivers on a best-effort basis, and a push that never arrives is never repeated. noticebox posts each arrival once, and a post that ntfy.sh accepts counts as sent: the log names only posts that failed. Two ways a push gets lost in practice:

- **iOS:** while the phone is offline, Apple's push service keeps only the latest pending notification per app, so of several posts only the last one arrives.
- **ntfy.sh's cache:** messages are kept for 12 hours. After that, the app can't fetch a push it missed.

A self-hosted ntfy server with a longer cache lets the app fetch missed messages later (on iOS it still needs an upstream server to wake the app). What makes sure nothing is missed is the inbox itself: look at what is open, or let your monitoring alert when a submission waits too long.

## Mail

```json
"notify": [{ "type": "mail", "to": "you@example.org" }]
```

A mail for each new submission, sent through the mail server that sign-in uses (`NOTICEBOX_SMTP_URL`, `NOTICEBOX_SMTP_FROM`). It's a second path next to ntfy, in case a push is lost. The subject is *New report: <form title>* and the text is the link to the submission; no field, file name or sender is in it.

`to` must be an address on `NOTICEBOX_ALLOWED_EMAILS` (or in a domain listed there), so a form can never mail a stranger. A form whose mail target names anyone else can't be saved, and neither can one with a mail target while no SMTP is set. If an address is later taken off the list, its mail is skipped and the log says so. Decisions and test posts are not mailed. The log names a failed mail as `mail`, without the address.

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

It names the two states, never the reason or who decided: both stay in the history, behind the login. The post goes out after the decision is stored and never delays or fails it. This is how another service picks up a case once a person has decided on it (moved it to an "accepted" state, say) and reads it with an API token: the person's decision starts it, and the content leaves only through that read. Posts are not retried, and two quick decisions may arrive in either order: `at` says which came first. ntfy announces arrivals only.

The form's *Settings* tab sets a webhook's events too (new submissions, decisions or both).

## Test posts

A post with the [`_test` hint](../integrations/forms.md#a-plain-form) is checked and stored like any other, so a site can check in CI that its form reaches the inbox. Webhooks get it, with `"test": true` in the body. ntfy doesn't: a site's checks post several times a day, and on the phone they would bury the real submissions. The log says so for each target it skips (`notify <form> <id> ntfy <host>: skipped, a test post`), so nothing looks lost.

An ntfy target that should get test posts says so with `tests`:

```json
"notify": [{ "type": "ntfy", "url": "https://ntfy.sh/${NTFY_TOPIC}", "tests": true }]
```

Then the push says it is a test: the title starts with *Test:*, the priority is 1 (no sound or vibration) and the tag is a test tube. In the form's settings this is the *test posts too* box next to an ntfy target.

Any number of targets can be set on a form, on its *Settings* tab or in the file. A notification that fails is logged and never delays or fails the submission: the answer to the poster goes out first.

## Certificates

ntfy and webhook calls verify TLS against the image's certificate store, the operating system's, not only the list built into Node. A target whose certificate comes from your own CA (an internal ntfy behind a corporate root, say) works once that CA is in the store: mount its certificate, PEM-encoded with a `.crt` name, into `/usr/local/share/ca-certificates/`, and the container adds it at start.

```yaml
    volumes:
      - ./my-root-ca.crt:/usr/local/share/ca-certificates/my-root-ca.crt:ro
```

Checking is never switched off.
