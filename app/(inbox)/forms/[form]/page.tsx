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
  const plural = (n: number) => (n === 1 ? kind.label : `${kind.label}s`);

  return (
    <div className="grid max-w-3xl gap-10">
      <p className="text-[22px] leading-snug">
        <Link href={list} className="font-bold hover:underline">
          {open === 0 ? `No ${kind.label} waits for a decision.` : `${open} ${plural(open)} ${open === 1 ? "waits" : "wait"} for a decision.`}
        </Link>{" "}
        <span className="text-muted">
          {recent} {recent === 1 ? "arrived" : "arrived"} in the last {WINDOW} days.
        </span>
      </p>

      <section>
        <h2 className="section-title">Received per day</h2>
        <Chart days={days} counts={daily} />
      </section>

      <section>
        <h2 className="section-title">By state</h2>
        <ul className="flex flex-wrap gap-2">
          {Object.keys(kind.next).map((s) => (
            <li key={s}>
              <Link href={`${list}?state=${s}`} className={`badge ${stateTone(s, kind.closed)} hover:opacity-80`}>
                {stateLabel(s)} <span className="font-normal opacity-80">{byState(s)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="section-title">Posting to this form</h2>
        <div className="flex gap-2">
          <code className="field truncate bg-soft text-sm leading-6">{endpoint}</code>
          <CopyButton text={endpoint} />
        </div>
        <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
          <dt className="text-muted">Takes posts from</dt>
          <dd>{form.origins.length ? form.origins.join(", ") : "anywhere"}</dd>
          <dt className="text-muted">Afterwards the browser goes to</dt>
          <dd className="break-all">{form.redirect ?? `the thank-you page at /f/${form.name}/thanks`}</dd>
          <dt className="text-muted">Personal fields are removed</dt>
          <dd>{form.retentionDays} days after a submission is closed</dd>
          <dt className="text-muted">New submissions are announced</dt>
          <dd>{[form.notify.ntfy && "on ntfy", form.notify.webhook && "to a webhook"].filter(Boolean).join(" and ") || "nowhere"}</dd>
        </dl>
        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-muted">
              <th className="py-1.5 pr-3 font-bold">Field</th>
              <th className="py-1.5 pr-3 font-bold">Type</th>
              <th className="py-1.5 pr-3 font-bold">Required</th>
              <th className="py-1.5 font-bold">Personal</th>
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
                <td className="py-1.5 pr-3">{f.required ? "yes" : ""}</td>
                <td className="py-1.5">{f.personal ? "yes" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
