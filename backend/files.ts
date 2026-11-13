// Serving a file that came with a submission. A stranger chose its name, its bytes and its media type, so it is never
// rendered as a page of the inbox: everything is a download, except the common photo formats, which the inbox shows as
// pictures, and even those are sandboxed and never sniffed into something else. SVG is not among them: it can carry
// script. The bytes are streamed from the database a chunk at a time, so a large file never sits in memory whole.
//
// A signed link (`signedFileUrl`) hands one file to whoever holds it for a few minutes, without signing in: that is
// how an MCP client fetches a file without its bytes passing through the model.
import { createHmac, timingSafeEqual } from "node:crypto";
import { actorOf } from "./auth";
import type { StoredFile } from "./db";
import { filePath } from "./paths";
import type { Runtime } from "./runtime";

const SHOWN = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);

/** How long a signed link to a file works. */
export const LINK_MINUTES = 15;

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
  let seq = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      const chunk = rt.store.chunk(f.id, seq++);
      if (chunk) c.enqueue(chunk);
      else c.close();
    },
  });
  return new Response(body, {
    headers: {
      "content-type": inline ? f.type : "application/octet-stream",
      "content-length": String(f.size),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "private, no-store",
    },
  });
}

/** A file's whole bytes, for the MCP tool that shows a small picture to the model. */
export function fileBytes(rt: Runtime, id: string): Uint8Array {
  const parts: Uint8Array[] = [];
  for (let seq = 0, c = rt.store.chunk(id, 0); c; c = rt.store.chunk(id, ++seq)) parts.push(c);
  return Buffer.concat(parts);
}

const sign = (rt: Runtime, id: string, exp: number): string =>
  createHmac("sha256", rt.signIn.secret).update(`noticebox file link\n${id}\n${exp}`).digest("base64url");

/** A link that downloads the file without signing in, for LINK_MINUTES from now. */
export function signedFileUrl(rt: Runtime, base: string, id: string): { url: string; expires_at: string } {
  const exp = Math.floor(rt.now().getTime() / 1000) + LINK_MINUTES * 60;
  return { url: `${base}${filePath(id)}?exp=${exp}&sig=${sign(rt, id, exp)}`, expires_at: new Date(exp * 1000).toISOString() };
}

function signedFor(rt: Runtime, id: string, params: URLSearchParams): boolean {
  const exp = Number(params.get("exp"));
  const sig = params.get("sig") ?? "";
  if (!Number.isInteger(exp) || exp * 1000 < rt.now().getTime()) return false;
  const want = Buffer.from(sign(rt, id, exp));
  const got = Buffer.from(sig);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** GET /files/<id>: for a signed-in person, or for whoever holds a signed link that has not run out. */
export async function fileRoute(req: Request, rt: Runtime, id: string): Promise<Response> {
  const params = new URL(req.url).searchParams;
  if (params.has("sig")) {
    if (!signedFor(rt, id, params)) return new Response("this link has run out or is not valid; ask for a new one", { status: 403 });
  } else if (!(await actorOf(req.headers, rt))) return new Response("sign in first", { status: 401 });
  return fileResponse(rt, id, { inline: params.get("inline") === "1" }) ?? new Response("no such file", { status: 404 });
}
