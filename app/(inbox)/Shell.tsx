"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type Box = { name: string; forms: { name: string; title: string; path: string; open: number }[] };

// A small menu under a button: closes on a click elsewhere and on Escape.
function Menu({ label, children, align = "left" }: { label: React.ReactNode; children: React.ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="btn">
        {label}
      </button>
      {open && (
        <ul role="menu" onClick={() => setOpen(false)} className={`sheet absolute top-full z-20 mt-1 min-w-44 py-1 text-[15px] shadow-lg ${align === "right" ? "right-0" : "left-0"}`}>
          {children}
        </ul>
      )}
    </div>
  );
}

const item = "block w-full px-3 py-1.5 text-left hover:bg-soft";

// The frame of the inbox: a sidebar with the boxes and their forms (a drawer on small screens), a thin bar with who
// is signed in, and the page.
export function Shell({ boxes, actor, signOutUrl, children }: { boxes: Box[]; actor: string; signOutUrl: string | null; children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  const close = () => setDrawer(false);

  const nav = (
    <nav aria-label="Forms" className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 px-5">
        <Link href="/" onClick={close} className="flex items-center gap-2 text-[17px] font-bold tracking-tight">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" className="text-accent">
            <path d="M3 7.5 10 3l7 4.5V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M3 7.5h14M10 7.5V17" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
          noticebox
        </Link>
        <button type="button" onClick={close} aria-label="Close the menu" className="ml-auto rounded-md px-2 py-1 text-muted hover:bg-soft md:hidden">
          ✕
        </button>
      </div>
      <div className="px-3 pb-2">
        <Menu label={<>Add new</>}>
          <li role="none">
            <Link role="menuitem" href="/forms/new" onClick={close} className={item}>
              New form
            </Link>
          </li>
          <li role="none">
            <Link role="menuitem" href="/boxes/new" onClick={close} className={item}>
              New box
            </Link>
          </li>
        </Menu>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pt-2 pb-4">
        {boxes.length === 0 && <p className="px-2 text-[13px] text-muted">No forms yet. Add a form, or a box to put forms in.</p>}
        {boxes.map((b) => {
          const boxPath = `/boxes/${encodeURIComponent(b.name)}`;
          return (
            <div key={b.name} className="mb-6">
              <h2 className="px-2 pb-1 text-[13px] font-bold text-muted">
                <Link href={boxPath} onClick={close} aria-current={pathname === boxPath ? "page" : undefined} className="hover:text-ink hover:underline">
                  {b.name}
                </Link>
              </h2>
              <ul>
                {b.forms.map((f) => {
                  const active = pathname === f.path || pathname.startsWith(f.path + "/");
                  return (
                    <li key={f.name}>
                      <Link href={f.path} onClick={close} aria-current={active ? "page" : undefined} className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 ${active ? "bg-accent-soft font-bold text-accent" : "hover:bg-soft"}`}>
                        <span className="truncate">{f.title}</span>
                        <span className={`text-[13px] tabular-nums ${active ? "text-accent" : "text-muted"}`} aria-label={`${f.open} open`}>
                          {f.open}
                        </span>
                      </Link>
                    </li>
                  );
                })}
                {b.forms.length === 0 && <li className="px-2 text-[13px] text-muted">No forms in this box yet.</li>}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="px-5 py-4 text-[13px] text-muted">
        <a href="/export.json" className="hover:text-ink hover:underline">
          Download everything as JSON
        </a>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-rule md:block">{nav}</aside>
      {drawer && (
        <div className="fixed inset-0 z-30 md:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={close} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-paper shadow-xl">{nav}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center gap-3 px-4 md:px-10">
          <button type="button" onClick={() => setDrawer(true)} aria-label="Open the menu" className="btn px-2 md:hidden">
            ☰
          </button>
          <div className="ml-auto">
            <Menu align="right" label={<span className="max-w-48 truncate font-normal">{actor} ▾</span>}>
              <li role="none">
                <Link role="menuitem" href="/settings" className={item}>
                  Your settings
                </Link>
              </li>
              {signOutUrl && (
                <li role="none">
                  <a role="menuitem" href={signOutUrl} className={item}>
                    Sign out
                  </a>
                </li>
              )}
            </Menu>
          </div>
        </div>
        <main className="flex-1 px-4 pt-2 pb-10 md:px-10">{children}</main>
      </div>
    </div>
  );
}
