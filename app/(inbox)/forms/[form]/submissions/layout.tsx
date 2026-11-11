import { notFound } from "next/navigation";
import { linkFor, runtime, submissionPath, summaryOf } from "@/backend";
import { stateTone } from "@/app/_lib/format";
import { Figures } from "./Figures";
import { SubmissionTable, type Row } from "./SubmissionTable";
import { t } from "@/app/_lib/copy";

export const dynamic = "force-dynamic";

const LIMIT = 500;

// A form's submissions: the figures, then every submission in one table, filtered, sorted and trimmed to the columns
// wanted in the browser. An open submission is the page below this layout, shown as a pane beside the table (fixed to
// the right on wide screens); the table stays as it was, filters included. On narrow screens the pane takes the place
// of the table until it is closed.
export default async function SubmissionsLayout({ params, children }: { params: Promise<{ form: string }>; children: React.ReactNode }) {
  const { form: name } = await params;
  const rt = runtime();
  const form = rt.config.forms[name];
  if (!form) notFound();
  const now = rt.now();
  const list = rt.store.list({ form: form.name, limit: LIMIT });
  const rows: Row[] = list.map((s) => ({
    id: s.id,
    href: submissionPath(s.form, s.id),
    received_at: s.received_at,
    closed: s.closed_at !== null,
    state: s.state,
    tone: stateTone(s.state, form.states),
    summary: summaryOf(form, s),
    link: linkFor(form, s),
    fields: s.fields,
  }));
  const names = [...Object.keys(form.fields), ...new Set(list.flatMap((s) => Object.keys(s.fields)))].filter((n, i, all) => all.indexOf(n) === i);
  const fields = names.map((n) => ({ name: n, label: form.fields[n]?.label || n }));

  return (
    <div className="group/subs">
      <div className="max-xl:group-has-[[data-pane]]/subs:hidden">
        <Figures form={form.name} figures={rt.store.figures(form, now)} now={now} />
        <SubmissionTable rows={rows} states={form.states} fields={fields} linkLabel={form.link ? form.link.label : null} now={now.toISOString()} />
        {list.length >= LIMIT && <p className="mt-2 text-[13px] text-muted">{t.table.limited(LIMIT)}</p>}
      </div>
      {children}
    </div>
  );
}
