// Serving a file that came with a submission. A stranger chose its name, its bytes and its media type, so it is never
// rendered as a page of the inbox: everything is a download, except the common photo formats, which the inbox shows as
// pictures, and even those are sandboxed and never sniffed into something else. SVG is not among them: it can carry
// script.
import type { StoredFile } from "./db";
import type { Runtime } from "./runtime";

const SHOWN = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);

/** Whether the inbox may show the file as a picture instead of offering it as a download. */
export const isPicture = (f: Pick<StoredFile, "type">): boolean => SHOWN.has(f.type);

/**
 * The file as an HTTP answer, or null when there is none (or it belongs to another submission than `submissionId`).
 * `inline` asks to show a picture rather than download it; anything else is a download either way.
 */
export function fileResponse(rt: Runtime, id: string, opts: { submissionId?: string; inline?: boolean } = {}): Response | null {
  const f = rt.store.file(id);
  if (!f || (opts.submissionId !== undefined && f.submission_id !== opts.submissionId)) return null;
  const inline = Boolean(opts.inline) && isPicture(f);
  // RFC 6266: an ASCII fallback for old clients, and the real name UTF-8 encoded.
  const ascii = f.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(f.data as BodyInit, {
    headers: {
      "content-type": inline ? f.type : "application/octet-stream",
      "content-length": String(f.data.byteLength),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "private, no-store",
    },
  });
}
