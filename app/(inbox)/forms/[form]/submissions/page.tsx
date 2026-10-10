import Link from "next/link";
import { notFound } from "next/navigation";
import { KINDS, runtime, submissionPath, submissionsPath, summaryOf } from "@/backend";
import { stateLabel, stateTone, when } from "@/app/_lib/format";
import { StateMenu } from "../../../StateMenu";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

// The table of a form: what is open by default, one state or everything on request, each row with its state as the
// dropdown that moves it on.
export default async function SubmissionsPage({ params, searchParams }: { params: Promise<{ form: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { form: name } = await params;
  const rt = runtime();
  const form = rt.config.forms[name];
  if (!form) notFound();
  const kind = KINDS[form.kind];
  const q = await searchParams;
  const state = one(q.state);
  const show = state ? "state" : one(q.show) === "all" ? "all" : one(q.show) === "closed" ? "closed" : "open";
  const rows = rt.store.list({ form: form.name, state, open: show === "open" ? true : show === "closed" ? false : undefined, limit: 200 });
  const base = submissionsPath(form.name);
  const filters = [
    { href: base, label: "Open", active: show === "open" },
    { href: `${base}?show=closed`, label: "Closed", active: show === "closed" },
    { href: `${base}?show=all`, label: "All", active: show === "all" },
    ...Object.keys(kind.next).map((s) => ({ href: `${base}?state=${s}`, label: stateLabel(s), active: state === s })),
  ];

  return (
    <section className="card">
      <div className="flex flex-wrap gap-1 border-b border-rule px-3 py-2">
        {filters.map((f) => (
          <Link key={f.label} href={f.href} aria-current={f.active ? "page" : undefined} className={`rounded-md px-2.5 py-1 text-sm ${f.active ? "bg-soft font-semibold" : "text-muted hover:text-ink"}`}>
            {f.label}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted">Nothing here.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-xs text-muted uppercase">
              <th className="hidden py-2 pr-3 pl-5 font-semibold sm:table-cell">Received</th>
              <th className="py-2 pr-3 pl-4 font-semibold sm:pl-0">State</th>
              <th className="py-2 pr-5 font-semibold">Summary</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const href = submissionPath(s.form, s.id);
              return (
                <tr key={s.id} className="border-b border-rule align-top last:border-0 hover:bg-soft">
                  <td className="hidden py-2.5 pr-3 pl-5 whitespace-nowrap sm:table-cell">
                    <Link href={href} className="text-muted hover:text-ink">
                      {when(s.received_at)}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 pl-4 sm:pl-0">
                    <StateMenu id={s.id} state={s.state} tone={stateTone(s.state, kind.closed)} next={[...(kind.next[s.state] ?? [])]} reasonRequired={[...kind.reasonRequired]} />
                  </td>
                  <td className="py-2.5 pr-5">
                    <Link href={href} className="block break-words hover:underline">
                      {summaryOf(form, s) || <span className="text-muted">(no text)</span>}
                    </Link>
                    <span className="text-xs text-muted sm:hidden">{when(s.received_at)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {rows.length >= 200 && <p className="border-t border-rule px-5 py-2 text-xs text-muted">The newest 200; the rest is in the export.</p>}
    </section>
  );
}
