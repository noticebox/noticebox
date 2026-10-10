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
  const empty = show === "open" ? `Nothing open. New ${kind.label}s appear here as they arrive.` : "Nothing here.";

  return (
    <div>
      <nav aria-label="Filter" className="mb-3 flex flex-wrap gap-1 text-sm">
        {filters.map((f, i) => (
          <Link key={f.label} href={f.href} aria-current={f.active ? "page" : undefined} className={`rounded-md px-2.5 py-1 ${f.active ? "bg-soft font-bold" : "text-muted hover:text-ink"} ${i === 3 ? "ml-3" : ""}`}>
            {f.label}
          </Link>
        ))}
      </nav>
      <div className="sheet overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-muted">{empty}</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-rule text-left text-sm text-muted">
                <th className="hidden py-2 pr-3 pl-5 font-bold sm:table-cell">Received</th>
                <th className="py-2 pr-3 pl-4 font-bold sm:pl-0">State</th>
                <th className="py-2 pr-5 font-bold">Summary</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const href = submissionPath(s.form, s.id);
                return (
                  <tr key={s.id} className="border-b border-rule align-top last:border-0 hover:bg-soft/60">
                    <td className="hidden py-3 pr-3 pl-5 text-sm whitespace-nowrap text-muted tabular-nums sm:table-cell">
                      <Link href={href} className="hover:text-ink">
                        {when(s.received_at)}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3 pl-4 sm:pl-0">
                      <StateMenu id={s.id} state={s.state} tone={stateTone(s.state, kind.closed)} next={[...(kind.next[s.state] ?? [])]} reasonRequired={[...kind.reasonRequired]} />
                    </td>
                    <td className="py-3 pr-5">
                      <Link href={href} className="block break-words hover:underline">
                        {summaryOf(form, s) || <span className="text-muted">No text</span>}
                      </Link>
                      <span className="text-[13px] text-muted sm:hidden">{when(s.received_at)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {rows.length >= 200 && <p className="mt-2 text-[13px] text-muted">The newest 200 are shown; the download has all of them.</p>}
    </div>
  );
}
