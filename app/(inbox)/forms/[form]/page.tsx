import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KINDS, publicUrl, runtime, submissionsPath, type Field } from "@/backend";
import { stateLabel, stateTone } from "@/app/_lib/format";
import { Chart } from "./Chart";
import { CopyButton } from "./CopyButton";
import { t } from "@/app/_lib/copy";

export const dynamic = "force-dynamic";

const WINDOW = 30;

// The overview of a form: what waits, what came in lately, and what a page needs to post to it.
export default async function OverviewPage({ params }: { params: Promise<{ form: string }> }) {
  const { form: name } = await params;
  const rt = runtime();
  const form = rt.config.forms[name];
  if (!form) notFound();
  const kind = KINDS[form.kind];
  const now = rt.now();
  const since = new Date(now.getTime() - (WINDOW - 1) * 86400000);
  since.setUTCHours(0, 0, 0, 0);
  const days = Array.from({ length: WINDOW }, (_, i) => new Date(since.getTime() + i * 86400000).toISOString().slice(0, 10));
  const daily = new Map(rt.store.daily(form.name, since).map((d) => [d.day, d.n]));
  const recent = [...daily.values()].reduce((a, n) => a + n, 0);
  const counts = rt.store.counts().filter((c) => c.form === form.name);
  const byState = (s: string) => counts.find((c) => c.state === s)?.n ?? 0;
  const open = counts.filter((c) => !form.states.find((s) => s.name === c.state)?.closed).reduce((a, c) => a + c.n, 0);
  const endpoint = `${publicUrl(await headers(), rt)}/f/${form.name}`;
  const list = submissionsPath(form.name);

  const kept = counts.reduce((a, c) => a + c.n, 0);
  const tone = { "badge-open": "bg-accent", "badge-review": "bg-amber", "badge-done": "bg-ok", "badge-off": "bg-muted" } as Record<string, string>;
  const card = "sheet p-5";
  const h2 = "mb-3 flex items-baseline justify-between gap-3 text-sm font-bold";

  return (
    <div className="grid grid-cols-1 gap-4">
      <p className="mb-2 text-[20px] leading-snug">
        <Link href={list} className="font-bold decoration-rule underline-offset-4 hover:underline">
          {open === 0 ? t.overview.noneWaits(kind.label) : t.overview.waiting(open, kind.label)}
        </Link>{" "}
        <span className="text-muted">{t.overview.recent(recent, WINDOW)}</span>
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className={card}>
          <h2 className={h2}>
            {t.overview.perDay} <span className="font-normal text-muted">{t.overview.lastDays(WINDOW)}</span>
          </h2>
          <Chart days={days} counts={daily} />
        </section>

        <section className={card}>
          <h2 className={h2}>
            {t.overview.byState} <span className="font-normal text-muted">{t.overview.kept(kept)}</span>
          </h2>
          <ul className="grid gap-2.5">
            {form.states.map((st) => {
              const n = byState(st.name);
              const cls = stateTone(st.name, form.states);
              return (
                <li key={st.name}>
                  <Link href={`${list}?state=${st.name}`} className="grid grid-cols-[7.5rem_minmax(0,1fr)_2rem] items-center gap-3 text-sm hover:opacity-80">
                    <span className={`badge ${cls} justify-self-start`}>{stateLabel(st.name)}</span>
                    <span aria-hidden="true" className="h-2 overflow-hidden rounded bg-soft">
                      <span className={`block h-full rounded ${tone[cls]}`} style={{ width: `${kept ? (100 * n) / kept : 0}%` }} />
                    </span>
                    <span className="text-right text-muted tabular-nums">{n}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className={card}>
        <h2 className={h2}>{t.overview.posting}</h2>
        <div className="flex gap-2">
          <code className="field min-w-0 truncate bg-soft font-mono text-sm leading-6">{endpoint}</code>
          <CopyButton text={endpoint} />
        </div>
        <p className="mt-4 mb-1.5 text-[13px] text-muted">{t.overview.snippet}</p>
        <pre className="overflow-x-auto rounded-lg bg-soft px-4 py-3 font-mono text-[12px] leading-relaxed">{snippet(endpoint, form.fields)}</pre>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr] sm:gap-y-2">
          <dt className="text-muted">{t.overview.origins}</dt>
          <dd className="mb-2 sm:mb-0">{form.origins.length ? form.origins.join(", ") : t.overview.anywhere}</dd>
          <dt className="text-muted">{t.overview.afterwards}</dt>
          <dd className="mb-2 break-all sm:mb-0">{form.redirect ?? t.overview.thanksPage(form.name)}</dd>
          <dt className="text-muted">{t.overview.retention}</dt>
          <dd className="mb-2 sm:mb-0">{t.overview.retentionDays(form.retentionDays)}</dd>
          <dt className="text-muted">{t.overview.deleted}</dt>
          <dd className="mb-2 sm:mb-0">{form.deleteAfterDays === null ? t.overview.deletedNever : t.overview.deletedDays(form.deleteAfterDays)}</dd>
          <dt className="text-muted">{t.overview.announced}</dt>
          <dd className="mb-2 sm:mb-0">
            {form.notify.length
              ? form.notify
                  .map((n) => (n.type === "ntfy" ? t.overview.onNtfy(new URL(n.url).host) : t.overview.toWebhook(new URL(n.url).host)))
                  .join(t.overview.and)
              : t.overview.nowhere}
          </dd>
          {form.link && (
            <>
              <dt className="text-muted">{t.overview.linksTo}</dt>
              <dd className="break-all">{form.link.url}</dd>
            </>
          )}
        </dl>
      </section>

      <section className={card}>
        <h2 className={h2}>
          {t.settings.fields} <span className="font-normal text-muted">{form.strict ? t.overview.strict : t.overview.open}</span>
        </h2>
        <div className="overflow-x-auto rounded-lg border border-rule">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule text-left text-[13px] text-muted">
                <th className="px-3 py-2 font-normal">{t.overview.field}</th>
                <th className="px-3 py-2 font-normal">{t.overview.type}</th>
                <th className="px-3 py-2 font-normal">{t.overview.required}</th>
                <th className="px-3 py-2 font-normal">{t.overview.personal}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(form.fields).map(([n, f]) => (
                <tr key={n} className="border-b border-rule last:border-0">
                  <td className="px-3 py-2 font-mono text-[13px]">{n}</td>
                  <td className="px-3 py-2">
                    {f.type}
                    {f.type === "select" && <span className="text-muted">: {f.options.join(", ")}</span>}
                  </td>
                  <td className="px-3 py-2">{f.required ? t.common.yes : ""}</td>
                  <td className="px-3 py-2 font-bold text-amber">{f.personal ? t.common.yes : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** A plain HTML form that posts to this one, from its described fields: what a page can start from (V5: no script). */
function snippet(endpoint: string, fields: Record<string, Field>): string {
  const req = (f: Field) => (f.required ? " required" : "");
  const lines = Object.entries(fields).map(([n, f]) =>
    f.type === "textarea"
      ? `  <textarea name="${n}"${req(f)}></textarea>`
      : f.type === "select"
        ? `  <select name="${n}"${req(f)}>${f.options.map((o) => `<option>${o}</option>`).join("")}</select>`
        : `  <input name="${n}" type="${f.type === "email" || f.type === "hidden" ? f.type : "text"}"${req(f)}>`,
  );
  return [`<form method="post" action="${endpoint}">`, ...lines, `  <button>${t.overview.snippetButton}</button>`, `</form>`].join("\n");
}
