import type { Form } from "./config";
import type { Submission } from "./db";

/** One line for a list: the first free text a submission has (a textarea before a short text field), cut to `max`. */
export function summaryOf(form: Form | undefined, s: Submission, max = 90): string {
  const fields = form ? Object.entries(form.fields) : [];
  const names = [...fields.filter(([, f]) => f.type === "textarea"), ...fields.filter(([, f]) => f.type === "text")].map(([n]) => n);
  const text = (form ? names : Object.keys(s.fields)).map((n) => s.fields[n]).find((v) => v) ?? "";
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? line.slice(0, max - 1) + "…" : line;
}
