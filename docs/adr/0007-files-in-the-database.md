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

Option 1, from 0.20.0. A post takes files only through fields described as `file`, each with its kinds (`accept`), a count (`maxFiles`, at most 10) and a size per file (`maxMegabytes`, at most 25); the body limit of that form grows by what its file fields allow. The files are written in the same transaction as the submission, and removed in the same transaction as the fields retention removes (`Store.sweep`) or the record `deleteAfterDays` deletes (`Store.expire`).

Nothing a stranger sent is rendered as part of the inbox: a file is served as `application/octet-stream` with `Content-Disposition: attachment`, `nosniff` and a sandboxing CSP; only PNG, JPEG, GIF, WebP and AVIF are shown inline as pictures, never SVG. The media type the browser claimed is stored as a hint and is never trusted to decide anything else.

### Consequences

- Good: one file to back up, restore and move, as before; a backup holds the files with the submissions they belong to.
- Good: retention and deletion can't leave orphaned files behind, or delete files of a submission that stays.
- Good: no new service or volume to configure.
- Bad: the database grows with every file until retention removes it, and SQLite reads a BLOB whole into memory. The per-field limits (25 MB per file, 10 files) keep one post at most a few hundred MB; a form that takes many large files would want option 2 or 3.
- Bad: a file is read whole into memory on the way in (the multipart body is read capped, then parsed) and on the way out.
- Neutral: the export lists files without their bytes; the bytes leave through the inbox, `get_file` or the API.
