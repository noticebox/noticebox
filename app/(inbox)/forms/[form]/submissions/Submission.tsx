import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { casePath, filePath, isPicture, issueUrl, KINDS, linkFor, publicUrl, runtime, stateOf, submissionPath, submissionsPath, summaryOf } from "@/backend";
import { stateLabel, stateTone, when } from "@/app/_lib/format";
import { StateMenu } from "../../../StateMenu";
import { Icon } from "@/app/_lib/icons";
import { t } from "@/app/_lib/copy";

const DAY = 86400000;

// One submission: its state as the dropdown that moves it on, its fields (the personal ones marked, with when they
// go), and everything that happened to it, a recorded reason set apart since it is what the box exists to keep. Shown
// as the pane beside the table, or as a page of its own with the fields and the history side by side.
export async function Submission({ name, id, as }: { name: string; id: string; as: "pane" | "page" }) {
  const rt = runtime();
  const form = rt.config.forms[name];
  const s = rt.store.get(id);
  if (!form || !s || s.form !== form.name) notFound();
  const kind = KINDS[s.kind];
  const states = form.states;
  const names = [...Object.keys(form.fields), ...Object.keys(s.fields).filter((n) => !form.fields[n])];
  const shown = names.filter((n) => s.fields[n]);
  const personal = (n: string) => form.fields[n]?.personal ?? true; // undescribed fields count as personal
  const events = rt.store.events(s.id);
  const files = rt.store.files(s.id);
  const link = linkFor(form, s);
  const issue = issueUrl(form, s, publicUrl(await headers(), rt));
  const list = submissionsPath(form.name);
  const badge = (state: string) => <span className={`badge ${stateTone(state, states)}`}>{stateLabel(state)}</span>;
  const dot = (state: string | null) => {
    const tone = state ? stateTone(state, states) : "badge-off";
    return { "badge-open": "bg-accent", "badge-review": "bg-amber", "badge-done": "bg-ok", "badge-off": "bg-muted" }[tone] ?? "bg-muted";
  };
  const minutes = s.closed_at ? (form.states.find((st) => st.name === s.state)?.deleteAfterMinutes ?? null) : null;
  const retention = s.purged_at
    ? t.submission.purgedAt(when(s.purged_at))
    : minutes !== null
      ? t.submission.deletedSoon(minutes)
      : s.closed_at
        ? t.submission.removedOn(t.day(new Date(new Date(s.closed_at).getTime() + form.retentionDays * DAY).toISOString()))
        : t.submission.keptUntilClosed(form.retentionDays);

  const pane = as === "pane";

  const top = (
    <div className="flex h-13 items-center gap-1 border-b border-rule px-4 text-[13px] text-muted xl:sticky xl:top-0 xl:bg-card">
      <Link href={list} className={`hover:text-ink hover:underline ${pane ? "xl:hidden" : ""}`}>
        ← {t.submission.all}
      </Link>
      <span className={`font-mono ${pane ? "max-xl:hidden" : "ml-3 max-sm:hidden"}`}>{s.id}</span>
      <Link
        href={pane ? casePath(form.name, s.id) : submissionPath(form.name, s.id)}
        aria-label={pane ? t.submission.asPage : t.submission.asPane}
        title={pane ? t.submission.asPage : t.submission.asPane}
        className="ml-auto grid size-8 place-items-center rounded-md hover:bg-hover hover:text-ink"
      >
        <Icon name={pane ? "expand" : "collapse"} />
      </Link>
      <Link
        href={list}
        aria-label={t.submission.close}
        title={t.submission.close}
        className="grid size-8 place-items-center rounded-md hover:bg-hover hover:text-ink"
      >
        <Icon name="close" />
      </Link>
    </div>
  );
  const head = (
    <section className="border-b border-rule p-5">
      <h2 className="text-[18px] leading-snug font-bold tracking-tight [overflow-wrap:anywhere]">{summaryOf(form, s) || t.table.noText}</h2>
      <p className="mt-1 text-[13px] text-muted">{t.submission.received(when(s.received_at), s.origin)}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StateMenu id={s.id} state={s.state} tone={stateTone(s.state, states)} states={states} size="lg" withNote />
        {link && (
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="btn">
            {link.label}
            <Icon name="external" />
          </a>
        )}
        {issue && (
          <a href={issue} target="_blank" rel="noopener noreferrer" className="btn">
            {t.submission.openIssue}
            <Icon name="external" />
          </a>
        )}
      </div>
    </section>
  );
  const fieldsPart = (
    <section className="border-b border-rule p-5">
      <h3 className="label">{kind.label === "report" ? t.submission.theReport : t.submission.theMessage}</h3>
      {shown.length === 0 && files.length === 0 ? (
        <p className="text-muted">{t.submission.purgedFields}</p>
      ) : (
        <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 gap-y-3">
          {shown.map((n) => (
            <div key={n} className="contents">
              <dt className="pt-px text-[13px] text-muted [overflow-wrap:anywhere]">
                {form.fields[n]?.label || n}
                {personal(n) && <span className="block text-[12px] text-amber">{t.submission.personal}</span>}
              </dt>
              <dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">{s.fields[n]}</dd>
            </div>
          ))}
        </dl>
      )}
      {files.length > 0 && (
        // A stranger's files: pictures are shown (served sandboxed, never sniffed), everything else is only a download.
        <div className="mt-4">
          <h4 className="text-[13px] text-muted">
            {t.submission.files} <span className="text-[12px] text-amber">{t.submission.personal}</span>
          </h4>
          <ul className="mt-2 grid gap-2">
            {files.map((f) => (
              <li key={f.id} className="rounded-lg border border-rule p-2">
                {isPicture(f) && (
                  // eslint-disable-next-line @next/next/no-img-element -- a stranger's upload, served by our own route, not an optimisable asset
                  <img src={`${filePath(f.id)}?inline=1`} alt={f.name} className="mb-2 max-h-64 rounded object-contain" loading="lazy" />
                )}
                <a
                  href={filePath(f.id)}
                  download={f.name}
                  className="flex items-center gap-2 [overflow-wrap:anywhere]"
                  aria-label={t.submission.download(f.name)}
                >
                  <Icon name="download" />
                  <span>{f.name}</span>
                  <span className="ml-auto shrink-0 text-[13px] text-muted">{t.submission.size(f.size)}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-4 rounded-lg border border-rule px-3 py-2 text-[13px] text-muted">{retention}</p>
    </section>
  );
  const history = (
    <section className="p-5">
      <h3 className="label flex justify-between">
        <span>{t.submission.history}</span>
        <span className="font-normal">{t.submission.appendOnly}</span>
      </h3>
      <ol>
        {events.map((e) => (
          <li
            key={e.id}
            className="relative pb-5 pl-6 before:absolute before:top-5 before:bottom-0 before:left-[5px] before:w-px before:bg-rule last:pb-0 last:before:hidden"
          >
            <span aria-hidden="true" className={`absolute top-1.5 left-0 size-[11px] rounded-full ring-2 ring-card ${dot(e.to_state)}`} />
            <div className="text-[14px]">
              <span className="font-bold">{e.actor}</span>{" "}
              {e.to_state === null ? (
                t.submission.noted
              ) : e.from_state === null ? (
                <>
                  {t.submission.receivedAs} {badge(e.to_state)}
                </>
              ) : (
                <>
                  {t.submission.movedFrom} {badge(e.from_state)} {t.submission.to} {badge(e.to_state)}
                </>
              )}
            </div>
            <div className="text-[12px] text-muted tabular-nums">{when(e.at)}</div>
            {e.reason && (
              <blockquote
                className={`mt-1.5 rounded-lg px-3 py-2 whitespace-pre-wrap [overflow-wrap:anywhere] ${e.to_state && stateOf(states, e.to_state)?.reason ? "bg-soft text-ink" : "bg-soft text-muted"}`}
              >
                {e.reason}
              </blockquote>
            )}
          </li>
        ))}
      </ol>
    </section>
  );

  if (pane)
    return (
      <aside
        data-pane
        aria-label={t.submission.pane(s.id)}
        className="sheet overflow-hidden xl:fixed xl:inset-y-0 xl:right-0 xl:z-20 xl:w-[22rem] xl:overflow-y-auto xl:rounded-none xl:border-y-0 xl:border-r-0 2xl:w-[26rem]"
      >
        {top}
        {head}
        {fieldsPart}
        {history}
      </aside>
    );
  return (
    <article aria-label={t.submission.pane(s.id)} className="sheet overflow-hidden">
      {top}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="lg:border-r lg:border-rule">
          {head}
          <div className="[&>section]:border-b-0">{fieldsPart}</div>
        </div>
        <div className="max-lg:border-t max-lg:border-rule">{history}</div>
      </div>
    </article>
  );
}
