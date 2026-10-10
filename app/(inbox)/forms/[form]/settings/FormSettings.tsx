"use client";

import { useActionState, useState } from "react";
import { type AdminState, deleteForm, updateForm } from "../../../admin";

export type RawFieldRow = { name: string; type: string; label: string; required: boolean; max: string; options: string; personal: "default" | "yes" | "no"; help: string };
export type RawTarget = { type: "ntfy" | "webhook"; url: string };
export type Settings = {
  box: string;
  kind: string;
  title: string;
  thanks: string;
  origins: string; // one per line
  redirect: string;
  retentionDays: string;
  linkUrl: string;
  linkLabel: string;
  notify: RawTarget[];
  fields: RawFieldRow[];
};

const TYPES = ["text", "textarea", "select", "email", "hidden"];

/** What the settings page sends: the raw form object as the file will hold it. Empty strings mean "not set". */
function toRaw(s: Settings): Record<string, unknown> {
  const fields: Record<string, Record<string, unknown>> = {};
  for (const f of s.fields) {
    const o: Record<string, unknown> = {};
    if (f.type !== "text") o.type = f.type;
    if (f.label.trim()) o.label = f.label.trim();
    if (f.required) o.required = true;
    if (f.max.trim()) o.max = Number(f.max);
    if (f.type === "select") o.options = f.options.split(",").map((x) => x.trim()).filter(Boolean);
    if (f.personal !== "default") o.personal = f.personal === "yes";
    if (f.help.trim()) o.help = f.help.trim();
    fields[f.name.trim()] = o;
  }
  const raw: Record<string, unknown> = { box: s.box.trim(), kind: s.kind, title: s.title.trim(), fields };
  if (s.thanks.trim()) raw.thanks = s.thanks.trim();
  const origins = s.origins.split("\n").map((x) => x.trim()).filter(Boolean);
  if (origins.length) raw.origins = origins;
  if (s.redirect.trim()) raw.redirect = s.redirect.trim();
  if (s.retentionDays.trim()) raw.retentionDays = Number(s.retentionDays);
  if (s.notify.length) raw.notify = s.notify.map((t) => ({ type: t.type, url: t.url.trim() }));
  if (s.linkUrl.trim()) raw.link = s.linkLabel.trim() ? { url: s.linkUrl.trim(), label: s.linkLabel.trim() } : s.linkUrl.trim();
  return raw;
}

const label = "mb-1 block font-bold";
const hint = "mt-1 text-[13px] text-muted";
const small = "field py-1 text-sm";

// The settings of a form: everything the file says about it, edited as a whole and saved as a whole. The state is
// React's, so a refused save keeps what was typed and shows why it was refused.
export function FormSettings({ name, boxes, initial, hasSubmissions }: { name: string; boxes: string[]; initial: Settings; hasSubmissions: boolean }) {
  const [s, set] = useState<Settings>(initial);
  const [saved, save, saving] = useActionState<AdminState, FormData>(async (prev, data) => {
    const r = await updateForm(prev, data);
    return r;
  }, {});
  const [removed, remove, removing] = useActionState<AdminState, FormData>(deleteForm, {});
  const patch = (p: Partial<Settings>) => set((x) => ({ ...x, ...p }));
  const field = (i: number, p: Partial<RawFieldRow>) => set((x) => ({ ...x, fields: x.fields.map((f, j) => (j === i ? { ...f, ...p } : f)) }));
  const target = (i: number, p: Partial<RawTarget>) => set((x) => ({ ...x, notify: x.notify.map((t, j) => (j === i ? { ...t, ...p } : t)) }));
  const move = (i: number, d: -1 | 1) =>
    set((x) => {
      const fields = [...x.fields];
      const j = i + d;
      if (j < 0 || j >= fields.length) return x;
      [fields[i], fields[j]] = [fields[j]!, fields[i]!];
      return { ...x, fields };
    });
  const ok = saved.n && !saved.error;

  return (
    <div className="grid max-w-3xl gap-10">
      <form action={save} className="grid gap-10">
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="form" value={JSON.stringify(toRaw(s))} />

        <section>
          <h2 className="section-title">The form</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="s-title" className={label}>
                Title
              </label>
              <input id="s-title" value={s.title} onChange={(e) => patch({ title: e.target.value })} className="field" />
            </div>
            <div>
              <label htmlFor="s-box" className={label}>
                Box
              </label>
              <input id="s-box" list="boxes" value={s.box} onChange={(e) => patch({ box: e.target.value })} className="field" />
              <datalist id="boxes">
                {boxes.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
              <p className={hint}>An existing box, or a new name.</p>
            </div>
            <div>
              <span className={label}>Kind</span>
              <p className="py-2">{s.kind}</p>
              <p className={hint}>Set when the form was made; the states depend on it.</p>
            </div>
            <div>
              <span className={label}>Endpoint</span>
              <p className="py-2 break-all">/f/{name}</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="section-title">Fields</h2>
          <p className="mb-3 text-muted">The names a page posts; the labels the inbox shows. Personal fields are removed by retention once the submission is closed.</p>
          <div className="grid gap-3">
            {s.fields.map((f, i) => (
              <div key={i} className="sheet grid gap-2 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <div>
                  <label className="text-[13px] text-muted">Name</label>
                  <input value={f.name} onChange={(e) => field(i, { name: e.target.value })} className={small} placeholder="email" aria-label={`Field ${i + 1} name`} />
                </div>
                <div>
                  <label className="text-[13px] text-muted">Type</label>
                  <select value={f.type} onChange={(e) => field(i, { type: e.target.value })} className={small} aria-label={`Field ${i + 1} type`}>
                    {TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[13px] text-muted">Label</label>
                  <input value={f.label} onChange={(e) => field(i, { label: e.target.value })} className={small} aria-label={`Field ${i + 1} label`} />
                </div>
                <div className="flex items-end gap-1">
                  <button type="button" onClick={() => move(i, -1)} aria-label="Move up" className="btn px-2" disabled={i === 0}>
                    ↑
                  </button>
                  <button type="button" onClick={() => move(i, 1)} aria-label="Move down" className="btn px-2" disabled={i === s.fields.length - 1}>
                    ↓
                  </button>
                  <button type="button" onClick={() => set((x) => ({ ...x, fields: x.fields.filter((_, j) => j !== i) }))} aria-label={`Remove field ${f.name || i + 1}`} className="btn px-2 text-error">
                    ✕
                  </button>
                </div>
                {f.type === "select" && (
                  <div className="sm:col-span-4">
                    <label className="text-[13px] text-muted">Options, separated by commas</label>
                    <input value={f.options} onChange={(e) => field(i, { options: e.target.value })} className={small} aria-label={`Field ${i + 1} options`} />
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm sm:col-span-4">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={f.required} onChange={(e) => field(i, { required: e.target.checked })} /> required
                  </label>
                  <label className="flex items-center gap-1.5">
                    personal
                    <select value={f.personal} onChange={(e) => field(i, { personal: e.target.value as RawFieldRow["personal"] })} className="field w-auto py-0.5 text-sm">
                      <option value="default">by type</option>
                      <option value="yes">yes</option>
                      <option value="no">no</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5">
                    at most
                    <input value={f.max} onChange={(e) => field(i, { max: e.target.value })} inputMode="numeric" className="field w-20 py-0.5 text-sm" placeholder="by type" />
                    characters
                  </label>
                  <label className="flex min-w-48 flex-1 items-center gap-1.5">
                    help
                    <input value={f.help} onChange={(e) => field(i, { help: e.target.value })} className="field py-0.5 text-sm" />
                  </label>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => set((x) => ({ ...x, fields: [...x.fields, { name: "", type: "text", label: "", required: false, max: "", options: "", personal: "default", help: "" }] }))} className="btn mt-3">
            Add a field
          </button>
        </section>

        <section>
          <h2 className="section-title">Posting</h2>
          <div className="grid gap-4">
            <div>
              <label htmlFor="s-origins" className={label}>
                Takes posts from
              </label>
              <textarea id="s-origins" value={s.origins} onChange={(e) => patch({ origins: e.target.value })} rows={2} className="field" placeholder={"https://example.org"} />
              <p className={hint}>One origin per line. Empty: from anywhere.</p>
            </div>
            <div>
              <label htmlFor="s-redirect" className={label}>
                Afterwards the browser goes to
              </label>
              <input id="s-redirect" value={s.redirect} onChange={(e) => patch({ redirect: e.target.value })} className="field" placeholder={`Empty: the thank-you page at /f/${name}/thanks`} />
            </div>
            <div>
              <label htmlFor="s-thanks" className={label}>
                Thank-you text
              </label>
              <input id="s-thanks" value={s.thanks} onChange={(e) => patch({ thanks: e.target.value })} className="field" placeholder="Thank you. Your message has been received." />
            </div>
          </div>
        </section>

        <section>
          <h2 className="section-title">Notifications</h2>
          <p className="mb-3 text-muted">Where a new submission is announced: a title and the link, never the content. A secret in the URL can be written as <code>${"{"}VAR{"}"}</code> and set in the environment.</p>
          <div className="grid gap-2">
            {s.notify.map((t, i) => (
              <div key={i} className="flex gap-2">
                <select value={t.type} onChange={(e) => target(i, { type: e.target.value as RawTarget["type"] })} className="field w-32" aria-label={`Target ${i + 1} type`}>
                  <option value="ntfy">ntfy</option>
                  <option value="webhook">webhook</option>
                </select>
                <input value={t.url} onChange={(e) => target(i, { url: e.target.value })} className="field min-w-0 flex-1" placeholder={t.type === "ntfy" ? "https://ntfy.sh/your-topic" : "https://hooks.example.org/noticebox"} aria-label={`Target ${i + 1} URL`} />
                <button type="button" onClick={() => set((x) => ({ ...x, notify: x.notify.filter((_, j) => j !== i) }))} aria-label={`Remove target ${i + 1}`} className="btn px-2 text-error">
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => set((x) => ({ ...x, notify: [...x.notify, { type: "ntfy", url: "" }] }))} className="btn mt-3">
            Add a target
          </button>
        </section>

        <section>
          <h2 className="section-title">Retention and link</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="s-retention" className={label}>
                Personal fields are removed
              </label>
              <div className="flex items-center gap-2">
                <input id="s-retention" value={s.retentionDays} onChange={(e) => patch({ retentionDays: e.target.value })} inputMode="numeric" className="field w-24" placeholder="180" />
                <span>days after a submission is closed</span>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="s-link" className={label}>
                Each submission links to
              </label>
              <input id="s-link" value={s.linkUrl} onChange={(e) => patch({ linkUrl: e.target.value })} className="field" placeholder="https://example.org/items/{item_id}" />
              <p className={hint}>A URL with {"{field}"} placeholders, filled from the submission. Empty: no link.</p>
            </div>
            <div>
              <label htmlFor="s-link-label" className={label}>
                Link text
              </label>
              <input id="s-link-label" value={s.linkLabel} onChange={(e) => patch({ linkLabel: e.target.value })} className="field" placeholder="Open" />
            </div>
          </div>
        </section>

        <div>
          {saved.error && (
            <p role="alert" className="mb-3 text-error">
              {saved.error}
            </p>
          )}
          {ok && (
            <p role="status" className="mb-3 text-accent">
              Saved.
            </p>
          )}
          <button type="submit" disabled={saving} className="btn-primary">
            Save the settings
          </button>
        </div>
      </form>

      <section>
        <h2 className="section-title">Remove</h2>
        <p className="text-muted">{hasSubmissions ? "A form with submissions cannot be removed. Download them first, or keep the form." : "The form and its endpoint go; nothing was posted to it yet."}</p>
        <form action={remove}>
          <input type="hidden" name="name" value={name} />
          {removed.error && (
            <p role="alert" className="mt-2 text-error">
              {removed.error}
            </p>
          )}
          <button type="submit" disabled={removing || hasSubmissions} className="btn mt-3 text-error">
            Remove the form
          </button>
        </form>
      </section>
    </div>
  );
}
