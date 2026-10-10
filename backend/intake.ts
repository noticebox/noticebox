// The submission endpoint: POST /f/<form> (rewritten to /api/f/<form> by proxy.ts), with the preflight scripts need.
// A browser form post is answered with a redirect, a JSON post with the id. A bot that fills the field nobody sees
// gets the same answer and nothing is stored.
import { clientIp, originOf } from "./auth";
import { FIELD_NAME, RESERVED_FIELDS, type Form } from "./config";
import { mediaType, parseFields, readCapped, seeOther, text } from "./http";
import { notify } from "./notify";
import type { Runtime } from "./runtime";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Validated = { fields: Record<string, string>; errors: string[] };

const MAX_FIELDS = 50;
const MAX_UNDESCRIBED = 10000;

/** What a page says about its own fields in hidden `_` fields, the way Formspree's `_next` works. */
export type Hints = { required: string[]; personal: string[]; public: string[]; labels: Record<string, string>; next: string | null };

const names = (v: string | undefined): string[] => (v ?? "").split(/[\s,]+/).map((x) => x.trim()).filter((x) => FIELD_NAME.test(x));

export function hintsOf(data: Record<string, string>): Hints {
  const labels: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    const m = /^_label_([a-z][a-z0-9_]{0,31})$/.exec(k);
    if (m && v.trim()) labels[m[1]!] = clean(v).slice(0, 80);
  }
  return { required: names(data._required), personal: names(data._personal), public: names(data._public), labels, next: data._next?.trim() || null };
}

/** The described fields are checked as described; the rest is taken as it comes unless the form is strict. */
export function validate(form: Form, data: Record<string, string>, hints: Hints = hintsOf(data)): Validated {
  const fields: Record<string, string> = {};
  const errors: string[] = [];
  for (const name of Object.keys(data)) {
    if (form.fields[name] || RESERVED_FIELDS.has(name) || name.startsWith("_")) continue;
    if (form.strict) {
      errors.push(`${name} is not a field of this form`);
      continue;
    }
    if (!FIELD_NAME.test(name)) continue; // not a name a field can have: dropped
    const v = clean(data[name] ?? "");
    if (!v) continue;
    if (Object.keys(fields).length >= MAX_FIELDS) {
      errors.push("too many fields");
      break;
    }
    fields[name] = v.length > MAX_UNDESCRIBED ? v.slice(0, MAX_UNDESCRIBED) : v;
  }
  if (!form.strict) for (const name of hints.required) if (!form.fields[name] && !fields[name]) errors.push(`${hints.labels[name] ?? name} is required`);
  for (const [name, f] of Object.entries(form.fields)) {
    let v = clean(data[name] ?? "");
    if (f.type !== "textarea") v = v.replace(/\s*\n\s*/g, " ");
    if (!v) {
      if (f.required) errors.push(`${f.label} is required`);
      continue;
    }
    if (v.length > f.max) errors.push(`${f.label} is too long (at most ${f.max} characters)`);
    else if (f.type === "select" && !f.options.includes(v)) errors.push(`${f.label} must be one of the given choices`);
    else if (f.type === "email" && !EMAIL.test(v)) errors.push(`${f.label} is not an email address`);
    else fields[name] = v;
  }
  return { fields, errors };
}

/** Trims, normalises line ends and drops control characters other than newline and tab. */
export function clean(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}

function corsFor(form: Form, origin: string | null): { ok: boolean; headers: Record<string, string> } {
  if (form.origins.length === 0) return { ok: true, headers: { "access-control-allow-origin": "*" } };
  if (origin !== null && form.origins.includes(origin)) return { ok: true, headers: { "access-control-allow-origin": origin, vary: "Origin" } };
  return { ok: false, headers: {} };
}

export function intakePreflight(formName: string, h: Headers, rt: Runtime): Response {
  const form = rt.config.forms[formName];
  if (!form) return text(404, "no such form");
  const cors = corsFor(form, originOf(h));
  if (!cors.ok) return text(403, "");
  return new Response(null, { status: 204, headers: { ...cors.headers, "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type", "access-control-max-age": "600" } });
}

export async function intakeRoute(req: Request, formName: string, rt: Runtime): Promise<Response> {
  const form = rt.config.forms[formName];
  if (!form) return text(404, "no such form");
  const h = req.headers;
  const origin = originOf(h);
  const cors = corsFor(form, origin);
  if (!cors.ok) return text(403, "This form does not take submissions from there.");
  const at = rt.now();
  if (!rt.rate.allow(`${form.name}|${clientIp(h, rt)}`, at.getTime())) return text(429, "Too many submissions; try again later.", { "retry-after": "600" });

  const type = mediaType(h);
  const bytes = await readCapped(req, rt.bodyLimit);
  if (bytes === null) return text(413, "the body is too large");
  let data: Record<string, string>;
  let wantsJson: boolean;
  if (type === "application/json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return text(400, "the body is not JSON");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return text(400, "the body must be a JSON object");
    data = Object.fromEntries(Object.entries(parsed).filter(([, v]) => ["string", "number", "boolean"].includes(typeof v)).map(([k, v]) => [k, String(v)]));
    wantsJson = true;
  } else if (type === "application/x-www-form-urlencoded" || type === "multipart/form-data") {
    try {
      data = await parseFields(bytes, h);
    } catch {
      return text(400, "the body is not a form");
    }
    const accept = h.get("accept") ?? "";
    wantsJson = accept.includes("application/json") && !accept.includes("text/html");
  } else {
    return text(415, "send application/x-www-form-urlencoded or application/json");
  }

  const hints = hintsOf(data);
  // `_next`: where the page wants the browser afterwards, taken only when it is on an origin the form accepts.
  const next = hints.next && originAllowed(form, hints.next) ? hints.next : null;
  const accepted = (id: string) =>
    wantsJson
      ? Response.json({ id }, { status: 201, headers: cors.headers })
      : seeOther(next ?? form.redirect ?? `/f/${form.name}/thanks`, cors.headers);

  if (data._gotcha) {
    rt.log(`honeypot ${form.name} from ${clientIp(h, rt)}`);
    return accepted("bot");
  }
  const { fields, errors } = validate(form, data, hints);
  if (errors.length) {
    if (wantsJson) return Response.json({ errors }, { status: 400, headers: cors.headers });
    // Back to the page the post came from, with what was typed and what is wrong, so it can show both; only to a
    // page on an origin the form takes submissions from. Without one, the errors are the answer.
    const back = backTo(form, h.get("referer"));
    if (!back) return text(400, errors.join("\n"));
    for (const name of Object.keys(form.fields)) if (data[name]) back.searchParams.set(name, data[name].slice(0, 2000));
    back.searchParams.delete("error");
    for (const e of errors) back.searchParams.append("error", e);
    return seeOther(back.toString(), cors.headers);
  }
  const s = rt.store.receive(form, fields, origin, at);
  const res = accepted(s.id);
  // What the page says about fields it is the first to send is written into the forms file: a label, whether the
  // field is personal, whether it is required. What the file already says is never changed by a post.
  if (!form.strict) learn(rt, form, fields, hints);
  // The notification goes out after the answer is on its way; a slow ntfy never slows the reporter.
  void notify(form, s, publicBase(h, rt), rt.fetch, rt.log);
  return res;
}

function originAllowed(form: Form, url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  return form.origins.length === 0 ? false : form.origins.includes(u.origin);
}

function learn(rt: Runtime, form: Form, fields: Record<string, string>, hints: Hints): void {
  const described: Record<string, { label?: string; personal?: boolean; required?: boolean }> = {};
  for (const name of Object.keys(fields)) {
    if (form.fields[name]) continue;
    const d: { label?: string; personal?: boolean; required?: boolean } = {};
    if (hints.labels[name]) d.label = hints.labels[name];
    if (hints.public.includes(name)) d.personal = false;
    else if (hints.personal.includes(name)) d.personal = true;
    if (hints.required.includes(name)) d.required = true;
    if (Object.keys(d).length) described[name] = d;
  }
  if (Object.keys(described).length === 0) return;
  const r = rt.forms.describe(form.name, described);
  if (!r.ok) rt.log(`learn ${form.name}: ${r.error}`);
}

function backTo(form: Form, referer: string | null): URL | null {
  if (!referer) return null;
  let u: URL;
  try {
    u = new URL(referer);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (form.origins.length > 0 && !form.origins.includes(u.origin)) return null;
  u.hash = "";
  return u;
}

function publicBase(h: Headers, rt: Runtime): string {
  if (rt.baseUrl) return rt.baseUrl;
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host") || "localhost";
  return `${proto}://${host}`;
}
