import Link from "next/link";
import { notFound } from "next/navigation";
import { KINDS, runtime, submissionsPath } from "@/backend";
import { stateLabel, stateTone, when } from "@/app/_lib/format";
import { StateMenu } from "../../../../StateMenu";

export const dynamic = "force-dynamic";

// One submission: its fields, its state as the dropdown that moves it on, and everything that happened to it.
export default async function SubmissionPage({ params }: { params: Promise<{ form: string; id: string }> }) {
  const { form: name, id } = await params;
  const rt = runtime();
  const form = rt.config.forms[name];
  const s = rt.store.get(id);
  if (!form || !s || s.form !== form.name) notFound();
  const kind = KINDS[s.kind];
  const names = [...Object.keys(form.fields), ...Object.keys(s.fields).filter((n) => !form.fields[n])];
  const shown = names.filter((n) => s.fields[n]);
  const events = rt.store.events(s.id);
  const badge = (state: string) => <span className={`badge ${stateTone(state, kind.closed)}`}>{stateLabel(state)}</span>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="grid gap-6">
        <section className="card">
          <div className="flex flex-wrap items-center gap-3 border-b border-rule px-5 py-3">
            <Link href={submissionsPath(form.name)} className="text-sm text-muted hover:text-ink">
              ← Submissions
            </Link>
            <span className="text-sm text-muted">{when(s.received_at)}</span>
            <code className="text-xs text-muted">{s.id}</code>
            <div className="ml-auto">
              <StateMenu id={s.id} state={s.state} tone={stateTone(s.state, kind.closed)} next={[...(kind.next[s.state] ?? [])]} reasonRequired={[...kind.reasonRequired]} size="lg" withNote />
            </div>
          </div>
          {shown.length === 0 ? (
            <p className="p-5 text-sm text-muted">No fields kept.</p>
          ) : (
            <dl className="grid gap-4 p-5">
              {shown.map((n) => (
                <div key={n}>
                  <dt className="text-xs font-semibold text-muted">{form.fields[n]?.label ?? n}</dt>
                  <dd className="mt-0.5 break-words whitespace-pre-wrap">{s.fields[n]}</dd>
                </div>
              ))}
            </dl>
          )}
          {s.purged_at && <p className="border-t border-rule px-5 py-2 text-xs text-muted">Personal fields removed {when(s.purged_at)}.</p>}
        </section>
      </div>

      <aside className="grid content-start gap-6">
        <section className="card">
          <h2 className="card-title">History</h2>
          <ol className="grid gap-4 p-5 text-sm">
            {events.map((e) => (
              <li key={e.id} className="grid gap-1">
                <div className="text-xs text-muted">{when(e.at)}</div>
                <div>
                  <span className="font-semibold">{e.actor}</span>{" "}
                  {e.to_state === null ? "noted" : e.from_state === null ? <>received as {badge(e.to_state)}</> : <>moved {badge(e.from_state)} to {badge(e.to_state)}</>}
                </div>
                {e.reason && <div className="rounded-md bg-soft px-3 py-2 whitespace-pre-wrap">{e.reason}</div>}
              </li>
            ))}
          </ol>
        </section>
        <section className="card">
          <h2 className="card-title">About</h2>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 p-5 text-sm">
            <dt className="text-muted">Form</dt>
            <dd>{form.title}</dd>
            <dt className="text-muted">Kind</dt>
            <dd>{kind.label}</dd>
            {s.origin && (
              <>
                <dt className="text-muted">From</dt>
                <dd className="break-all">{s.origin}</dd>
              </>
            )}
            {s.closed_at && (
              <>
                <dt className="text-muted">Closed</dt>
                <dd>{when(s.closed_at)}</dd>
              </>
            )}
          </dl>
        </section>
      </aside>
    </div>
  );
}
