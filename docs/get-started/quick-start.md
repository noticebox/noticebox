# Quick start

This runs noticebox on your machine, makes one form, posts a submission to it and shows it in the inbox. It takes a few minutes.

## 1. Run it

In a new folder, save this `compose.yaml`: noticebox, and [Mailpit](https://mailpit.axllent.org/), which catches the sign-in mail on your machine instead of sending it:

```yaml
# compose.yaml
services:
  noticebox:
    image: ghcr.io/noticebox/noticebox:main
    env_file: .env
    volumes:
      - ./data:/data
    ports:
      - "127.0.0.1:3000:3000"
  mailpit:
    image: axllent/mailpit
    ports:
      - "127.0.0.1:8025:8025"
```

and a `.env` with the settings; [`.env.example`](https://github.com/noticebox/noticebox/blob/main/.env.example) lists them all:

```sh
# .env
NOTICEBOX_BASE_URL=http://localhost:3000
# Fill in 32 or more random characters: openssl rand -base64 48
NOTICEBOX_SECRET=
NOTICEBOX_ALLOWED_EMAILS=you@example.org
NOTICEBOX_SMTP_URL=smtp://mailpit:1025
NOTICEBOX_SMTP_FROM=noticebox <inbox@example.org>
```

```sh
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000) and sign in as `you@example.org`. The code, and a link that signs you in, are in the mail at [http://localhost:8025](http://localhost:8025). Only the addresses in `NOTICEBOX_ALLOWED_EMAILS` get in: see [Sign-in](../self-hosting/login.md).

## 2. Make a form

A fresh instance has no forms. Choose **Add new**, then *Form*: name it `contact`, put it in a new box `example.org`, choose the kind *Message* and the title *Contact*, and create it.

A form has a name (its endpoint, `/f/contact`), belongs to a box (the sidebar groups forms by it), has a kind (`message` or `report`) and fields. It starts without fields: the first submission brings them. Everything else has a default, changed on the form's *Settings* tab; [Configuration](../self-hosting/configuration.md#forms-are-managed-in-the-inbox) lists all of it. An assistant can make the same form over [MCP](../integrations/mcp.md) with `put_form`.

## 3. Post a submission

As a page would, with a plain form post:

```sh
curl -i -X POST http://localhost:3000/f/contact \
  -d name=Ann -d email=ann@example.org -d "message=Hello there"
```

The answer is a `303` to the thank-you page. As a script would, with JSON:

```sh
curl -i -X POST http://localhost:3000/f/contact \
  -H 'content-type: application/json' \
  -d '{"name":"Ann","email":"ann@example.org","message":"Hello there"}'
```

The answer is `201` with `{"id": "..."}`.

## 4. See it in the inbox

Back in the inbox, the sidebar lists the box `example.org` with the form *Contact* and one open message. *Submissions* shows the message; its state badge is a dropdown: choose **Mark as answered**, write a note, confirm. The history on the submission's page records who did it, when and what they wrote.

## What next

- Put a form on a real page and name the page's origin in the form's `origins`: [Posting from a page](../integrations/forms.md).
- Mail sign-in codes through a real SMTP server, or add a provider such as GitHub: [Sign-in](../self-hosting/login.md).
- Get a ping when something arrives: [Notifications](../self-hosting/notifications.md).
