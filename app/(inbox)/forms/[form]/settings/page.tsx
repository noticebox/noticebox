import { notFound } from "next/navigation";
import { runtime } from "@/backend";
import { FormSettings, type RawFieldRow, type RawTarget, type Settings } from "./FormSettings";

export const dynamic = "force-dynamic";

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

// The settings tab: the form as the file has it (secrets as `${VAR}`), handed to the editor.
export default async function FormSettingsPage({ params }: { params: Promise<{ form: string }> }) {
  const { form: name } = await params;
  const rt = runtime();
  const raw = rt.forms.rawForm(name);
  const form = rt.config.forms[name];
  if (!raw || !form) notFound();
  const fieldsRaw = (raw.fields ?? {}) as Record<string, Record<string, unknown>>;
  const fields: RawFieldRow[] = Object.entries(fieldsRaw).map(([fname, f]) => ({
    name: fname,
    type: str(f.type) || "text",
    label: str(f.label),
    required: f.required === true,
    max: str(f.max),
    options: Array.isArray(f.options) ? f.options.join(", ") : "",
    personal: f.personal === undefined ? "default" : f.personal ? "yes" : "no",
    help: str(f.help),
  }));
  const notifyRaw = raw.notify;
  const notify: RawTarget[] = Array.isArray(notifyRaw)
    ? notifyRaw.map((t: { type: string; url: string }) => ({ type: t.type === "webhook" ? "webhook" : "ntfy", url: str(t.url) }))
    : notifyRaw && typeof notifyRaw === "object"
      ? ([
          ...(str((notifyRaw as Record<string, unknown>).ntfy) ? [{ type: "ntfy", url: str((notifyRaw as Record<string, unknown>).ntfy) }] : []),
          ...(str((notifyRaw as Record<string, unknown>).webhook) ? [{ type: "webhook", url: str((notifyRaw as Record<string, unknown>).webhook) }] : []),
        ] as RawTarget[])
      : [];
  const link = raw.link;
  const initial: Settings = {
    box: form.box,
    kind: form.kind,
    title: str(raw.title) || name,
    thanks: str(raw.thanks),
    origins: Array.isArray(raw.origins) ? raw.origins.join("\n") : "",
    redirect: str(raw.redirect),
    retentionDays: str(raw.retentionDays),
    linkUrl: typeof link === "string" ? link : str((link as Record<string, unknown> | undefined)?.url),
    linkLabel: typeof link === "object" && link ? str((link as Record<string, unknown>).label) : "",
    notify,
    fields,
  };
  const hasSubmissions = rt.store.counts().some((c) => c.form === name && c.n > 0);
  return <FormSettings name={name} boxes={rt.config.boxes} initial={initial} hasSubmissions={hasSubmissions} />;
}
