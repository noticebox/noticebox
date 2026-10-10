import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KINDS, publicUrl, runtime, submissionsPath } from "@/backend";
import { stateLabel, stateTone } from "@/app/_lib/format";
import { Chart } from "./Chart";
import { CopyButton } from "./CopyButton";

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
  const open = counts.filter((c) => !kind.closed.includes(c.state)).reduce((a, c) => a + c.n, 0);
  const endpoint = `${publicUrl(await headers(), rt)}/f/${form.name}`;
  const list = submissionsPath(form.name);

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href={list} className="card block p-5 hover:border-accent">
          <p className="text-3xl font-bold">{open}</p>
          <p className="mt-1 text-sm text-muted">Open {kind.label}s</p>
        </Link>
        <div className="card p-5">
          <p className="text-3xl font-bold">{recent}</p>
          <p className="mt-1 text-sm text-muted">Received in the last {WINDOW} days</p>
        </div>
      </div>

      <section className="card">
        <h2 className="card-title">Received per day</h2>
        <div className="p-5">
          <Chart days={days} counts={daily} />
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">By state</h2>
        <ul className="flex flex-wrap gap-2 p-5">
          {Object.keys(kind.next).map((s) => (
            <li key={s}>
              <Link href={`${list}?state=${s}`} className={`badge ${stateTone(s, kind.closed)} hover:opacity-80`}>
                {stateLabel(s)} <span className="opacity-70">{byState(s)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="card-title">Integration</h2>
        <div className="grid gap-5 p-5">
          <div>
            <p className="mb-1 text-sm font-semibold">Form endpoint</p>
            <div className="flex gap-2">
              <code className="field truncate bg-soft font-mono text-xs leading-5">{endpoint}</code>
              <CopyButton text={endpoint} />
            </div>
            <p className="mt-1 text-xs text-muted">A plain form post or JSON. {form.origins.length ? `Only from ${form.origins.join(", ")}.` : "From anywhere."}</p>
          </div>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="font-semibold">After a post</dt>
            <dd className="text-muted">{form.redirect ?? `the thanks page at /f/${form.name}/thanks`}</dd>
            <dt className="font-semibold">Retention</dt>
            <dd className="text-muted">personal fields removed {form.retentionDays} days after closing</dd>
            <dt className="font-semibold">Notifies</dt>
            <dd className="text-muted">{[form.notify.ntfy && "ntfy", form.notify.webhook && "a webhook"].filter(Boolean).join(" and ") || "nobody"}</dd>
          </dl>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule text-left text-xs text-muted uppercase">
                <th className="py-1.5 pr-3 font-semibold">Field</th>
                <th className="py-1.5 pr-3 font-semibold">Type</th>
                <th className="py-1.5 pr-3 font-semibold">Required</th>
                <th className="py-1.5 font-semibold">Personal</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(form.fields).map(([n, f]) => (
                <tr key={n} className="border-b border-rule last:border-0">
                  <td className="py-1.5 pr-3 font-mono text-xs">{n}</td>
                  <td className="py-1.5 pr-3">
                    {f.type}
                    {f.type === "select" && <span className="text-muted"> ({f.options.join(", ")})</span>}
                  </td>
                  <td className="py-1.5 pr-3">{f.required ? "yes" : ""}</td>
                  <td className="py-1.5">{f.personal ? "yes" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
