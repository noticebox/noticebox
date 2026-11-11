# Configuration

noticebox is configured by environment variables. The boxes and forms are in the database, next to the submissions: they are made and changed in the inbox (*Add new*, each form's *Settings* tab, the box pages) or over [MCP](../integrations/mcp.md) with `put_form`. A fresh instance starts without forms.

## Environment

Every setting is an environment variable, and in a deployment they all live in one `.env` file next to `compose.yaml`, which reads it with `env_file: .env` and lists none of them itself. Start from the repository's [`.env.example`](https://github.com/noticebox/noticebox/blob/main/.env.example): it lists every variable with what it does, and an unchanged copy keeps the defaults. Keep the file to its owner (`chmod 600`).

| Variable | Default | Meaning |
|---|---|---|
| `NOTICEBOX_DB` | `data/noticebox.sqlite` (`/data/noticebox.sqlite` in the image) | The SQLite file, with the boxes and forms; created at the first start |
| `NOTICEBOX_CONFIG` | `noticebox.json` (`/app/noticebox.json` in the image) | **Deprecated**, and removed in a later release: the forms file of releases before 0.16, imported once on upgrade ([Upgrading](upgrading.md#from-the-forms-file-to-the-database)) |
| `NOTICEBOX_BASE_URL` | from the request's `X-Forwarded-*` headers | The public URL, used in notifications and as the OAuth issuer. Set it. |
| `NOTICEBOX_USER_HEADER` | `X-Authentik-Username` | The header the login proxy sets with the signed-in person's name |
| `NOTICEBOX_SECRET` | none: no MCP | 32 or more random characters that sign the OAuth tokens |
| `NOTICEBOX_RATE_LIMIT` | `10` | Posts per client address and form in ten minutes; `0` turns it off |
| `NOTICEBOX_TRUST_PROXY` | on | `0` to ignore `X-Forwarded-For` and take the connecting address |
| `NOTICEBOX_DEV_USER` | none | A fixed name standing in for the login, for development. Never in production. |
| `NOTICEBOX_SIGN_OUT_URL` | `/outpost.goauthentik.io/sign_out` | Where *Sign out* in the user menu goes; the Authentik outpost's sign-out by default. Hidden with `NOTICEBOX_DEV_USER`. |
| `PORT` | `3000` | Where it listens |
| `PUID`, `PGID` | the owner of the mounted `/data` (1000 if that is root) | Who the server runs as inside the container, so the database belongs to the host user |

`${VAR}` inside a string of a form is stored as written and replaced by the variable's value when the forms are loaded, so topics, webhook URLs and other secrets stay in the environment and out of the database; put those variables in `.env` too. Saving a form that names an unset variable is refused. If a variable a stored form needs is missing at start, the log says so, and a notification that needs it is skipped and logged each time.

## Forms are managed in the inbox

The *Settings* tab edits every part of a form, and `get_form` and `put_form` over MCP read and write it as JSON. That JSON is described here: every change, in the inbox or over MCP, is checked against it as a whole before it is saved, and a mistake is refused with its place named. The example is one form, `notefeed-report`, as `put_form` takes it under its name:

```json
{
  "forms": {
    "notefeed-report": {
      "box": "notefeed.me",
      "kind": "report",
      "title": "Reports about content on notefeed.me",
      "strict": true,
      "fields": {
        "read_id": { "type": "hidden" },
        "note_id": { "type": "hidden" },
        "reason": { "type": "select", "label": "Reason", "required": true, "options": ["Illegal content", "Personal data", "Copyright", "Spam", "Other"] },
        "text": { "type": "textarea", "label": "What is wrong", "required": true, "max": 4000 },
        "email": { "type": "email", "label": "Reporter's email" }
      },
      "states": ["open", "in_review", { "name": "acted_on", "closed": true, "reason": true }, { "name": "rejected", "closed": true, "reason": true }],
      "origins": ["https://notefeed.me"],
      "redirect": "https://notefeed.me/report?sent=1",
      "retentionDays": 1,
      "notify": [{ "type": "ntfy", "url": "https://ntfy.sh/${NTFY_TOPIC}" }],
      "link": { "url": "https://notefeed.me/r/{read_id}/{note_id}", "label": "Open the note" }
    }
  }
}
```

### Boxes

A box exists as soon as a form names it. *Add new* makes an empty one for forms to come, and a box page renames or removes it once it has no forms.

### A form

The key is the form's name: lowercase letters, digits, `-` and `_`, up to 40 characters, starting with a letter or digit; it is the path of the endpoint, `/f/<name>`.

| Key | Default | Meaning |
|---|---|---|
| `kind` | required | `report` or `message`: the preset of states a form starts with, see [States, reasons and kinds](../using/kinds.md) |
| `box` | `forms` | The group the form is listed under in the sidebar |
| `title` | the name | Shown in the inbox and in notifications |
| `thanks` | a generic sentence | The text of the thank-you page at `/f/<name>/thanks` |
| `fields` | none | The described fields, see below. A form takes undescribed fields too unless it is strict; a page can describe its own, see [Posting from a page](../integrations/forms.md#describing-fields-from-the-page) |
| `strict` | `false` | Take only the described fields and refuse any other |
| `states` | the kind's preset | The states, in order, the first being where a submission starts: names, or `{ "name": …, "closed": true, "reason": true }`; see [States, reasons and kinds](../using/kinds.md) |
| `origins` | none: posts from anywhere | Origins posts are accepted from, `https://example.org` each |
| `redirect` | the thank-you page | Where the browser goes after a plain post |
| `retentionDays` | `180` | Days after closing until the personal fields are removed |
| `deleteAfterDays` | none: the anonymised record stays | Days after closing until the submission and its history are deleted entirely; at least `retentionDays`. See [Retention](retention.md) |
| `notify` | none | A list of targets, `{ "type": "ntfy", "url": … }` or `{ "type": "webhook", "url": … }`, see [Notifications](notifications.md). The older `{ "ntfy": …, "webhook": … }` object is read too. |
| `link` | none | A URL template over the fields, or `{ "url": …, "label": … }`; see below |
| `github` | none | The repository issues are opened in, `"owner/name"` or `{ "repo": …, "labels": [ … ] }`; see [GitHub issues](../integrations/github.md) |

### A field

The key is the field's name as the page posts it: lowercase letters, digits and `_`, up to 32 characters; `_gotcha` is reserved for the honeypot.

| Key | Default | Meaning |
|---|---|---|
| `type` | `text` | `text`, `textarea`, `select`, `email` or `hidden` |
| `label` | the name | How the inbox labels it |
| `required` | `false` | A post without it is refused |
| `max` | 500 text, 10 000 textarea, 254 email, 200 select and hidden | Longest accepted value, in characters |
| `options` | required for `select` | The allowed values |
| `personal` | `true` for text, textarea and email; `false` otherwise. An undescribed field is always personal | Removed by retention once the submission is closed and past `retentionDays` |
| `help` | none | A sentence for the person filling the form |

Values are trimmed, line ends normalised, control characters dropped; a value of any type but `textarea` is folded onto one line.

### Link

`link` says where the thing a submission is about can be looked at. It is an `http(s)` URL with `{field}` placeholders, each the name of one of the form's fields, filled in percent-encoded. The inbox shows it on the submission, in the table, and the MCP tools carry it as `link`. The `label` is the link's text, `Open` by default. A submission whose placeholder fields are empty, because retention removed them, shows no link; ids are usually `personal: false` and stay, as `hidden` fields are by default.
