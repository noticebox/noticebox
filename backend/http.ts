// Reading requests and writing the usual answers, for the handlers in backend/.

/** Reads at most `max` bytes; null (and the stream cancelled) as soon as the body is larger. */
export async function readCapped(req: Request, max: number): Promise<Uint8Array | null> {
  const declared = req.headers.get("content-length");
  if (Number(declared) > max) return null;
  if (!req.body) return declared !== null && Number(declared) > 0 ? null : new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = req.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.byteLength > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
    size += value.byteLength;
  }
  if (declared !== null && size < Number(declared)) return null;
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** The content type without parameters, lower case; "" when absent. */
export const mediaType = (h: Headers): string => (h.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";

/** The fields of a urlencoded or multipart body, first value per name. */
export async function parseFields(bytes: Uint8Array, h: Headers): Promise<Record<string, string>> {
  const type = mediaType(h);
  if (type === "application/x-www-form-urlencoded") return Object.fromEntries(new URLSearchParams(new TextDecoder().decode(bytes)));
  const fd = await new Response(bytes as BodyInit, { headers: { "content-type": h.get("content-type") ?? "" } }).formData();
  const out: Record<string, string> = {};
  for (const [k, v] of fd) if (typeof v === "string" && !(k in out)) out[k] = v;
  return out;
}

export function seeOther(location: string, headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 303, headers: { location, ...headers } });
}

export const text = (status: number, body: string, headers: Record<string, string> = {}): Response =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", ...headers } });
