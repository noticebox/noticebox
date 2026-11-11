"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { age, stateLabel, stateTone, when } from "@/app/_lib/format";
import { StateMenu } from "../../../StateMenu";
import { Icon } from "@/app/_lib/icons";
import { t } from "@/app/_lib/copy";

export type Row = {
  id: string;
  href: string;
  received_at: string;
  closed: boolean;
  state: string;
  tone: string;
  summary: string;
  link: { url: string; label: string } | null;
  fields: Record<string, string>;
};

type Props = {
  rows: Row[];
  states: { name: string; closed: boolean; reason: boolean }[];
  fields: { name: string; label: string }[]; // every field the form describes or a submission carries
  linkLabel: string | null; // set when the form has a link column
  now: string; // the server's time, so the ages read the same before and after hydration
};

type Sort = { key: string; dir: 1 | -1 };

// On a phone only the state and the summary fit; the id, the time and the age wait for a wider screen. Beside the
// open submission's pane the time steps aside too, unless the screen is wide.
const WIDE = new Set(["id", "received", "age"]);

const BASE = [
  { key: "id", label: t.table.id },
  { key: "received", label: t.table.received },
  { key: "state", label: t.table.state },
  { key: "summary", label: t.table.summary },
  { key: "age", label: t.table.age },
];

// All submissions of a form in one table: filtered by a word and by state, sorted by any column, with the columns
// (also each field) shown or hidden. The state of each row is the dropdown that moves it on; the open submission's
// row is marked (a bar at its edge besides the tint).
export function SubmissionTable({ rows, states, fields, linkLabel, now }: Props) {
  const pathname = usePathname();
  const columns = useMemo(() => [...BASE, ...fields.map((f) => ({ key: `f:${f.name}`, label: f.label }))], [fields]);
  const [query, setQuery] = useState("");
  // What waits is what the inbox is for: it opens on the open ones, unless a link asks for a state (the overview's).
  const asked = useSearchParams().get("state");
  const [show, setShow] = useState(asked && (asked === "all" || asked === "closed" || states.some((s) => s.name === asked)) ? asked : "open"); // all, open, closed or a state's name
  const [sort, setSort] = useState<Sort>({ key: "received", dir: -1 });
  const [hidden, setHidden] = useState<Set<string>>(new Set(fields.map((f) => `f:${f.name}`)));

  const order = (state: string) => states.findIndex((s) => s.name === state);
  const value = (r: Row, key: string): string =>
    key === "received" || key === "age"
      ? r.received_at
      : key === "id"
        ? r.id
        : key === "state"
          ? String(order(r.state)).padStart(3, "0")
          : key === "summary"
            ? r.summary
            : (r.fields[key.slice(2)] ?? "");

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const closed = new Set(states.filter((s) => s.closed).map((s) => s.name));
    const list = rows.filter((r) => {
      if (show === "open" ? closed.has(r.state) : show === "closed" ? !closed.has(r.state) : show !== "all" && r.state !== show) return false;
      const hay = [r.summary, stateLabel(r.state), ...Object.values(r.fields)].join("\n").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    return list.sort((a, b) => sort.dir * value(a, sort.key).localeCompare(value(b, sort.key), undefined, { numeric: true, sensitivity: "base" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, states, query, show, sort]);

  const visible = columns.filter((c) => !hidden.has(c.key));
  const closedNames = new Set(states.filter((s) => s.closed).map((s) => s.name));
  const openCount = rows.filter((r) => !closedNames.has(r.state)).length;
  const perState = new Map<string, number>();
  for (const r of rows) perState.set(r.state, (perState.get(r.state) ?? 0) + 1);
  const stateMenu = useRef<HTMLDetailsElement>(null);
  const toggle = (key: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  // Age is Received the other way round: chosen first, the oldest come first.
  const sortBy = (key: string) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "received" ? -1 : 1 }));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label={t.table.filter}
          placeholder={t.table.filterPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="field w-full sm:w-60"
        />
        <div role="group" aria-label={t.table.byState} className="flex rounded-lg border border-rule bg-card p-0.5">
          {(["open", "closed", "all"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={show === v}
              onClick={() => setShow(v)}
              className={`rounded-md px-2.5 py-1 text-sm ${show === v ? "bg-soft font-bold" : "text-muted hover:text-ink"}`}
            >
              {t.table[v]}{" "}
              <span className="text-[12px] font-normal text-muted tabular-nums">
                {v === "open" ? openCount : v === "closed" ? rows.length - openCount : rows.length}
              </span>
            </button>
          ))}
        </div>
        <details className="relative" ref={stateMenu}>
          <summary className="btn cursor-pointer list-none font-normal">
            {t.table.state}
            <Icon name="dropdown" className="size-3.5 shrink-0 opacity-70" />
          </summary>
          <ul className="sheet absolute left-0 z-20 mt-1 min-w-52 p-1 text-[15px] shadow-lg">
            {states.map((st) => (
              <li key={st.name}>
                <button
                  type="button"
                  aria-pressed={show === st.name}
                  onClick={() => {
                    setShow(st.name);
                    stateMenu.current?.removeAttribute("open");
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-hover"
                >
                  <span className={`badge ${stateTone(st.name, states)}`}>{stateLabel(st.name)}</span>
                  <span className="ml-auto text-[13px] text-muted tabular-nums">{perState.get(st.name) ?? 0}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
        {!["open", "closed", "all"].includes(show) && (
          <button
            type="button"
            onClick={() => setShow("open")}
            className="btn border-accent/40 bg-accent-soft text-accent"
            aria-label={t.table.clearState(stateLabel(show))}
          >
            {stateLabel(show)}
            <Icon name="close" className="size-3.5 shrink-0" />
          </button>
        )}
        <details className="relative">
          <summary className="btn cursor-pointer list-none font-normal">
            {t.table.columns} · {visible.length}
            <Icon name="dropdown" className="size-3.5 shrink-0 opacity-70" />
          </summary>
          <ul className="sheet absolute left-0 z-20 mt-1 min-w-48 p-1 text-[15px] shadow-lg">
            {columns.map((c) => (
              <li key={c.key}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 hover:bg-hover">
                  <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => toggle(c.key)} className="accent-accent" />
                  {c.label}
                </label>
              </li>
            ))}
          </ul>
        </details>
        <span className="ml-auto text-[13px] text-muted tabular-nums" aria-live="polite">
          {t.table.count(shown.length, rows.length)}
        </span>
      </div>
      <div className="sheet overflow-x-auto">
        {shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-muted">
            {rows.length === 0 ? t.table.empty : show === "open" && !query ? t.table.nothingOpen : t.table.noMatch}
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-rule text-left text-[13px] text-muted">
                {visible.map((c) => (
                  <th
                    key={c.key}
                    aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                    className={`px-3 py-2 font-normal whitespace-nowrap first:pl-4 ${c.key === "age" ? "text-right" : ""} ${sort.key === c.key ? "text-ink" : ""} ${WIDE.has(c.key) ? "max-sm:hidden" : ""} ${c.key === "received" ? "max-2xl:group-has-[[data-pane]]/subs:hidden" : ""}`}
                  >
                    <button type="button" onClick={() => sortBy(c.key)} className="hover:text-ink">
                      {c.label}
                      {sort.key === c.key && <Icon name={sort.dir === 1 ? "sortAscending" : "sortDescending"} className="ml-1 inline size-3.5 align-[-2px]" />}
                    </button>
                  </th>
                ))}
                {linkLabel && (
                  <th className="py-2 pr-3">
                    <span className="sr-only">{linkLabel}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const current = pathname === r.href;
                return (
                  <tr
                    key={r.id}
                    aria-current={current ? "true" : undefined}
                    className={`border-b border-rule last:border-0 ${current ? "bg-soft shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-hover"}`}
                  >
                    {visible.map((c) => (
                      <td
                        key={c.key}
                        className={`px-3 py-2.5 align-middle first:pl-4 ${WIDE.has(c.key) ? "max-sm:hidden" : ""} ${c.key === "received" ? "max-2xl:group-has-[[data-pane]]/subs:hidden" : ""}`}
                      >
                        {c.key === "id" ? (
                          <Link href={r.href} className="font-mono text-[12px] text-muted hover:text-ink">
                            {r.id.slice(0, 8)}
                          </Link>
                        ) : c.key === "received" ? (
                          <span className="text-sm whitespace-nowrap text-muted tabular-nums">{when(r.received_at)}</span>
                        ) : c.key === "state" ? (
                          <StateMenu id={r.id} state={r.state} tone={r.tone} states={states} />
                        ) : c.key === "summary" ? (
                          <Link href={r.href} className="block min-w-48 [overflow-wrap:anywhere] hover:underline">
                            {r.summary || <span className="font-normal text-muted italic">{t.table.noText}</span>}
                          </Link>
                        ) : c.key === "age" ? (
                          <span className="block text-right text-sm whitespace-nowrap text-muted tabular-nums">
                            {r.closed ? "—" : age(r.received_at, new Date(now))}
                          </span>
                        ) : (
                          <span className="block max-w-80 [overflow-wrap:anywhere]">{(r.fields[c.key.slice(2)] ?? "").slice(0, 200)}</span>
                        )}
                      </td>
                    ))}
                    {linkLabel && (
                      <td className="py-2 pr-3 text-right">
                        {r.link && (
                          <a
                            href={r.link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={r.link.label}
                            title={r.link.label}
                            className="inline-grid size-7 place-items-center rounded-md text-muted hover:bg-soft hover:text-ink"
                          >
                            <Icon name="external" />
                          </a>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {show === "open" && rows.length > openCount && (
          <p className="flex flex-wrap justify-between gap-2 border-t border-rule px-4 py-2.5 text-[13px] text-muted">
            {t.table.hiddenClosed(rows.length - openCount)}
            <button type="button" onClick={() => setShow("all")} className="font-bold text-accent hover:underline">
              {t.table.showAll}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
