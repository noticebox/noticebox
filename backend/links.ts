// Where the thing a submission is about can be looked at: the form's `link` template with the submission's fields
// filled in, percent-encoded. None when the form has no link or a field it needs is gone (removed by retention).
import { PLACEHOLDER, type Form } from "./config";
import type { Submission } from "./db";

export function linkFor(form: Form | undefined, s: Submission): { url: string; label: string } | null {
  if (!form?.link) return null;
  let missing = false;
  const url = form.link.url.replace(PLACEHOLDER, (_, name: string) => {
    const v = s.fields[name];
    if (!v) missing = true;
    return encodeURIComponent(v ?? "");
  });
  return missing ? null : { url, label: form.link.label };
}
