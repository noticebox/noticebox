import Link from "next/link";
import { notFound } from "next/navigation";
import { KINDS, runtime, submissionsPath } from "@/backend";
import { stateLabel, stateTone, when } from "@/app/_lib/format";
import { StateMenu } from "../../../../StateMenu";

export const dynamic = "force-dynamic";

// One submission: its fields, its state as the dropdown that moves it on, and everything that happened to it. A
// recorded reason is set large: it is what the box exists to keep.
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
    <div>
      <p className="mb-4 text-sm">
        <Link href={submissionsPath(form.name)} className="text-muted hover:text-ink hover:underline">
          All submissions
        </Link>
      </p>
      <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-2">
        <StateMenu id={s.id} state={s.state} tone={stateTone(s.state, kind.closed)} next={[...(kind.next[s.state] ?? [])]} reasonRequired={[...kind.reasonRequired]} size="lg" withNote />
        <span className="text-muted">
          Received {when(s.received_at)}
          {s.origin && ` from ${s.origin}`}
        </span>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section>
          <h2 className="section-title">{kind.label === "report" ? "The report" : "The message"}</h2>
          {shown.length === 0 ? (
            <p className="text-muted">The fields were removed after the retention period; the decision below stands.</p>
          ) : (
            <dl className="grid gap-5">
              {shown.map((n) => (
                <div key={n}>
                  <dt className="text-[13px] text-muted">{form.fields[n]?.label ?? n}</dt>
                  <dd className="mt-0.5 max-w-prose break-words whitespace-pre-wrap">{s.fields[n]}</dd>
                </div>
              ))}
            </dl>
          )}
          {s.purged_at && <p className="mt-4 text-[13px] text-muted">Personal fields removed {when(s.purged_at)}.</p>}
        </section>

        <aside>
          <h2 className="section-title">History</h2>
          <ol className="grid gap-5">
            {events.map((e) => (
              <li key={e.id}>
                <div className="text-[13px] text-muted">{when(e.at)}</div>
                <div>
                  <span className="font-bold">{e.actor}</span>{" "}
                  {e.to_state === null ? "noted" : e.from_state === null ? <>received it as {badge(e.to_state)}</> : <>moved it from {badge(e.from_state)} to {badge(e.to_state)}</>}
                </div>
                {e.reason && <blockquote className={`mt-1.5 border-l-2 pl-3 whitespace-pre-wrap ${e.to_state && kind.reasonRequired.includes(e.to_state) ? "border-accent text-[17px] leading-snug" : "border-rule text-muted"}`}>{e.reason}</blockquote>}
              </li>
            ))}
          </ol>
          <p className="mt-6 text-[13px] text-muted">Submission {s.id}</p>
        </aside>
      </div>
    </div>
  );
}
