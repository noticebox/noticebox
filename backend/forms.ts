// The boxes and forms as something that can be edited. They live in the database (ADR 0004), each form as the JSON it
// was written as, with its `${VAR}` references, which must never be stored expanded. One way to change them: a
// mutation of a copy of that raw object, parsed whole to prove it valid, then written to the store and taken into use.
// Older releases kept them in a JSON file (NOTICEBOX_CONFIG); `importFile` brings such a file in once, on upgrade.
import { existsSync, readFileSync } from "node:fs";
import { expand, FORM_NAME, parseStoredConfig, type Config, type Env, type KindName } from "./config";
import type { Outcome, Store } from "./db";

export type RawForm = Record<string, unknown>;
export type RawConfig = { boxes?: string[]; forms?: Record<string, RawForm> };

/** The settings key that records the one-time import of the forms file. */
const IMPORTED = "forms_file_imported_at";

export class Forms {
  private store: Store;
  private env: Env;
  private log: (line: string) => void;
  private raw: RawConfig;
  config: Config;

  constructor(store: Store, env: Env, log: (line: string) => void = console.error) {
    this.store = store;
    this.env = env;
    this.log = log;
    const stored = store.readForms();
    const named = new Set(Object.values(stored.forms).map((f) => (typeof f.box === "string" ? f.box : "forms")));
    this.raw = { boxes: stored.boxes.filter((b) => !named.has(b)), forms: stored.forms };
    this.config = this.load(this.raw);
  }

  /** Parses stored forms; a variable the environment lacks is logged, not fatal (see parseStoredConfig). */
  private load(raw: RawConfig): Config {
    const { config, missing } = parseStoredConfig(raw, this.env);
    for (const name of missing) this.log(`forms: \${${name}} is not set in the environment; what needs it is skipped`);
    return config;
  }

  /**
   * Imports the forms file of an older release, once: only into a database without boxes or forms, and never again
   * after it has been done. The file is not read after that; the log says it can go.
   */
  importFile(path: string, now: Date = new Date()): void {
    if (!existsSync(path)) return;
    const at = this.store.setting(IMPORTED);
    if (at) {
      this.log(`forms: ${path} was imported on ${at.slice(0, 10)} and is no longer read; remove it and NOTICEBOX_CONFIG`);
      return;
    }
    if (this.config.boxes.length > 0) {
      this.log(`forms: the database already has boxes and forms, so ${path} is ignored; remove it and NOTICEBOX_CONFIG`);
      return;
    }
    const raw = parseRaw(readFileSync(path, "utf8"), path);
    let config: Config;
    try {
      config = this.load(raw);
    } catch (e) {
      throw new Error(`${path}: ${(e as Error).message}`);
    }
    this.store.writeForms({ boxes: config.boxes, forms: raw.forms ?? {} }, (n) => config.forms[n]!.box);
    this.store.setSetting(IMPORTED, now.toISOString());
    this.raw = { ...raw, forms: raw.forms ?? {} };
    this.config = config;
    const n = Object.keys(config.forms).length;
    this.log(`forms: imported ${n} form${n === 1 ? "" : "s"} from ${path} into the database; the file is no longer read and can be removed`);
  }

  /** A copy of a form as written, for the settings pages and MCP to show (secrets as `${VAR}`). */
  rawForm(name: string): RawForm | undefined {
    const f = this.raw.forms?.[name];
    return f ? (structuredClone(f) as RawForm) : undefined;
  }

  /** Applies `change` to a copy of the raw object; if the result parses, it is stored and becomes the configuration. */
  edit(change: (raw: RawConfig) => void | string): Outcome {
    const next = structuredClone(this.raw) as RawConfig;
    next.forms ??= {};
    const refused = change(next);
    if (refused) return { ok: false, error: refused };
    let parsed: Config;
    try {
      // A form being saved must have every variable it names; the others were checked when they were saved.
      for (const [name, f] of Object.entries(next.forms)) {
        const text = JSON.stringify(f);
        if (text !== JSON.stringify(this.raw.forms?.[name])) expand(text, this.env);
      }
      parsed = this.load(next);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
    // Only the boxes no form names are kept in the list; the rest follow from the forms.
    const named = new Set(Object.values(parsed.forms).map((f) => f.box));
    const listed = parsed.boxes.filter((b) => !named.has(b));
    if (listed.length === 0) delete next.boxes;
    else next.boxes = listed;
    this.store.writeForms({ boxes: parsed.boxes, forms: next.forms }, (n) => parsed.forms[n]!.box);
    this.raw = next;
    this.config = parsed;
    return { ok: true };
  }

  /** Replaces every box and form (tests seed a runtime this way). */
  replace(raw: RawConfig): Outcome {
    return this.edit((r) => {
      r.boxes = raw.boxes ?? [];
      r.forms = structuredClone(raw.forms ?? {});
    });
  }

  createBox(name: string): Outcome {
    return this.edit((raw) => {
      const boxes = raw.boxes ?? [];
      if (boxes.includes(name) || Object.values(raw.forms ?? {}).some((f) => f.box === name)) return `there is already a box called "${name}"`;
      raw.boxes = [...boxes, name];
    });
  }

  renameBox(from: string, to: string): Outcome {
    return this.edit((raw) => {
      if (!this.config.boxes.includes(from)) return `no box called "${from}"`;
      if (from !== to && this.config.boxes.includes(to)) return `there is already a box called "${to}"`;
      raw.boxes = (raw.boxes ?? []).map((b) => (b === from ? to : b));
      for (const f of Object.values(raw.forms ?? {})) if ((f.box ?? "forms") === from) f.box = to;
    });
  }

  deleteBox(name: string): Outcome {
    return this.edit((raw) => {
      if (Object.values(this.config.forms).some((f) => f.box === name)) return `the box "${name}" still has forms`;
      raw.boxes = (raw.boxes ?? []).filter((b) => b !== name);
    });
  }

  createForm(name: string, box: string, kind: KindName, title: string): Outcome {
    return this.edit((raw) => {
      if (!FORM_NAME.test(name)) return "a form name is lowercase letters, digits, - and _, up to 40 characters";
      if (raw.forms![name]) return `there is already a form called "${name}"`;
      raw.forms![name] = { box, kind, title: title || name, fields: {} };
      raw.boxes = (raw.boxes ?? []).filter((b) => b !== box);
    });
  }

  updateForm(name: string, form: RawForm): Outcome {
    return this.edit((raw) => {
      if (!raw.forms![name]) return `no form called "${name}"`;
      raw.forms![name] = form;
      raw.boxes = (raw.boxes ?? []).filter((b) => b !== form.box);
    });
  }

  /** Creates the form or replaces it as a whole (what an assistant sends over MCP); validated like any edit. */
  putForm(name: string, form: RawForm): Outcome {
    return this.edit((raw) => {
      if (!FORM_NAME.test(name)) return "a form name is lowercase letters, digits, - and _, up to 40 characters";
      raw.forms![name] = form;
      raw.boxes = (raw.boxes ?? []).filter((b) => b !== form.box);
    });
  }

  /** Adds descriptions for fields the file does not describe yet (what a page said about them); existing ones stay. */
  describe(name: string, fields: Record<string, RawForm>): Outcome {
    return this.edit((raw) => {
      const f = raw.forms![name];
      if (!f) return `no form called "${name}"`;
      const have = (f.fields ?? {}) as Record<string, RawForm>;
      for (const [fname, d] of Object.entries(fields)) if (!have[fname]) have[fname] = d;
      f.fields = have;
    });
  }

  deleteForm(name: string, hasSubmissions: boolean): Outcome {
    return this.edit((raw) => {
      if (!raw.forms![name]) return `no form called "${name}"`;
      if (hasSubmissions) return "a form with submissions cannot be deleted; download them first";
      const box = this.config.forms[name]!.box;
      delete raw.forms![name];
      if (!Object.values(raw.forms!).some((f) => (f.box ?? "forms") === box) && !(raw.boxes ?? []).includes(box)) raw.boxes = [...(raw.boxes ?? []), box];
    });
  }
}

function parseRaw(text: string, path: string): RawConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`${path}: ${(e as Error).message}`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error(`${path}: must be an object`);
  return raw as RawConfig;
}
