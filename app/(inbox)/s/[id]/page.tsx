import { notFound } from "next/navigation";
import { KINDS, runtime } from "@/backend";
import { when } from "@/app/_lib/format";
import { DecideForm } from "./DecideForm";

export const dynamic = "force-dynamic";

export default async function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rt = runtime();
  const s = rt.store.get(id);
  if (!s) notFound();
  const form = rt.config.forms[s.form];
  const kind = KINDS[s.kind];
  const names = form ? [...Object.keys(form.fields), ...Object.keys(s.fields).filter((n) => !form.fields[n])] : Object.keys(s.fields);
  const shown = names.filter((n) => s.fields[n]);
  const events = rt.store.events(s.id);
  const next = [...(kind.next[s.state] ?? [])];
  return (
    <>
      <h2 className="text-base font-bold">
        {form?.title ?? s.form} <span className="font-normal text-muted">· {kind.label}</span> <code className="text-sm font-normal text-muted">{s.id}</code>
      </h2>
      <p className="mb-4 text-sm text-muted">
        received {when(s.received_at)}
        {s.origin && ` from ${s.origin}`} · state <span className="badge">{s.state}</span>
        {s.closed_at && ` · closed ${when(s.closed_at)}`}
        {s.purged_at && ` · personal fields removed ${when(s.purged_at)}`}
      </p>
      {shown.length === 0 ? (
        <p className="text-muted">No fields kept.</p>
      ) : (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 rounded-sm bg-soft p-3">
          {shown.map((n) => (
            <div key={n} className="contents">
              <dt className="font-semibold">{form?.fields[n]?.label ?? n}</dt>
              <dd className="break-words whitespace-pre-wrap">{s.fields[n]}</dd>
            </div>
          ))}
        </dl>
      )}
      <h2 className="mt-6 mb-2 text-base font-bold">History</h2>
      <ol className="space-y-2 border-l border-rule pl-4">
        {events.map((e) => (
          <li key={e.id}>
            <span className="text-sm text-muted">{when(e.at)}</span> <span className="font-semibold">{e.actor}</span>{" "}
            {e.to_state === null ? (
              "noted"
            ) : e.from_state === null ? (
              <>
                received as <span className="badge">{e.to_state}</span>
              </>
            ) : (
              <>
                moved <span className="badge">{e.from_state}</span> to <span className="badge">{e.to_state}</span>
              </>
            )}
            {e.reason && <div className="whitespace-pre-wrap">{e.reason}</div>}
          </li>
        ))}
      </ol>
      <h2 className="mt-6 mb-2 text-base font-bold">Decide</h2>
      <DecideForm id={s.id} state={s.state} next={next} reasonRequired={[...kind.reasonRequired]} />
    </>
  );
}
