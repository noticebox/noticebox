// Received per day, as bars on the page: one per day of the window, the last day at the right.
export function Chart({ days, counts }: { days: string[]; counts: Map<string, number> }) {
  const w = 720;
  const h = 150;
  const pad = { l: 24, r: 4, t: 8, b: 22 };
  const max = Math.max(1, ...days.map((d) => counts.get(d) ?? 0));
  const step = (w - pad.l - pad.r) / days.length;
  const y = (n: number) => pad.t + (h - pad.t - pad.b) * (1 - n / max);
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.round(max / 2), max];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Received per day, last ${days.length} days`} className="h-40 w-full">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} className="stroke-rule" strokeWidth="1" />
          <text x={pad.l - 6} y={y(t) + 3.5} textAnchor="end" className="fill-muted text-[11px]">
            {t}
          </text>
        </g>
      ))}
      {days.map((d, i) => {
        const n = counts.get(d) ?? 0;
        const x = pad.l + i * step;
        return (
          <g key={d}>
            {n > 0 && <rect x={x + step * 0.25} y={y(n)} width={step * 0.5} height={y(0) - y(n)} className="fill-accent" />}
            {(i % 5 === 4 || i === days.length - 1) && (
              <text x={x + step / 2} y={h - 6} textAnchor="middle" className="fill-muted text-[11px]">
                {d.slice(5).replace("-", "/")}
              </text>
            )}
            <title>{`${d}: ${n}`}</title>
          </g>
        );
      })}
    </svg>
  );
}
