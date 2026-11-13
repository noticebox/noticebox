// A multipart post read as it arrives (ADR 0007). Text fields are kept in memory; each file goes straight into a file of
// its own in a temporary folder, checked as it comes: a part that is not a file field, of a kind the field doesn't
// accept, or one file too many is refused before its bytes are read, and a file that grows past its field's size is
// cut off there, with the rest of the post never read. So a post of any size needs about as much memory as one chunk
// of it, and nothing goes into the database until the whole post has been checked (intake.ts).
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";
import busboy from "busboy";
import type { Field, Form } from "./config";

/** A file of the post, checked and waiting in the temporary folder. */
export type Received = { field: string; name: string; type: string; size: number; path: string };

/** What came with the post: its text fields, its files, and what is wrong with the files. */
export type Multipart = { fields: Record<string, string>; files: Received[]; errors: string[]; dir: string };

class Limit extends Error {}

/** Counts the bytes passing through and fails once there are more than `max`. */
function counter(max: number, onTooMany: () => Error): Transform & { bytes: number } {
  const t = new Transform({
    transform(chunk: Buffer, _enc, done: TransformCallback) {
      t.bytes += chunk.byteLength;
      if (t.bytes > max) done(onTooMany());
      else done(null, chunk);
    },
  }) as Transform & { bytes: number };
  t.bytes = 0;
  return t;
}

/**
 * Reads a multipart post for `form` into `uploadDir`. The answer is "too large" when the whole post is larger than
 * `limit`, and "not a form" when it can't be read; the caller removes `dir` once it is done with the files.
 */
export async function readMultipart(req: Request, form: Form, limit: number, uploadDir: string): Promise<Multipart | "too large" | "not a form"> {
  if (!req.body) return "not a form";
  let bb: busboy.Busboy;
  try {
    bb = busboy({ headers: Object.fromEntries(req.headers), limits: { fieldSize: limit }, preservePath: true });
  } catch {
    return "not a form";
  }
  const dir = await mkdtemp(join(uploadDir, "noticebox-upload-"));
  const fields: Record<string, string> = {};
  const files: Received[] = [];
  const errors: string[] = [];
  const counts: Record<string, number> = {};
  const writing: Promise<void>[] = [];
  const source = Readable.fromWeb(req.body as import("node:stream/web").ReadableStream);
  const total = counter(limit, () => new Limit("too large"));
  let stopped: "too large" | "not a form" | null = null;
  let n = 0;

  const say = (e: string) => {
    if (!errors.includes(e)) errors.push(e);
  };
  /** Stops reading the post: what is wrong so far is the answer, the rest is never read. */
  const stop = () => {
    source.unpipe();
    source.destroy();
    total.destroy();
    bb.destroy();
  };

  bb.on("field", (name, value) => {
    if (!(name in fields)) fields[name] = value;
  });
  bb.on("file", (name, stream, info) => {
    const field: Field | undefined = form.fields[name];
    if (field?.type !== "file" || !field.files) {
      if (form.strict) say(`${name} is not a file field of this form`);
      stream.resume();
      return;
    }
    // A file input left empty still sends a part, without a name and without bytes: that is no file. A part without a
    // name is never taken as one, so it can't be refused for its kind or count either.
    if (!info.filename) {
      stream.resume();
      return;
    }
    const rule = field.files;
    const fileName = safeName(info.filename);
    counts[name] = (counts[name] ?? 0) + 1;
    if (counts[name] > rule.maxFiles) {
      say(`${field.label}: at most ${rule.maxFiles} file${rule.maxFiles === 1 ? "" : "s"}`);
      stream.resume();
      stop();
      return;
    }
    const type = mediaTypeOf(info.mimeType);
    if (!accepted(field, fileName, type)) {
      say(`${field.label}: ${fileName} is not one of the accepted kinds (${rule.accept.join(", ")})`);
      stream.resume();
      return;
    }
    const path = join(dir, String(n++));
    const size = counter(rule.maxBytes, () => new Limit(`${field.label}: ${fileName} is larger than ${megabytes(rule.maxBytes)}`));
    writing.push(
      pipeline(stream, size, createWriteStream(path)).then(
        () => {
          if (size.bytes === 0) say(`${field.label}: ${fileName} is empty`);
          else files.push({ field: name, name: fileName, type, size: size.bytes, path });
        },
        (e: unknown) => {
          if (e instanceof Limit) {
            say(e.message);
            stop();
          }
        },
      ),
    );
  });

  try {
    await pipeline(source, total, bb);
  } catch (e) {
    if (e instanceof Limit) stopped = "too large";
    else if (errors.length === 0) stopped = "not a form";
  }
  await Promise.allSettled(writing);
  if (stopped) {
    await rm(dir, { recursive: true, force: true });
    return stopped;
  }
  // Each field's files in the order they came; the parts may have finished writing in another.
  files.sort((a, b) => Number(a.path.slice(dir.length + 1)) - Number(b.path.slice(dir.length + 1)));
  for (const [name, f] of Object.entries(form.fields))
    if (f.type === "file" && f.required && !files.some((x) => x.field === name) && !errors.some((e) => e.startsWith(`${f.label}:`)))
      errors.push(`${f.label} is required`);
  return { fields, files, errors, dir };
}

/** An extension in `accept` matches the end of the name; a media type matches the browser's, `image/*` any image. */
function accepted(f: Field, name: string, type: string): boolean {
  const accept = f.files?.accept ?? [];
  if (accept.length === 0) return true;
  const lower = name.toLowerCase();
  return accept.some((a) => (a.startsWith(".") ? lower.endsWith(a) : a.endsWith("/*") ? type.startsWith(a.slice(0, -1)) : type === a));
}

export const mediaTypeOf = (type: string): string => (/^[a-z]+\/[a-z0-9.+-]+$/i.test(type) ? type.toLowerCase() : "application/octet-stream");

const megabytes = (bytes: number): string => `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;

/** The file's own name without any path, control characters or quotes, at most 120 characters; "file" when none is left. */
export function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f"]/g, "")
    .trim()
    .slice(-120);
  return cleaned && cleaned !== "." && cleaned !== ".." ? cleaned : "file";
}
