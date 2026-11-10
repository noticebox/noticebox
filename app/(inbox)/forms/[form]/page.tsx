import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KINDS, publicUrl, runtime, submissionsPath } from "@/backend";
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

  return (
    <div className="grid max-w-3xl grid-cols-1 gap-10">
      <p className="text-[22px] leading-snug">
        <Link href={list} className="font-bold hover:underline">
          {open === 0 ? t.overview.noneWaits(kind.label) : t.overview.waiting(open, kind.label)}
        </Link>{" "}
        <span className="text-muted">
          {t.overview.recent(recent, WINDOW)}
        </span>
      </p>

      <section>
        <h2 className="section-title">{t.overview.perDay}</h2>
        <Chart days={days} counts={daily} />
      </section>

      <section>
        <h2 className="section-title">{t.overview.byState}</h2>
        <ul className="flex flex-wrap gap-2">
          {form.states.map((st) => (
            <li key={st.name}>
              <Link href={`${list}?state=${st.name}`} className={`badge ${stateTone(st.name, form.states)} hover:opacity-80`}>
                {stateLabel(st.name)} <span className="font-normal opacity-80">{byState(st.name)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="section-title">{t.overview.posting}</h2>
        <div className="flex gap-2">
          <code className="field min-w-0 truncate bg-soft text-sm leading-6">{endpoint}</code>
          <CopyButton text={endpoint} />
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[max-content_1fr] sm:gap-y-2">
          <dt className="text-muted">{t.overview.origins}</dt>
          <dd className="mb-2 sm:mb-0">{form.origins.length ? form.origins.join(", ") : t.overview.anywhere}</dd>
          <dt className="text-muted">{t.overview.afterwards}</dt>
          <dd className="mb-2 break-all sm:mb-0">{form.redirect ?? t.overview.thanksPage(form.name)}</dd>
          <dt className="text-muted">{t.overview.retention}</dt>
          <dd className="mb-2 sm:mb-0">{t.overview.retentionDays(form.retentionDays)}</dd>
          <dt className="text-muted">{t.overview.announced}</dt>
          <dd className="mb-2 sm:mb-0">{form.notify.length ? form.notify.map((n) => (n.type === "ntfy" ? t.overview.onNtfy(new URL(n.url).host) : t.overview.toWebhook(new URL(n.url).host))).join(t.overview.and) : t.overview.nowhere}</dd>
          {form.link && (
            <>
              <dt className="text-muted">{t.overview.linksTo}</dt>
              <dd className="break-all">{form.link.url}</dd>
            </>
          )}
        </dl>
        <p className="mt-5 text-muted">{form.strict ? t.overview.strict : t.overview.open}</p>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-muted">
              <th className="py-1.5 pr-3 font-bold">{t.overview.field}</th>
              <th className="py-1.5 pr-3 font-bold">{t.overview.type}</th>
              <th className="py-1.5 pr-3 font-bold">{t.overview.required}</th>
              <th className="py-1.5 font-bold">{t.overview.personal}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(form.fields).map(([n, f]) => (
              <tr key={n} className="border-b border-rule last:border-0">
                <td className="py-1.5 pr-3">{n}</td>
                <td className="py-1.5 pr-3">
                  {f.type}
                  {f.type === "select" && <span className="text-muted">: {f.options.join(", ")}</span>}
                </td>
                <td className="py-1.5 pr-3">{f.required ? t.common.yes : ""}</td>
                <td className="py-1.5">{f.personal ? t.common.yes : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
