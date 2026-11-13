"use client";

import { useActionState, useState } from "react";
import { type AdminState, deleteForm, updateForm } from "../../../admin";
import { Icon } from "@/app/_lib/icons";
import { t } from "@/app/_lib/copy";

export type RawFieldRow = {
  name: string;
  type: string;
  label: string;
  required: boolean;
  max: string;
  options: string;
  personal: "default" | "yes" | "no";
  help: string;
  accept: string; // a file field's kinds, separated by commas
  maxFiles: string;
  maxMegabytes: string;
};
export type RawTarget = { type: "ntfy" | "webhook"; url: string };
export type StateRow = { name: string; closed: boolean; reason: boolean; deleteAfterMinutes: string };
export type Settings = {
  box: string;
  kind: string;
  strict: boolean;
  states: StateRow[];
  title: string;
  thanks: string;
  origins: string; // one per line
  redirect: string;
  retentionDays: string;
  deleteAfterDays: string;
  linkUrl: string;
  linkLabel: string;
  notify: RawTarget[];
  githubRepo: string;
  githubLabels: string; // comma-separated
  fields: RawFieldRow[];
};

const TYPES = ["text", "textarea", "select", "email", "hidden", "file"];

/** What the settings page sends: the raw form object as the file will hold it. Empty strings mean "not set". */
function toRaw(s: Settings): Record<string, unknown> {
  const fields: Record<string, Record<string, unknown>> = {};
  for (const f of s.fields) {
    const o: Record<string, unknown> = {};
    if (f.type !== "text") o.type = f.type;
    if (f.label.trim()) o.label = f.label.trim();
    if (f.required) o.required = true;
    if (f.max.trim() && f.type !== "file") o.max = Number(f.max);
    if (f.type === "file") {
      const accept = f.accept
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      if (accept.length) o.accept = accept;
      if (f.maxFiles.trim()) o.maxFiles = Number(f.maxFiles);
      if (f.maxMegabytes.trim()) o.maxMegabytes = Number(f.maxMegabytes);
    }
    if (f.type === "select")
      o.options = f.options
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    if (f.personal !== "default") o.personal = f.personal === "yes";
    if (f.help.trim()) o.help = f.help.trim();
    fields[f.name.trim()] = o;
  }
  const raw: Record<string, unknown> = { box: s.box.trim(), kind: s.kind, title: s.title.trim(), fields };
  if (s.strict) raw.strict = true;
  raw.states = s.states.map((st) => {
    const o: Record<string, unknown> = { name: st.name.trim() };
    if (st.closed) o.closed = true;
    if (st.reason) o.reason = true;
    if (st.closed && st.deleteAfterMinutes.trim()) o.deleteAfterMinutes = Number(st.deleteAfterMinutes);
    return o;
  });
  if (s.thanks.trim()) raw.thanks = s.thanks.trim();
  const origins = s.origins
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  if (origins.length) raw.origins = origins;
  if (s.redirect.trim()) raw.redirect = s.redirect.trim();
  if (s.retentionDays.trim()) raw.retentionDays = Number(s.retentionDays);
  if (s.deleteAfterDays.trim()) raw.deleteAfterDays = Number(s.deleteAfterDays);
  if (s.notify.length) raw.notify = s.notify.map((t) => ({ type: t.type, url: t.url.trim() }));
  if (s.linkUrl.trim()) raw.link = s.linkLabel.trim() ? { url: s.linkUrl.trim(), label: s.linkLabel.trim() } : s.linkUrl.trim();
  const labels = s.githubLabels
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (s.githubRepo.trim()) raw.github = labels.length ? { repo: s.githubRepo.trim(), labels } : s.githubRepo.trim();
  return raw;
}

const label = "mb-1 block font-bold";
const hint = "mt-1 text-[13px] text-muted";
const small = "field py-1 text-sm";

// The settings of a form: everything the file says about it, edited as a whole and saved as a whole. The state is
// React's, so a refused save keeps what was typed and shows why it was refused.
const EMPTY_FIELD = (name = ""): RawFieldRow => ({
  name,
  type: "text",
  label: "",
  required: false,
  max: "",
  options: "",
  personal: "default",
  help: "",
  accept: "",
  maxFiles: "",
  maxMegabytes: "",
});

export function FormSettings({
  name,
  boxes,
  initial,
  hasSubmissions,
  seen,
  statesInUse,
}: {
  name: string;
  boxes: string[];
  initial: Settings;
  hasSubmissions: boolean;
  seen: string[];
  statesInUse: string[];
}) {
  const [s, set] = useState<Settings>(initial);
  const [saved, save, saving] = useActionState<AdminState, FormData>(async (prev, data) => {
    const r = await updateForm(prev, data);
    return r;
  }, {});
  const [removed, remove, removing] = useActionState<AdminState, FormData>(deleteForm, {});
  const patch = (p: Partial<Settings>) => set((x) => ({ ...x, ...p }));
  const field = (i: number, p: Partial<RawFieldRow>) => set((x) => ({ ...x, fields: x.fields.map((f, j) => (j === i ? { ...f, ...p } : f)) }));
  const target = (i: number, p: Partial<RawTarget>) => set((x) => ({ ...x, notify: x.notify.map((t, j) => (j === i ? { ...t, ...p } : t)) }));
  const state = (i: number, p: Partial<StateRow>) => set((x) => ({ ...x, states: x.states.map((st, j) => (j === i ? { ...st, ...p } : st)) }));
  const moveState = (i: number, d: -1 | 1) =>
    set((x) => {
      const states = [...x.states];
      const j = i + d;
      if (j < 0 || j >= states.length) return x;
      [states[i], states[j]] = [states[j]!, states[i]!];
      return { ...x, states };
    });
  const described = new Set(s.fields.map((f) => f.name));
  const undescribed = seen.filter((n) => !described.has(n));
  const move = (i: number, d: -1 | 1) =>
    set((x) => {
      const fields = [...x.fields];
      const j = i + d;
      if (j < 0 || j >= fields.length) return x;
      [fields[i], fields[j]] = [fields[j]!, fields[i]!];
      return { ...x, fields };
    });
  const ok = saved.n && !saved.error;

  const sections: [string, string][] = [
    ["form", t.settings.theForm],
    ["fields", t.settings.fields],
    ["states", t.settings.states],
    ["posting", t.settings.posting],
    ["notifications", t.settings.notifications],
    ["retention", t.settings.retentionAndLink],
    ["github", t.settings.github],
    ["remove", t.settings.remove],
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[11rem_minmax(0,48rem)]">
      <nav aria-label={t.settings.sections} className="text-sm max-lg:hidden">
        <ul className="sticky top-20 grid gap-0.5">
          {sections.map(([id, label]) => (
            <li key={id}>
              <a
                href={`#sec-${id}`}
                className={`block rounded-md px-2.5 py-1.5 hover:bg-hover hover:text-ink ${id === "remove" ? "text-error" : "text-muted"}`}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="grid gap-10">
        <form action={save} className="grid gap-10">
          <input type="hidden" name="name" value={name} />
          <input type="hidden" name="form" value={JSON.stringify(toRaw(s))} />

          <section id="sec-form" className="scroll-mt-20">
            <h2 className="section-title">{t.settings.theForm}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="s-title" className={label}>
                  {t.settings.title}
                </label>
                <input id="s-title" value={s.title} onChange={(e) => patch({ title: e.target.value })} className="field" />
              </div>
              <div>
                <label htmlFor="s-box" className={label}>
                  {t.settings.box}
                </label>
                <input id="s-box" list="boxes" value={s.box} onChange={(e) => patch({ box: e.target.value })} className="field" />
                <datalist id="boxes">
                  {boxes.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
                <p className={hint}>{t.settings.boxHint}</p>
              </div>
              <div>
                <span className={label}>{t.settings.kind}</span>
                <p className="py-2">{s.kind}</p>
                <p className={hint}>{t.settings.kindHint}</p>
              </div>
              <div>
                <span className={label}>{t.settings.endpoint}</span>
                <p className="py-2 break-all">/f/{name}</p>
              </div>
            </div>
          </section>

          <section id="sec-fields" className="scroll-mt-20">
            <h2 className="section-title">{t.settings.fields}</h2>
            <p className="mb-3 text-muted">{t.settings.fieldsIntro}</p>
            <label className="mb-4 flex items-start gap-2">
              <input type="checkbox" checked={s.strict} onChange={(e) => patch({ strict: e.target.checked })} className="mt-1" />
              <span>
                <span className="font-bold">{t.settings.strict}</span> <span className="text-muted">{t.settings.strictText}</span>
              </span>
            </label>
            {undescribed.length > 0 && (
              <div className="mb-4 rounded-md bg-soft px-3 py-2 text-sm">
                {t.settings.seen}{" "}
                {undescribed.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => set((x) => ({ ...x, fields: [...x.fields, EMPTY_FIELD(n)] }))}
                    className="mr-1 underline decoration-dotted hover:text-accent"
                  >
                    {n}
                  </button>
                ))}
                <span className="text-muted">{t.settings.seenHint}</span>
              </div>
            )}
            <div className="grid gap-3">
              {s.fields.map((f, i) => (
                <div key={i} className="sheet grid gap-2 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <div>
                    <label className="text-[13px] text-muted">{t.settings.fieldName}</label>
                    <input
                      value={f.name}
                      onChange={(e) => field(i, { name: e.target.value })}
                      className={small}
                      placeholder="email"
                      aria-label={t.settings.fieldN(i + 1, "name")}
                    />
                  </div>
                  <div>
                    <label className="text-[13px] text-muted">{t.settings.fieldType}</label>
                    <select value={f.type} onChange={(e) => field(i, { type: e.target.value })} className={small} aria-label={t.settings.fieldN(i + 1, "type")}>
                      {TYPES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[13px] text-muted">{t.settings.fieldLabel}</label>
                    <input
                      value={f.label}
                      onChange={(e) => field(i, { label: e.target.value })}
                      className={small}
                      aria-label={t.settings.fieldN(i + 1, "label")}
                    />
                  </div>
                  <div className="flex items-end gap-1">
                    <button type="button" onClick={() => move(i, -1)} aria-label={t.settings.moveUp} className="btn px-2" disabled={i === 0}>
                      <Icon name="moveUp" />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} aria-label={t.settings.moveDown} className="btn px-2" disabled={i === s.fields.length - 1}>
                      <Icon name="moveDown" />
                    </button>
                    <button
                      type="button"
                      onClick={() => set((x) => ({ ...x, fields: x.fields.filter((_, j) => j !== i) }))}
                      aria-label={t.settings.removeField(f.name || String(i + 1))}
                      className="btn px-2 text-error"
                    >
                      <Icon name="remove" />
                    </button>
                  </div>
                  {f.type === "file" && (
                    <div className="grid gap-2 sm:col-span-4 sm:grid-cols-[1fr_auto_auto]">
                      <div>
                        <label className="text-[13px] text-muted">{t.settings.accept}</label>
                        <input
                          value={f.accept}
                          onChange={(e) => field(i, { accept: e.target.value })}
                          className={small}
                          placeholder=".stl, .3mf, image/*"
                          aria-label={t.settings.fieldN(i + 1, "accept")}
                        />
                      </div>
                      <div>
                        <label className="text-[13px] text-muted">{t.settings.maxFiles}</label>
                        <input
                          value={f.maxFiles}
                          onChange={(e) => field(i, { maxFiles: e.target.value })}
                          inputMode="numeric"
                          className={`${small} w-20`}
                          placeholder="1"
                          aria-label={t.settings.fieldN(i + 1, "maxFiles")}
                        />
                      </div>
                      <div>
                        <label className="text-[13px] text-muted">{t.settings.maxMegabytes}</label>
                        <input
                          value={f.maxMegabytes}
                          onChange={(e) => field(i, { maxMegabytes: e.target.value })}
                          inputMode="decimal"
                          className={`${small} w-20`}
                          placeholder="10"
                          aria-label={t.settings.fieldN(i + 1, "maxMegabytes")}
                        />
                      </div>
                    </div>
                  )}
                  {f.type === "select" && (
                    <div className="sm:col-span-4">
                      <label className="text-[13px] text-muted">{t.settings.options}</label>
                      <input
                        value={f.options}
                        onChange={(e) => field(i, { options: e.target.value })}
                        className={small}
                        aria-label={t.settings.fieldN(i + 1, "options")}
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm sm:col-span-4">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={f.required} onChange={(e) => field(i, { required: e.target.checked })} /> {t.settings.required}
                    </label>
                    <label className="flex items-center gap-1.5">
                      {t.settings.personal}
                      <select
                        value={f.personal}
                        onChange={(e) => field(i, { personal: e.target.value as RawFieldRow["personal"] })}
                        className="field w-auto py-0.5 text-sm"
                      >
                        <option value="default">{t.settings.byType}</option>
                        <option value="yes">{t.common.yes}</option>
                        <option value="no">{t.common.no}</option>
                      </select>
                    </label>
                    <label className={`flex items-center gap-1.5 ${f.type === "file" ? "hidden" : ""}`}>
                      {t.settings.atMost}
                      <input
                        value={f.max}
                        onChange={(e) => field(i, { max: e.target.value })}
                        inputMode="numeric"
                        className="field w-20 py-0.5 text-sm"
                        placeholder={t.settings.byType}
                      />
                      {t.settings.characters}
                    </label>
                    <label className="flex min-w-48 flex-1 items-center gap-1.5">
                      {t.settings.help}
                      <input value={f.help} onChange={(e) => field(i, { help: e.target.value })} className="field py-0.5 text-sm" />
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => set((x) => ({ ...x, fields: [...x.fields, EMPTY_FIELD()] }))} className="btn mt-3">
              {t.settings.describe}
            </button>
          </section>

          <section id="sec-states" className="scroll-mt-20">
            <h2 className="section-title">{t.settings.states}</h2>
            <p className="mb-3 text-muted">{t.settings.statesIntro}</p>
            <div className="grid gap-2">
              {s.states.map((st, i) => (
                <div key={i} className="sheet flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
                  <input
                    value={st.name}
                    onChange={(e) => state(i, { name: e.target.value })}
                    className={`${small} w-40`}
                    aria-label={t.settings.stateN(i + 1)}
                    placeholder="in_review"
                  />
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={st.closed} onChange={(e) => state(i, { closed: e.target.checked })} /> {t.settings.closed}
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={st.reason} onChange={(e) => state(i, { reason: e.target.checked })} /> {t.settings.needsReason}
                  </label>
                  {st.closed && (
                    <label className="flex items-center gap-1.5 text-sm">
                      {t.settings.stateDeleteAfter}
                      <input
                        value={st.deleteAfterMinutes}
                        onChange={(e) => state(i, { deleteAfterMinutes: e.target.value })}
                        inputMode="numeric"
                        className="field w-16 py-0.5 text-sm"
                        placeholder="–"
                        aria-label={t.settings.stateDeleteAfterN(i + 1)}
                      />
                      {t.settings.stateMinutes}
                    </label>
                  )}
                  <div className="ml-auto flex gap-1">
                    <button type="button" onClick={() => moveState(i, -1)} aria-label={t.settings.moveStateUp} className="btn px-2" disabled={i === 0}>
                      <Icon name="moveUp" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveState(i, 1)}
                      aria-label={t.settings.moveStateDown}
                      className="btn px-2"
                      disabled={i === s.states.length - 1}
                    >
                      <Icon name="moveDown" />
                    </button>
                    <button
                      type="button"
                      onClick={() => set((x) => ({ ...x, states: x.states.filter((_, j) => j !== i) }))}
                      aria-label={t.settings.removeState(st.name || String(i + 1))}
                      className="btn px-2 text-error"
                      disabled={statesInUse.includes(st.name) || s.states.length === 1}
                      title={statesInUse.includes(st.name) ? t.settings.stateInUse : undefined}
                    >
                      <Icon name="remove" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => set((x) => ({ ...x, states: [...x.states, { name: "", closed: false, reason: false, deleteAfterMinutes: "" }] }))}
              className="btn mt-3"
            >
              {t.settings.addState}
            </button>
          </section>

          <section id="sec-posting" className="scroll-mt-20">
            <h2 className="section-title">{t.settings.posting}</h2>
            <div className="grid gap-4">
              <div>
                <label htmlFor="s-origins" className={label}>
                  {t.settings.origins}
                </label>
                <textarea
                  id="s-origins"
                  value={s.origins}
                  onChange={(e) => patch({ origins: e.target.value })}
                  rows={2}
                  className="field"
                  placeholder={"https://example.org"}
                />
                <p className={hint}>{t.settings.originsHint}</p>
              </div>
              <div>
                <label htmlFor="s-redirect" className={label}>
                  {t.settings.redirect}
                </label>
                <input
                  id="s-redirect"
                  value={s.redirect}
                  onChange={(e) => patch({ redirect: e.target.value })}
                  className="field"
                  placeholder={t.settings.redirectPlaceholder(name)}
                />
              </div>
              <div>
                <label htmlFor="s-thanks" className={label}>
                  {t.settings.thanks}
                </label>
                <input
                  id="s-thanks"
                  value={s.thanks}
                  onChange={(e) => patch({ thanks: e.target.value })}
                  className="field"
                  placeholder={t.settings.thanksPlaceholder}
                />
              </div>
            </div>
          </section>

          <section id="sec-notifications" className="scroll-mt-20">
            <h2 className="section-title">{t.settings.notifications}</h2>
            <p className="mb-3 text-muted">
              {t.settings.notificationsIntro}{" "}
              <code>
                ${"{"}VAR{"}"}
              </code>{" "}
              {t.settings.notificationsVar}
            </p>
            <div className="grid gap-2">
              {s.notify.map((tg, i) => (
                <div key={i} className="flex gap-2">
                  <select
                    value={tg.type}
                    onChange={(e) => target(i, { type: e.target.value as RawTarget["type"] })}
                    className="field w-32"
                    aria-label={t.settings.targetN(i + 1, "type")}
                  >
                    <option value="ntfy">ntfy</option>
                    <option value="webhook">webhook</option>
                  </select>
                  <input
                    value={tg.url}
                    onChange={(e) => target(i, { url: e.target.value })}
                    className="field min-w-0 flex-1"
                    placeholder={tg.type === "ntfy" ? "https://ntfy.sh/your-topic" : "https://hooks.example.org/noticebox"}
                    aria-label={t.settings.targetN(i + 1, "URL")}
                  />
                  <button
                    type="button"
                    onClick={() => set((x) => ({ ...x, notify: x.notify.filter((_, j) => j !== i) }))}
                    aria-label={t.settings.removeTarget(i + 1)}
                    className="btn px-2 text-error"
                  >
                    <Icon name="remove" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => set((x) => ({ ...x, notify: [...x.notify, { type: "ntfy", url: "" }] }))} className="btn mt-3">
              {t.settings.addTarget}
            </button>
          </section>

          <section id="sec-retention" className="scroll-mt-20">
            <h2 className="section-title">{t.settings.retentionAndLink}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="s-retention" className={label}>
                  {t.settings.retention}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="s-retention"
                    value={s.retentionDays}
                    onChange={(e) => patch({ retentionDays: e.target.value })}
                    inputMode="numeric"
                    className="field w-24"
                    placeholder="180"
                  />
                  <span>{t.settings.retentionUnit}</span>
                </div>
              </div>
              <div>
                <label htmlFor="s-delete-after" className={label}>
                  {t.settings.deleteAfter}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="s-delete-after"
                    value={s.deleteAfterDays}
                    onChange={(e) => patch({ deleteAfterDays: e.target.value })}
                    inputMode="numeric"
                    className="field w-24"
                    placeholder={t.settings.deleteAfterPlaceholder}
                  />
                  <span>{t.settings.deleteAfterUnit}</span>
                </div>
                <p className={hint}>{t.settings.deleteAfterHint}</p>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="s-link" className={label}>
                  {t.settings.link}
                </label>
                <input
                  id="s-link"
                  value={s.linkUrl}
                  onChange={(e) => patch({ linkUrl: e.target.value })}
                  className="field"
                  placeholder="https://example.org/items/{item_id}"
                />
                <p className={hint}>{t.settings.linkHint}</p>
              </div>
              <div>
                <label htmlFor="s-link-label" className={label}>
                  {t.settings.linkLabel}
                </label>
                <input
                  id="s-link-label"
                  value={s.linkLabel}
                  onChange={(e) => patch({ linkLabel: e.target.value })}
                  className="field"
                  placeholder={t.settings.linkLabelPlaceholder}
                />
              </div>
            </div>
          </section>

          <section id="sec-github" className="scroll-mt-20">
            <h2 className="section-title">{t.settings.github}</h2>
            <p className="mb-3 text-muted">
              {t.settings.githubIntro[0]}
              <em>{t.settings.githubIntro[1]}</em>
              {t.settings.githubIntro[2]}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="s-github-repo" className={label}>
                  {t.settings.repository}
                </label>
                <input
                  id="s-github-repo"
                  value={s.githubRepo}
                  onChange={(e) => patch({ githubRepo: e.target.value })}
                  className="field"
                  placeholder="owner/name"
                />
                <p className={hint}>{t.settings.repositoryHint}</p>
              </div>
              <div>
                <label htmlFor="s-github-labels" className={label}>
                  {t.settings.labels}
                </label>
                <input
                  id="s-github-labels"
                  value={s.githubLabels}
                  onChange={(e) => patch({ githubLabels: e.target.value })}
                  className="field"
                  placeholder="report, triage"
                />
                <p className={hint}>{t.settings.labelsHint}</p>
              </div>
            </div>
          </section>

          <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-rule bg-paper/90 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
            {saved.error && (
              <p role="alert" className="text-error">
                {saved.error}
              </p>
            )}
            {ok && (
              <p role="status" className="text-ok">
                {t.settings.saved}
              </p>
            )}
            <button type="submit" disabled={saving} className="btn-primary ml-auto">
              {t.settings.save}
            </button>
          </div>
        </form>

        <section id="sec-remove" className="sheet scroll-mt-20 border-error/30 p-4">
          <h2 className="mb-1 font-bold">{t.settings.remove}</h2>
          <p className="text-muted">{hasSubmissions ? t.settings.removeBlocked : t.settings.removeText}</p>
          <form action={remove}>
            <input type="hidden" name="name" value={name} />
            {removed.error && (
              <p role="alert" className="mt-2 text-error">
                {removed.error}
              </p>
            )}
            <button type="submit" disabled={removing || hasSubmissions} className="btn mt-3 text-error">
              {t.settings.removeForm}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
