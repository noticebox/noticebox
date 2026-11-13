# 0007: Files that come with a submission are kept in the database

- Status: accepted
- Date: 2026-11-12

## Context and Problem Statement

Up to 0.19.0, noticebox takes text fields only. Some forms need a file: an order for a 3D print wants the model (STL, 3MF) and a photo, a bug report a screenshot. The page then asks people to send the file by e-mail afterwards, which splits one request into two and is easily forgotten (#101).

A file is personal data like a free-text field, so it has to go with the submission: shown in the inbox, handed to MCP and the API, removed by retention, deleted with the record. noticebox is one container with one SQLite file (ADR 0003), and its backups are copies of that file.

## Considered Options

1. Files as BLOBs in a `files` table of the same SQLite file, next to their submission.
2. Files in a directory next to the database, their metadata in a table.
3. Files in S3-compatible object storage.

## Decision Outcome

Option 1, from 0.20.0. A post takes files only through fields described as `file`, each with its kinds (`accept`), a count (`maxFiles`) and a size per file (`maxMegabytes`), all the form's to choose; the body limit of that form grows by what its file fields allow. The files are written in the same transaction as the submission, and removed in the same transaction as the fields retention removes (`Store.sweep`) or the record `deleteAfterDays` deletes (`Store.expire`).

A file's bytes are kept in chunks of 1 MB (`file_chunks`), so neither writing nor reading needs the whole file in memory. A multipart post is read as it arrives (busboy, `multipart.ts`): text fields in memory, each file straight into a temporary file, checked on the way, and cut off as soon as it is too many, of a kind not accepted, or larger than its field allows. Only once the whole post is checked does one short transaction copy the files into the database chunk by chunk; the temporary files go either way. A download streams the chunks back. The MCP tool `get_file` hands over a signed link that works for 15 minutes without signing in, so the bytes need not pass through the model.

Nothing a stranger sent is rendered as part of the inbox: a file is served as `application/octet-stream` with `Content-Disposition: attachment`, `nosniff` and a sandboxing CSP; only PNG, JPEG, GIF, WebP and AVIF are shown inline as pictures, never SVG. The media type the browser claimed is stored as a hint and is never trusted to decide anything else.

### Consequences

- Good: one file to back up, restore and move, as before; a backup holds the files with the submissions they belong to.
- Good: retention and deletion can't leave orphaned files behind, or delete files of a submission that stays.
- Good: no new service or volume to configure.
- Good: a post needs about a megabyte of memory per file in flight, whatever its size, so a large upload can't take the server down.
- Bad: the database grows with every file until retention removes it, and the server's disk holds a post's files while it is checked.
- Bad: the bytes still pass through noticebox both ways. Option 3 with presigned links would avoid that; it is kept as an idea (discussion #104), since retention could then no longer remove a file in the same transaction as its fields.
- Neutral: the export lists files without their bytes; the bytes leave through the inbox, `get_file` or the API.
