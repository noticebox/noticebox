# Posting from a page

A page posts to `https://<your noticebox>/f/<form>`. noticebox hosts no form pages of its own: the page is yours, in your site's look, and noticebox is the endpoint and the inbox behind it.

## A plain form

```html
<form method="post" action="https://inbox.example.org/f/contact">
  <input name="name" required>
  <input name="email" type="email" required>
  <textarea name="message" required></textarea>
  <input name="_gotcha" style="position:absolute;left:-10000px" tabindex="-1" autocomplete="off">
  <button>Send</button>
</form>
```

- Any field name a page posts is taken (lowercase letters, digits and `_`, up to 50 fields, 10 000 characters each), unless the form is **strict**, which refuses fields the form does not describe. A field the form describes is checked as described: required, a select's options, an email address, a length.
- `_gotcha` is the honeypot: a bot that fills the field nobody sees gets the same answer as everyone and nothing is stored.
- `_test` (any value) marks a test post, a site's own check that its form still gets through. It is checked, stored and announced like any other post, but announced as a test: quietly and labelled, see [Notifications](../self-hosting/notifications.md#test-posts). Close it afterwards, by hand or through the [REST API](api.md).
- After a post the browser goes to the form's `redirect`, or to the small thank-you page noticebox serves at `/f/<form>/thanks` when there is none. Set `redirect` to a page of your site.
- A refused post (a required field missing, a value too long, an address that is not one) sends the browser back to the page it came from, with `?error=…` for each problem and the typed values as query parameters, so the page can show both. This happens only when the page's origin is one the form accepts; otherwise the answer is `400` with the problems as text.

## With JavaScript

```js
const res = await fetch("https://inbox.example.org/f/contact", {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json" },
  body: JSON.stringify({ name, email, message }),
});
if (res.status === 201) { /* {"id": "..."} */ }
if (res.status === 400) { const { errors } = await res.json(); /* ["Email is not an email address"] */ }
```

The preflight is answered for the form's `origins`. Strings, numbers and booleans are taken; anything else is dropped.

## Answers

| Status | Meaning |
|---|---|
| `201` | Stored; the body is `{"id": "…"}` (JSON posts) |
| `303` | Stored; the browser is sent on (plain posts) |
| `400` | Refused: `{"errors": […]}`, or a redirect back to the page with `?error=` |
| `403` | The post came from an origin the form does not accept |
| `404` | No such form |
| `413` | The body is larger than 64 KB |
| `415` | Neither a form post nor JSON |
| `429` | Too many posts from one address; `Retry-After` says when to try again |

## Where posts are accepted from

A form with `origins` (`["https://example.org"]`) takes posts only from those origins, judged by the `Origin` header or, for a plain form post without one, the `Referer`. Scripts on those origins get CORS headers. A form without `origins` takes posts from anywhere and answers CORS for everyone.

## Limits

Each client address may post ten times per form in ten minutes (`NOTICEBOX_RATE_LIMIT`). A body is at most 64 KB, plus what the form's `file` fields allow (`maxFiles` × `maxMegabytes` each). Each field has a `max` length, by type: 500 for text, 10 000 for a textarea, 254 for an email.

## Files

A form takes files through the fields described as `file` in its [settings](../self-hosting/configuration.md#a-field), never under any other name: a file posted under another name is dropped, and refused on a `strict` form. The page posts `multipart/form-data`:

```html
<form action="https://inbox.example.org/f/order" method="post" enctype="multipart/form-data">
  <input name="name" required>
  <input type="file" name="model" accept=".stl,.3mf,image/*" multiple>
  <button>Send</button>
</form>
```

A script sends the same with `fetch(url, { method: "POST", body: new FormData(form) })`; a JSON post can't carry files. Too many files, a file too large, of a kind the field doesn't `accept`, or empty, are refused by name like any other wrong field, and nothing of that post is stored.

The file's name and bytes are kept with the submission; the media type the browser sends is only a hint. The inbox shows the common photo formats (PNG, JPEG, GIF, WebP, AVIF) as pictures and offers everything else as a download, never as a page. Notifications don't mention files, as they don't mention any content. The MCP tool `get_file` and `GET /api/v1/submissions/{id}/files/{file}` hand a file over; the [export](../self-hosting/retention.md#export) lists files without their bytes.

How many files and how large is the form's to choose. A post is read as it arrives: each file goes into a temporary file (`NOTICEBOX_UPLOAD_DIR`) and is cut off as soon as it breaks its field's rule, and the bytes are stored and served in chunks of a megabyte, so memory doesn't grow with the size of a post. A reverse proxy in front must let a body as large as the form allows through.

## Describing fields from the page

The page can say what noticebox should know about its fields, in hidden fields named with an underscore, so nobody has to describe them in the inbox:

```html
<input type="hidden" name="_required" value="reason text">
<input type="hidden" name="_public" value="read_id note_id">
<input type="hidden" name="_label_text" value="What is wrong">
<input type="hidden" name="_next" value="https://example.org/thanks">
```

| Hint | Meaning |
|---|---|
| `_required` | Field names, separated by spaces or commas, that a post must carry; a missing one is refused with its label |
| `_personal` | Fields that hold personal data and go when the submission is closed and the retention has passed. Every undescribed field is personal anyway; this makes it explicit |
| `_public` | Fields that are not personal and stay, such as the ids of the thing reported |
| `_label_<field>` | The label the inbox shows for `<field>` |
| `_next` | Where the browser goes after a plain post, instead of the form's `redirect`; only an address on one of the form's `origins` is taken |

What a page says about a field is saved with the form the first time that field arrives, and shown on the form's *Settings* tab. It never changes a description that is already there, so a post cannot talk a form out of what you set; and a strict form learns nothing. Underscore fields are never stored.

## Carrying ids into a form

A page that reports a specific thing, as notefeed's `/report` does for a note, puts the ids into hidden fields and the form's [`link`](../self-hosting/configuration.md#link) turns them back into a URL in the inbox.

```html
<input type="hidden" name="read_id" value="…">
<input type="hidden" name="note_id" value="…">
```
