"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { stateLabel, when } from "@/app/_lib/format";
import { StateMenu } from "../../../StateMenu";

export type Row = {
  id: string;
  href: string;
  received_at: string;
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
};

type Sort = { key: string; dir: 1 | -1 };

const BASE = [
  { key: "received", label: "Received" },
  { key: "state", label: "State" },
  { key: "summary", label: "Summary" },
];

// All submissions of a form in one table: filtered by a word and by state, sorted by any column, with the columns
// (also each field) shown or hidden. The state of each row is the dropdown that moves it on.
export function SubmissionTable({ rows, states, fields, linkLabel }: Props) {
  const columns = useMemo(() => [...BASE, ...fields.map((f) => ({ key: `f:${f.name}`, label: f.label }))], [fields]);
  const [query, setQuery] = useState("");
  const [show, setShow] = useState("all"); // all, open, closed or a state's name
  const [sort, setSort] = useState<Sort>({ key: "received", dir: -1 });
  const [hidden, setHidden] = useState<Set<string>>(new Set(fields.map((f) => `f:${f.name}`)));

  const order = (state: string) => states.findIndex((s) => s.name === state);
  const value = (r: Row, key: string): string => (key === "received" ? r.received_at : key === "state" ? String(order(r.state)).padStart(3, "0") : key === "summary" ? r.summary : (r.fields[key.slice(2)] ?? ""));

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
  const toggle = (key: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const sortBy = (key: string) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "received" ? -1 : 1 }));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input type="search" aria-label="Filter submissions" placeholder="Filter…" value={query} onChange={(e) => setQuery(e.target.value)} className="field !mt-0 w-full sm:w-64" />
        <select aria-label="Filter by state" value={show} onChange={(e) => setShow(e.target.value)} className="field !mt-0 w-auto">
          <option value="all">All states</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          {states.map((s) => (
            <option key={s.name} value={s.name}>
              {stateLabel(s.name)}
            </option>
          ))}
        </select>
        <details className="relative">
          <summary className="btn cursor-pointer list-none">Columns</summary>
          <ul className="sheet absolute left-0 z-20 mt-1 min-w-48 py-1 text-[15px] shadow-lg">
            {columns.map((c) => (
              <li key={c.key}>
                <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-soft">
                  <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => toggle(c.key)} />
                  {c.label}
                </label>
              </li>
            ))}
          </ul>
        </details>
        <span className="ml-auto text-[13px] text-muted" aria-live="polite">
          {shown.length} of {rows.length}
        </span>
      </div>
      <div className="sheet overflow-x-auto">
        {shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-muted">{rows.length === 0 ? "Nothing yet. New submissions appear here as they arrive." : "Nothing matches."}</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-rule text-left text-sm text-muted">
                {visible.map((c) => (
                  <th key={c.key} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined} className="py-2 pr-4 pl-4 font-bold whitespace-nowrap first:pl-5">
                    <button type="button" onClick={() => sortBy(c.key)} className="font-bold hover:text-ink">
                      {c.label}
                      <span aria-hidden="true" className="ml-1">{sort.key === c.key ? (sort.dir === 1 ? "↑" : "↓") : ""}</span>
                    </button>
                  </th>
                ))}
                {linkLabel && (
                  <th className="py-2 pr-4">
                    <span className="sr-only">{linkLabel}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-rule align-top last:border-0 hover:bg-soft/60">
                  {visible.map((c) => (
                    <td key={c.key} className="py-3 pr-4 pl-4 first:pl-5">
                      {c.key === "received" ? (
                        <Link href={r.href} className="text-sm whitespace-nowrap text-muted tabular-nums hover:text-ink">
                          {when(r.received_at)}
                        </Link>
                      ) : c.key === "state" ? (
                        <StateMenu id={r.id} state={r.state} tone={r.tone} states={states} />
                      ) : c.key === "summary" ? (
                        <Link href={r.href} className="block min-w-48 [overflow-wrap:anywhere] hover:underline">
                          {r.summary || <span className="text-muted">No text</span>}
                        </Link>
                      ) : (
                        <span className="block max-w-80 [overflow-wrap:anywhere]">{(r.fields[c.key.slice(2)] ?? "").slice(0, 200)}</span>
                      )}
                    </td>
                  ))}
                  {linkLabel && (
                    <td className="py-2.5 pr-4 text-right">
                      {r.link && (
                        <a href={r.link.url} target="_blank" rel="noopener noreferrer" aria-label={r.link.label} title={r.link.label} className="text-muted hover:text-accent">
                          ↗
                        </a>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
