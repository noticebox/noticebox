"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type Box = { name: string; forms: { name: string; title: string; path: string; open: number }[] };

// The frame of the inbox: a sidebar with the boxes and their forms (a drawer on small screens), a header bar with
// who is signed in, and the page.
export function Shell({ boxes, actor, children }: { boxes: Box[]; actor: string; children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-rule px-5">
        <Link href="/" onClick={() => setDrawer(false)} className="flex items-center gap-2 font-bold tracking-tight">
          <span aria-hidden="true" className="inline-block size-5 rounded-sm bg-accent" />
          noticebox
        </Link>
        <button type="button" onClick={() => setDrawer(false)} aria-label="Close menu" className="ml-auto text-muted md:hidden">
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {boxes.map((b) => (
          <div key={b.name} className="mb-5">
            <h2 className="px-2 pb-1 text-xs font-bold tracking-wider text-muted uppercase">{b.name}</h2>
            <ul>
              {b.forms.map((f) => {
                const active = pathname === f.path || pathname.startsWith(f.path + "/");
                return (
                  <li key={f.name}>
                    <Link href={f.path} onClick={() => setDrawer(false)} aria-current={active ? "page" : undefined} className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ${active ? "bg-accent-soft font-semibold text-accent" : "hover:bg-soft"}`}>
                      <span className="truncate">{f.title}</span>
                      {f.open > 0 && <span className={`ml-2 rounded-full px-1.5 text-xs font-semibold ${active ? "bg-accent text-on-accent" : "bg-soft text-muted"}`}>{f.open}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-rule px-5 py-3 text-xs text-muted">
        <a href="/export.json" className="hover:underline">
          Export everything (JSON)
        </a>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-r border-rule bg-card md:block">{nav}</aside>
      {drawer && (
        <div className="fixed inset-0 z-30 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-card shadow-xl">{nav}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-rule bg-card px-4 md:px-8">
          <button type="button" onClick={() => setDrawer(true)} aria-label="Open menu" className="btn px-2 md:hidden">
            ☰
          </button>
          <span className="ml-auto text-sm text-muted">{actor}</span>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
