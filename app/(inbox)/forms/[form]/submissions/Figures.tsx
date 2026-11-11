import Link from "next/link";
import { submissionPath, type Figures as Data } from "@/backend";
import { age, stateLabel } from "@/app/_lib/format";
import { t } from "@/app/_lib/copy";

// A form's figures in one strip above its submissions: what is open, how long the oldest has waited, what was closed
// lately, and when personal fields are next removed (amber: something is about to go, V2). From `Store.figures`,
// which MCP's get_form returns too.
export function Figures({ form, figures: f, now }: { form: string; figures: Data; now: Date }) {
  const parts = (rows: { state: string; n: number }[]) => rows.map((r) => `${r.n} ${stateLabel(r.state)}`).join(t.figures.separator);
  return (
    <dl aria-label={t.figures.label} className="sheet mb-4 grid grid-cols-2 lg:grid-cols-4">
      <Figure name={t.figures.open} value={String(f.open)} detail={f.open ? parts(f.openByState) : t.figures.nothingOpen} />
      <Figure
        name={t.figures.oldest}
        value={f.oldestOpen ? age(f.oldestOpen.received_at, now) : t.figures.oldestNone}
        detail={
          f.oldestOpen && (
            <Link href={submissionPath(form, f.oldestOpen.id)} className="font-mono hover:text-ink hover:underline">
              {f.oldestOpen.id}
            </Link>
          )
        }
      />
      <Figure name={t.figures.closed(f.days)} value={String(f.closed)} detail={f.closed ? parts(f.closedByState) : t.figures.nothingClosed} />
      <Figure
        name={t.figures.erase}
        value={f.nextErase ? t.day(f.nextErase.day) : t.figures.eraseNone}
        detail={f.nextErase ? t.figures.eraseCount(f.nextErase.n) : t.figures.eraseNothing}
        warn={f.nextErase !== null}
      />
    </dl>
  );
}

function Figure({ name, value, detail, warn = false }: { name: string; value: string; detail: React.ReactNode; warn?: boolean }) {
  return (
    <div className="min-w-0 border-rule px-4 py-3 not-last:border-r max-lg:nth-2:border-r-0 max-lg:nth-[-n+2]:border-b">
      <dt className="text-[13px] text-muted">{name}</dt>
      <dd className={`text-[22px] leading-tight font-bold tracking-tight tabular-nums ${warn ? "text-amber" : ""}`}>{value}</dd>
      {detail && <dd className="truncate text-[12px] text-muted">{detail}</dd>}
    </div>
  );
}
