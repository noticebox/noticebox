// Values noticebox keeps but never shows again, such as a form's GitHub token: AES-256-GCM with a key derived from
// NOTICEBOX_SECRET, so the database file and its backups hold them only encrypted. Changing the secret makes them
// unreadable; they are set again on the form's settings.
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const key = (secret: string): Buffer => createHmac("sha256", "noticebox-sealed").update(secret).digest();

export function seal(secret: string, value: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(secret), iv);
  const body = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url");
}

/** The value, or null when it was sealed with another secret or changed. */
export function unseal(secret: string, sealed: string): string | null {
  try {
    const raw = Buffer.from(sealed, "base64url");
    const d = createDecipheriv("aes-256-gcm", key(secret), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
