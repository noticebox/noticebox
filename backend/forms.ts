// The forms file as something that can be edited: the raw JSON object as the file has it (with its `${VAR}`
// references, which must never be written back expanded), the parsed configuration, and one way to change it: a
// mutation of a copy of the raw object, parsed to prove it valid, then written to the file and taken into use.
import { readFileSync, writeFileSync } from "node:fs";
import { expand, FORM_NAME, parseConfig, type Config, type Env, type KindName } from "./config";
import type { Outcome } from "./db";

export type RawForm = Record<string, unknown>;
export type RawConfig = { boxes?: string[]; forms?: Record<string, RawForm> };

export class Forms {
  readonly path: string | null; // null: in memory only (tests)
  private env: Env;
  private raw: RawConfig;
  config: Config;

  constructor(path: string | null, env: Env, raw?: RawConfig) {
    this.path = path;
    this.env = env;
    this.raw = raw ?? (path ? parseRaw(readFileSync(path, "utf8"), path) : { forms: {} });
    this.config = parseConfig(JSON.parse(expand(JSON.stringify(this.raw), env)));
  }

  /** A copy of the raw object, for the settings pages to show what the file says (secrets as `${VAR}`). */
  rawForm(name: string): RawForm | undefined {
    const f = this.raw.forms?.[name];
    return f ? (structuredClone(f) as RawForm) : undefined;
  }

  /** Applies `change` to a copy of the raw object; if the result parses, it is written and becomes the configuration. */
  edit(change: (raw: RawConfig) => void | string): Outcome {
    const next = structuredClone(this.raw) as RawConfig;
    next.forms ??= {};
    const refused = change(next);
    if (refused) return { ok: false, error: refused };
    let parsed: Config;
    try {
      parsed = parseConfig(JSON.parse(expand(JSON.stringify(next), this.env)));
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
    // The file lists only the boxes no form names; the rest follow from the forms.
    const named = new Set(Object.values(parsed.forms).map((f) => f.box));
    const listed = parsed.boxes.filter((b) => !named.has(b));
    if (listed.length === 0) delete next.boxes;
    else next.boxes = listed;
    // In place, so a bind-mounted file keeps its inode; the file is small and read only at start and after an edit.
    if (this.path) writeFileSync(this.path, JSON.stringify(next, null, 2) + "\n");
    this.raw = next;
    this.config = parsed;
    return { ok: true };
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
