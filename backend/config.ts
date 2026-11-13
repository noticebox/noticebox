// What a form is, and how one is read from the JSON it is written as (stored in the database, or in the forms file
// that older releases read and that is now imported once, forms.ts). Strings may contain `${VAR}`, filled from the
// environment when the forms are loaded, so secrets such as an ntfy topic stay out of the database.
import { readFileSync } from "node:fs";
import { isKind, parseStates, type KindName, type State } from "./kinds";
export type { KindName, State };

export type FieldType = "text" | "textarea" | "select" | "email" | "hidden" | "file";

/** What a `file` field takes: which files (extensions such as `.stl`, or media types such as `image/*`), how many, how large each. */
export type FileRule = { accept: string[]; maxFiles: number; maxBytes: number };

export type Field = {
  type: FieldType;
  label: string;
  required: boolean;
  max: number;
  options: string[];
  personal: boolean; // blanked once the submission is closed and past the form's retention
  help: string;
  files: FileRule | null; // set for a `file` field only
};

export type Form = {
  name: string;
  box: string; // the group the form is listed under (a site, a project)
  kind: KindName;
  title: string;
  intro: string;
  thanks: string;
  fields: Record<string, Field>; // the described fields; a form that is not `strict` takes any other field too
  strict: boolean;
  states: State[]; // the first is where a submission starts
  origins: string[]; // where submissions may come from; empty means anywhere
  redirect: string | null; // where the browser goes after a submission; null means the hosted thanks page
  retentionDays: number;
  deleteAfterDays: number | null; // days after closing until the submission and its history are deleted; null keeps the anonymised record
  notify: Target[]; // where a new submission is announced (title and link, never the content)
  link: { url: string; label: string } | null; // where the thing a submission is about can be looked at: a URL template with {field} placeholders
  github: GitHub | null; // where an issue can be opened from a submission
};

export type GitHub = { repo: string; labels: string[] }; // repo is owner/name

export type Target = { type: "ntfy" | "webhook"; url: string; unset?: string }; // `unset`: the variable the URL needs and the environment lacks

export type Config = { boxes: string[]; forms: Record<string, Form> }; // `boxes` lists every box, also those without a form yet

export const FORM_NAME = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const BOX_NAME = /^[a-z0-9][a-z0-9 ._-]{0,39}$/i;
export const FIELD_NAME = /^[a-z][a-z0-9_]{0,31}$/;
export const RESERVED_FIELDS = new Set(["_gotcha"]);
const REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
export const PLACEHOLDER = /\{([a-z][a-z0-9_]{0,31})\}/g;
const TYPES: FieldType[] = ["text", "textarea", "select", "email", "hidden", "file"];
// `max` is characters; a file field has no text, so its `max` is never checked (its limits are in `files`).
const DEFAULT_MAX: Record<FieldType, number> = { text: 500, textarea: 10000, select: 200, email: 254, hidden: 200, file: 1 };
/** The largest file SQLite keeps in one value (its default SQLITE_MAX_LENGTH); every other limit is the form's to choose. */
export const MAX_FILE_BYTES = 1_000_000_000;
const ACCEPT = /^(\.[a-z0-9]{1,10}|[a-z]+\/(\*|[a-z0-9.+-]+))$/;

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

/**
 * Replaces `${VAR}` with the variable's value, escaped for its place inside a JSON string. An unset variable throws,
 * unless `missing` says what to put in its place.
 */
export function expand(text: string, env: Env, missing?: (name: string) => string): string {
  return text.replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (_, name: string) => {
    const value = env[name] ?? missing?.(name);
    if (value === undefined) throw new Error(`\${${name}} is not set in the environment`);
    return JSON.stringify(value).slice(1, -1);
  });
}

/** Stands in for an unset variable when stored forms are loaded: still a valid URL, and recognisable afterwards. */
const UNSET = "https://unset.invalid/";

/**
 * Parses stored forms without failing on a variable the environment lacks: a form that worked when it was saved keeps
 * working after a restart without that variable. A notification target that needs one is marked `unset` and skipped
 * (notify.ts logs it); `missing` lists every such variable, for the start-up log.
 */
export function parseStoredConfig(raw: unknown, env: Env): { config: Config; missing: string[] } {
  const missing = new Set<string>();
  const config = parseConfig(
    JSON.parse(
      expand(JSON.stringify(raw), env, (name) => {
        missing.add(name);
        return UNSET + name;
      }),
    ),
  );
  for (const f of Object.values(config.forms))
    for (const t of f.notify) {
      const name = t.url.match(/https:\/\/unset\.invalid\/([A-Z][A-Z0-9_]*)/)?.[1];
      if (name) t.unset = name;
    }
  return { config, missing: [...missing] };
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
  const fieldsRaw = f.fields === undefined ? {} : record(f.fields, `${at}.fields`);
  const fields: Record<string, Field> = {};
  for (const [fname, fraw] of Object.entries(fieldsRaw)) {
    if (!FIELD_NAME.test(fname) || RESERVED_FIELDS.has(fname)) throw new Error(`${at}: field name "${fname}" is not allowed`);
    fields[fname] = parseField(`${at}.fields.${fname}`, fraw);
  }
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
  if (typeof retentionDays !== "number" || !Number.isInteger(retentionDays) || retentionDays < 1)
    throw new Error(`${at}.retentionDays: a whole number of days, at least 1`);
  const deleteAfterDays = f.deleteAfterDays === undefined || f.deleteAfterDays === null ? null : f.deleteAfterDays;
  if (deleteAfterDays !== null && (typeof deleteAfterDays !== "number" || !Number.isInteger(deleteAfterDays) || deleteAfterDays < retentionDays))
    throw new Error(`${at}.deleteAfterDays: a whole number of days, at least retentionDays (${retentionDays})`);
  const notify = parseNotify(`${at}.notify`, f.notify);
  const box = str(f.box, `${at}.box`, "forms");
  const states = parseStates(`${at}.states`, f.states, f.kind);
  const strict = bool(f.strict, `${at}.strict`, false);
  const link = parseLink(`${at}.link`, f.link, fields);
  const github = parseGitHub(`${at}.github`, f.github);
  if (!BOX_NAME.test(box)) throw new Error(`${at}.box: letters, digits, spaces, . _ and - only`);
  return {
    name,
    box,
    kind: f.kind,
    title: str(f.title, `${at}.title`, name),
    intro: str(f.intro, `${at}.intro`, ""),
    thanks: str(f.thanks, `${at}.thanks`, "Thank you. Your message has been received."),
    fields,
    strict,
    states,
    origins,
    redirect,
    retentionDays,
    deleteAfterDays,
    notify,
    link,
    github,
  };
}

/** `github` is the repository issues are opened in, `"owner/name"` or `{ repo, labels }`. */
function parseGitHub(at: string, raw: unknown): GitHub | null {
  if (raw === undefined || raw === null) return null;
  const o = typeof raw === "string" ? { repo: raw } : record(raw, at);
  const repo = str(o.repo, `${at}.repo`, "");
  if (!REPO.test(repo)) throw new Error(`${at}.repo: "owner/name" of a GitHub repository`);
  const labels = stringList(o.labels, `${at}.labels`)
    .map((l) => l.trim())
    .filter(Boolean);
  return { repo, labels };
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
  const files = parseFileRule(at, f, t);
  return {
    type: t,
    label: str(f.label, `${at}.label`, at.split(".").at(-1) ?? ""),
    required: bool(f.required, `${at}.required`, false),
    max,
    options,
    personal: bool(f.personal, `${at}.personal`, t === "text" || t === "textarea" || t === "email" || t === "file"),
    help: str(f.help, `${at}.help`, ""),
    files,
  };
}

/** `accept`, `maxFiles` and `maxMegabytes` belong to a `file` field; elsewhere they are a mistake worth saying. */
function parseFileRule(at: string, f: Record<string, unknown>, t: FieldType): FileRule | null {
  if (t !== "file") {
    for (const key of ["accept", "maxFiles", "maxMegabytes"]) if (f[key] !== undefined) throw new Error(`${at}: only a file field has ${key}`);
    return null;
  }
  const accept = stringList(f.accept, `${at}.accept`).map((a) => a.trim().toLowerCase());
  for (const a of accept) if (!ACCEPT.test(a)) throw new Error(`${at}.accept: "${a}" is neither an extension like .stl nor a media type like image/*`);
  const maxFiles = f.maxFiles === undefined ? 1 : f.maxFiles;
  if (typeof maxFiles !== "number" || !Number.isInteger(maxFiles) || maxFiles < 1) throw new Error(`${at}.maxFiles: a whole number, at least 1`);
  const mb = f.maxMegabytes === undefined ? 10 : f.maxMegabytes;
  const maxBytes = typeof mb === "number" ? Math.round(mb * 1024 * 1024) : NaN;
  if (!(maxBytes > 0) || maxBytes > MAX_FILE_BYTES)
    throw new Error(`${at}.maxMegabytes: more than 0, at most ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)} (the most SQLite keeps in one value)`);
  return { accept, maxFiles, maxBytes };
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
