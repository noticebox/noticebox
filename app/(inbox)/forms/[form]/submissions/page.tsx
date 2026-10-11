import { notFound } from "next/navigation";
import { linkFor, runtime, submissionPath, summaryOf } from "@/backend";
import { stateTone } from "@/app/_lib/format";
import { SubmissionTable, type Row } from "./SubmissionTable";

export const dynamic = "force-dynamic";

const LIMIT = 500;

// The table of a form: every submission in one table, filtered, sorted and trimmed to the columns wanted in the browser.
export default async function SubmissionsPage({ params }: { params: Promise<{ form: string }> }) {
  const { form: name } = await params;
  const rt = runtime();
  const form = rt.config.forms[name];
  if (!form) notFound();
  const list = rt.store.list({ form: form.name, limit: LIMIT });
  const rows: Row[] = list.map((s) => ({
    id: s.id,
    href: submissionPath(s.form, s.id),
    received_at: s.received_at,
    state: s.state,
    tone: stateTone(s.state, form.states),
    summary: summaryOf(form, s),
    link: linkFor(form, s),
    fields: s.fields,
  }));
  const names = [...Object.keys(form.fields), ...new Set(list.flatMap((s) => Object.keys(s.fields)))].filter((n, i, all) => all.indexOf(n) === i);
  const fields = names.map((n) => ({ name: n, label: form.fields[n]?.label || n }));

  return (
    <div>
      <SubmissionTable rows={rows} states={form.states} fields={fields} linkLabel={form.link ? form.link.label : null} />
      {list.length >= LIMIT && <p className="mt-2 text-[13px] text-muted">The newest {LIMIT} are shown; the download has all of them.</p>}
    </div>
  );
}
