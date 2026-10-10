// The forms: one JSON file. Strings may contain `${VAR}`, filled from the environment, so secrets such as an ntfy
// topic stay out of the file.
import { readFileSync } from "node:fs";
import { isKind, type KindName } from "./kinds";
export type { KindName };

export type FieldType = "text" | "textarea" | "select" | "email" | "hidden";

export type Field = {
  type: FieldType;
  label: string;
  required: boolean;
  max: number;
  options: string[];
  personal: boolean; // blanked once the submission is closed and past the form's retention
  help: string;
};

export type Form = {
  name: string;
  box: string; // the group the form is listed under (a site, a project)
  kind: KindName;
  title: string;
  intro: string;
  thanks: string;
  fields: Record<string, Field>;
  origins: string[]; // where submissions may come from; empty means anywhere
  redirect: string | null; // where the browser goes after a submission; null means the hosted thanks page
  retentionDays: number;
  notify: Target[]; // where a new submission is announced (title and link, never the content)
  link: { url: string; label: string } | null; // where the thing a submission is about can be looked at: a URL template with {field} placeholders
};

export type Target = { type: "ntfy" | "webhook"; url: string };

export type Config = { boxes: string[]; forms: Record<string, Form> }; // `boxes` lists every box, also those without a form yet

export const FORM_NAME = /^[a-z][a-z0-9_-]{0,39}$/;
const BOX_NAME = /^[a-z0-9][a-z0-9 ._-]{0,39}$/i;
const FIELD_NAME = /^[a-z][a-z0-9_]{0,31}$/;
export const PLACEHOLDER = /\{([a-z][a-z0-9_]{0,31})\}/g;
const RESERVED = new Set(["_gotcha"]);
const TYPES: FieldType[] = ["text", "textarea", "select", "email", "hidden"];
const DEFAULT_MAX: Record<FieldType, number> = { text: 500, textarea: 10000, select: 200, email: 254, hidden: 200 };

export type Env = Record<string, string | undefined>;

export function loadConfig(path: string, env: Env = process.env): Config {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    throw new Error(`cannot read ${path}: ${(e as Error).message}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(expand(text, env));
  } catch (e) {
    throw new Error(`${path}: ${(e as Error).message}`);
  }
  return parseConfig(raw);
}

/** Replaces `${VAR}` with the variable's value, escaped for its place inside a JSON string. */
export function expand(text: string, env: Env): string {
  return text.replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (_, name: string) => {
    const value = env[name];
    if (value === undefined) throw new Error(`\${${name}} is not set in the environment`);
    return JSON.stringify(value).slice(1, -1);
  });
}

export function parseConfig(raw: unknown): Config {
  const root = record(raw, "config");
  const formsRaw = root.forms === undefined ? {} : record(root.forms, "forms");
  const forms: Record<string, Form> = {};
  for (const [name, f] of Object.entries(formsRaw)) {
    if (!FORM_NAME.test(name)) throw new Error(`form name "${name}": lowercase letters, digits, - and _ only`);
    forms[name] = parseForm(name, f);
  }
  const listed = stringList(root.boxes, "boxes");
  for (const b of listed) if (!BOX_NAME.test(b)) throw new Error(`box "${b}": letters, digits, spaces, . _ and - only`);
  const boxes = [...new Set([...listed, ...Object.values(forms).map((f) => f.box)])];
  return { boxes, forms };
}

function parseForm(name: string, raw: unknown): Form {
  const at = `form ${name}`;
  const f = record(raw, at);
  if (!isKind(f.kind)) throw new Error(`${at}: kind must be "report" or "message"`);
  const fieldsRaw = record(f.fields, `${at}.fields`);
  const fields: Record<string, Field> = {};
  for (const [fname, fraw] of Object.entries(fieldsRaw)) {
    if (!FIELD_NAME.test(fname) || RESERVED.has(fname)) throw new Error(`${at}: field name "${fname}" is not allowed`);
    fields[fname] = parseField(`${at}.fields.${fname}`, fraw);
  }
  if (Object.keys(fields).length === 0) throw new Error(`${at}: no fields`);
  const origins = stringList(f.origins, `${at}.origins`).map((o) => {
    let u: URL;
    try {
      u = new URL(o);
    } catch {
      throw new Error(`${at}.origins: "${o}" is not a URL`);
    }
    if (u.origin === "null" || u.origin !== o.replace(/\/$/, "")) throw new Error(`${at}.origins: "${o}" must be an origin like https://example.org`);
    return u.origin;
  });
  const redirect = f.redirect === undefined || f.redirect === null ? null : absoluteUrl(f.redirect, `${at}.redirect`);
  const retentionDays = f.retentionDays === undefined ? 180 : f.retentionDays;
  if (typeof retentionDays !== "number" || !Number.isInteger(retentionDays) || retentionDays < 1) throw new Error(`${at}.retentionDays: a whole number of days, at least 1`);
  const notify = parseNotify(`${at}.notify`, f.notify);
  const box = str(f.box, `${at}.box`, "forms");
  const link = parseLink(`${at}.link`, f.link, fields);
  if (!BOX_NAME.test(box)) throw new Error(`${at}.box: letters, digits, spaces, . _ and - only`);
  return {
    name,
    box,
    kind: f.kind,
    title: str(f.title, `${at}.title`, name),
    intro: str(f.intro, `${at}.intro`, ""),
    thanks: str(f.thanks, `${at}.thanks`, "Thank you. Your message has been received."),
    fields,
    origins,
    redirect,
    retentionDays,
    notify,
    link,
  };
}

/** `notify` is a list of `{ type, url }` targets; the older `{ ntfy, webhook }` object is read as such a list. */
function parseNotify(at: string, raw: unknown): Target[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    const o = record(raw, at);
    const out: Target[] = [];
    if (o.ntfy !== undefined && o.ntfy !== null) out.push({ type: "ntfy", url: absoluteUrl(o.ntfy, `${at}.ntfy`) });
    if (o.webhook !== undefined && o.webhook !== null) out.push({ type: "webhook", url: absoluteUrl(o.webhook, `${at}.webhook`) });
    return out;
  }
  return raw.map((t, i) => {
    const o = record(t, `${at}[${i}]`);
    if (o.type !== "ntfy" && o.type !== "webhook") throw new Error(`${at}[${i}].type: "ntfy" or "webhook"`);
    return { type: o.type, url: absoluteUrl(o.url, `${at}[${i}].url`) };
  });
}

/** `link` is a URL template, or `{ url, label }`; each `{name}` must be a field of the form. */
function parseLink(at: string, raw: unknown, fields: Record<string, Field>): Form["link"] {
  if (raw === undefined || raw === null) return null;
  const o = typeof raw === "string" ? { url: raw } : record(raw, at);
  const url = str(o.url, `${at}.url`, "");
  const label = str(o.label, `${at}.label`, "Open");
  for (const [, name] of url.matchAll(PLACEHOLDER)) if (!fields[name!]) throw new Error(`${at}: {${name}} is not a field of this form`);
  absoluteUrl(url.replace(PLACEHOLDER, "x"), `${at}.url`);
  return { url, label };
}

function parseField(at: string, raw: unknown): Field {
  const f = record(raw ?? {}, at);
  const type = f.type === undefined ? "text" : f.type;
  if (typeof type !== "string" || !TYPES.includes(type as FieldType)) throw new Error(`${at}.type: one of ${TYPES.join(", ")}`);
  const t = type as FieldType;
  const options = stringList(f.options, `${at}.options`);
  if (t === "select" && options.length === 0) throw new Error(`${at}: a select needs options`);
  if (t !== "select" && options.length > 0) throw new Error(`${at}: only a select has options`);
  const max = f.max === undefined ? DEFAULT_MAX[t] : f.max;
  if (typeof max !== "number" || !Number.isInteger(max) || max < 1 || max > 100000) throw new Error(`${at}.max: a whole number up to 100000`);
  return {
    type: t,
    label: str(f.label, `${at}.label`, at.split(".").at(-1) ?? ""),
    required: bool(f.required, `${at}.required`, false),
    max,
    options,
    personal: bool(f.personal, `${at}.personal`, t === "text" || t === "textarea" || t === "email"),
    help: str(f.help, `${at}.help`, ""),
  };
}

function record(x: unknown, at: string): Record<string, unknown> {
  if (typeof x !== "object" || x === null || Array.isArray(x)) throw new Error(`${at}: must be an object`);
  return x as Record<string, unknown>;
}

function str(x: unknown, at: string, fallback: string): string {
  if (x === undefined) return fallback;
  if (typeof x !== "string") throw new Error(`${at}: must be a string`);
  return x;
}

function bool(x: unknown, at: string, fallback: boolean): boolean {
  if (x === undefined) return fallback;
  if (typeof x !== "boolean") throw new Error(`${at}: must be true or false`);
  return x;
}

function stringList(x: unknown, at: string): string[] {
  if (x === undefined) return [];
  if (!Array.isArray(x) || !x.every((s) => typeof s === "string")) throw new Error(`${at}: must be a list of strings`);
  return x as string[];
}

function absoluteUrl(x: unknown, at: string): string {
  if (typeof x !== "string") throw new Error(`${at}: must be a URL`);
  let u: URL;
  try {
    u = new URL(x);
  } catch {
    throw new Error(`${at}: "${x}" is not a URL`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`${at}: must be http(s)`);
  return x;
}
