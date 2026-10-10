# Configuration

noticebox is configured by environment variables and one JSON file with the forms. The file is edited in the inbox, on each form's *Settings* tab and the box pages, and can be edited by hand as well; noticebox reads it at start and writes it back after each change in the UI, keeping `${VAR}` references as they are. A missing file is created empty at start.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `NOTICEBOX_CONFIG` | `noticebox.json` (`/app/noticebox.json` in the image) | The forms file |
| `NOTICEBOX_DB` | `data/noticebox.sqlite` (`/data/noticebox.sqlite` in the image) | The SQLite file; created at the first start |
| `NOTICEBOX_BASE_URL` | from the request's `X-Forwarded-*` headers | The public URL, used in notifications and as the OAuth issuer. Set it. |
| `NOTICEBOX_USER_HEADER` | `X-Authentik-Username` | The header the login proxy sets with the signed-in person's name |
| `NOTICEBOX_SECRET` | none: no MCP | 32 or more random characters that sign the OAuth tokens |
| `NOTICEBOX_RATE_LIMIT` | `10` | Posts per client address and form in ten minutes; `0` turns it off |
| `NOTICEBOX_TRUST_PROXY` | on | `0` to ignore `X-Forwarded-For` and take the connecting address |
| `NOTICEBOX_DEV_USER` | none | A fixed name standing in for the login, for development. Never in production. |
| `NOTICEBOX_SIGN_OUT_URL` | `/outpost.goauthentik.io/sign_out` | Where *Sign out* in the user menu goes; the Authentik outpost's sign-out by default. Hidden with `NOTICEBOX_DEV_USER`. |
| `PORT` | `3000` | Where it listens |

`${VAR}` inside a string in the forms file is replaced by the variable's value when the file is read, so topics and other secrets stay out of the file. An unset variable is an error at start.

## The forms file

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

`boxes` is an optional list of box names. A box named by a form exists without being listed; the list is for boxes that have no form yet, and the UI maintains it.

### A form

The key is the form's name: lowercase letters, digits, `-` and `_`, up to 40 characters; it is the path of the endpoint, `/f/<name>`.

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
| `notify` | none | A list of targets, `{ "type": "ntfy", "url": … }` or `{ "type": "webhook", "url": … }`, see [Notifications](notifications.md). The older `{ "ntfy": …, "webhook": … }` object is read too. |
| `link` | none | A URL template over the fields, or `{ "url": …, "label": … }`; see below |

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
