import Link from "next/link";
import { KINDS, runtime, summaryOf } from "@/backend";
import { when } from "@/app/_lib/format";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const rt = runtime();
  const q = await searchParams;
  const form = one(q.form);
  const state = one(q.state);
  const open = state ? undefined : one(q.open) !== "0";
  const rows = rt.store.list({ form, state, open });
  const counts = rt.store.counts();
  const title = state ? state : open === false ? "Closed" : "Open";
  return (
    <>
      <p className="mb-4 text-sm text-muted">
        {Object.values(rt.config.forms).map((f, i) => {
          const n = counts.filter((c) => c.form === f.name && !KINDS[f.kind].closed.includes(c.state)).reduce((a, c) => a + c.n, 0);
          return (
            <span key={f.name}>
              {i > 0 && " · "}
              <Link href={`/?form=${encodeURIComponent(f.name)}`}>{f.title}</Link>: {n} open
            </span>
          );
        })}
      </p>
      <h2 className="mb-2 text-base font-bold">
        {title}
        {form && <span className="font-normal text-muted"> in {form}</span>}
      </h2>
      {rows.length === 0 ? (
        <p className="text-muted">Nothing here.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-rule text-left">
              <th className="py-1.5 pr-3 font-semibold">Received</th>
              <th className="py-1.5 pr-3 font-semibold">Form</th>
              <th className="py-1.5 pr-3 font-semibold">State</th>
              <th className="py-1.5 font-semibold">Summary</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-b border-rule align-top">
                <td className="py-1.5 pr-3 whitespace-nowrap">
                  <Link href={`/s/${s.id}`} className="text-accent underline-offset-2 hover:underline">
                    {when(s.received_at)}
                  </Link>
                </td>
                <td className="py-1.5 pr-3">{s.form}</td>
                <td className="py-1.5 pr-3">
                  <span className="badge">{s.state}</span>
                </td>
                <td className="py-1.5 break-words">{summaryOf(rt.config.forms[s.form], s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
