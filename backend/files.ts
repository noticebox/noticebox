// Serving a file that came with a submission, over next-app-kit/files (ADR 0007): a stranger chose its name, its bytes and its media
// type, so it is never rendered as a page of the inbox. Everything is a download except the common photo formats, which the inbox
// shows as pictures, sandboxed and never sniffed; never SVG. What stays noticebox's is who may have it: a signed-in person, or whoever
// holds a signed link (`signedFileUrl`) that has not run out, which is how an MCP client fetches a file without its bytes passing
// through the model. The links are signed as they always were, so one handed out before the kit still works.
import { fileResponse as kitFileResponse, isPicture as kitIsPicture, signedFileUrl as kitSignedFileUrl, signedFor, type LinkSigner } from "next-app-kit/files";
import { actorOf } from "./auth";
import type { StoredFile } from "./db";
import { filePath } from "./paths";
import type { Runtime } from "./runtime";

/** How long a signed link to a file works. */
export const LINK_MINUTES = 15;

/** Whether the inbox may show the file as a picture instead of offering it as a download. */
export const isPicture = (f: Pick<StoredFile, "type">): boolean => kitIsPicture(f);

/**
 * The file as an HTTP answer, or null when there is none (or it belongs to another submission than `submissionId`).
 * `inline` asks to show a picture rather than download it; anything else is a download either way.
 */
export function fileResponse(rt: Runtime, id: string, opts: { submissionId?: string; inline?: boolean } = {}): Response | null {
  const f = rt.store.fileStore.get(id);
  if (!f || (opts.submissionId !== undefined && f.owner !== opts.submissionId)) return null;
  return kitFileResponse(rt.store.fileStore, f, { inline: opts.inline });
}

const signer = (rt: Pick<Runtime, "now" | "signIn">): LinkSigner => ({ secret: rt.signIn.secret, purpose: "noticebox file link", now: rt.now });

/** A link that downloads the file without signing in, for LINK_MINUTES from now; `base` is the public URL. */
export function signedFileUrl(rt: Pick<Runtime, "now" | "signIn">, base: string, id: string): { url: string; expires_at: string } {
  return kitSignedFileUrl(signer(rt), `${base}${filePath(id)}`, id, LINK_MINUTES);
}

/** GET /files/<id>: for a signed-in person, or for whoever holds a signed link that has not run out. */
export async function fileRoute(req: Request, rt: Runtime, id: string): Promise<Response> {
  const params = new URL(req.url).searchParams;
  if (params.has("sig")) {
    if (!signedFor(signer(rt), id, params)) return new Response("this link has run out or is not valid; ask for a new one", { status: 403 });
  } else if (!(await actorOf(req.headers, rt))) return new Response("sign in first", { status: 401 });
  return fileResponse(rt, id, { inline: params.get("inline") === "1" }) ?? new Response("no such file", { status: 404 });
}
