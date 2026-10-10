# Quick start

This runs noticebox on your machine with one form, posts a submission to it and shows it in the inbox. It takes a few minutes.

## 1. The forms file

noticebox reads its forms from one JSON file. Save this as `noticebox.json`:

```json
{
  "forms": {
    "contact": {
      "box": "example.org",
      "kind": "message",
      "title": "Contact",
      "fields": {
        "name": { "label": "Name", "required": true },
        "email": { "type": "email", "label": "Email", "required": true },
        "message": { "type": "textarea", "label": "Message", "required": true }
      }
    }
  }
}
```

A form has a name (`contact`), belongs to a box (the sidebar groups forms by it), has a kind (`message` or `report`) and fields. Everything else has a default; [Configuration](../self-hosting/configuration.md) lists all of it. You can also start without the file: noticebox creates an empty one, and *Add new* in the inbox makes boxes and forms.

## 2. Run it

```yaml
# compose.yaml
services:
  noticebox:
    image: ghcr.io/noticebox/noticebox:0.3.0
    environment:
      NOTICEBOX_BASE_URL: http://localhost:3000
      # Only for trying it out: in production the login proxy says who is signed in.
      NOTICEBOX_DEV_USER: you
    volumes:
      - ./noticebox.json:/app/noticebox.json:ro
      - ./data:/data
    ports:
      - "127.0.0.1:3000:3000"
```

```sh
docker compose up -d
```

`NOTICEBOX_DEV_USER` stands in for the login. Without it, and without the header a login proxy sets, the inbox answers 401 to everyone; that is how it is meant to run, see [The login in front](../self-hosting/login.md).

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

Open [http://localhost:3000](http://localhost:3000). The sidebar lists the box `example.org` with the form *Contact* and one open message. *Submissions* shows the message; its state badge is a dropdown: choose **Mark as answered**, write a note, confirm. The history on the submission's page records who did it, when and what they wrote.

## What next

- Put a form on a real page and name the page's origin in the form's `origins`: [Posting from a page](../integrations/forms.md).
- Put the login proxy in front and drop `NOTICEBOX_DEV_USER`: [The login in front](../self-hosting/login.md).
- Get a ping when something arrives: [Notifications](../self-hosting/notifications.md).
