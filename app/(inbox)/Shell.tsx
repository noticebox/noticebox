"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon, Mark } from "@/app/_lib/icons";
import { authClient } from "@/app/_lib/auth-client";
import { t } from "@/app/_lib/copy";
import { ThemeSwitch } from "./ThemeSwitch";

export type Box = { name: string; forms: { name: string; title: string; path: string; open: number }[] };

// A small menu under a button: closes on a click elsewhere and on Escape.
function Menu({
  label,
  children,
  align = "left",
  plain = false,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
  plain?: boolean;
}) {
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
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={plain ? "btn border-transparent bg-transparent" : "btn"}
      >
        {label}
      </button>
      {open && (
        <ul
          role="menu"
          onClick={() => setOpen(false)}
          className={`sheet absolute top-full z-20 mt-1 min-w-48 p-1 text-[15px] shadow-lg ${align === "right" ? "right-0" : "left-0"}`}
        >
          {children}
        </ul>
      )}
    </div>
  );
}

const item = "block w-full rounded-md px-2.5 py-1.5 text-left hover:bg-hover";

// The frame of the inbox: a sidebar with the boxes and their forms (a drawer on small screens), a thin bar with who
// is signed in, and the page. A page may add a pane on the right (`data-pane`, the open submission); on wide screens
// it is fixed to the window's edge and the page makes room for it.
export function Shell({ boxes, actor, canSignOut, children }: { boxes: Box[]; actor: string; canSignOut: boolean; children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const close = () => setDrawer(false);

  const nav = (
    <nav aria-label={t.shell.nav} className="flex h-full flex-col">
      <div className="flex h-13 items-center gap-2 px-4">
        <Link href="/" onClick={close} className="flex items-center gap-2 text-[16px] font-bold tracking-tight">
          <Mark className="text-ink" />
          noticebox
        </Link>
        <button type="button" onClick={close} aria-label={t.shell.closeMenu} className="ml-auto rounded-md px-2 py-1 text-muted hover:bg-hover md:hidden">
          <Icon name="close" />
        </button>
      </div>
      <div className="px-2.5 pb-2 [&>div>.btn]:w-full [&>div>.btn]:font-normal">
        <Menu label={<>{t.shell.addNew}</>}>
          <li role="none">
            <Link role="menuitem" href="/forms/new" onClick={close} className={item}>
              {t.shell.newForm}
            </Link>
          </li>
          <li role="none">
            <Link role="menuitem" href="/boxes/new" onClick={close} className={item}>
              {t.shell.newBox}
            </Link>
          </li>
        </Menu>
      </div>
      <div className="flex-1 overflow-y-auto px-2.5 pt-2 pb-4">
        {boxes.length === 0 && <p className="px-2 text-[13px] text-muted">{t.shell.noForms}</p>}
        {boxes.map((b) => {
          const boxPath = `/boxes/${encodeURIComponent(b.name)}`;
          return (
            <div key={b.name} className="mb-5">
              <h2 className="px-2 pb-1 text-[13px] text-muted">
                <Link href={boxPath} onClick={close} aria-current={pathname === boxPath ? "page" : undefined} className="hover:text-ink hover:underline">
                  {b.name}
                </Link>
              </h2>
              <ul>
                {b.forms.map((f) => {
                  const active = pathname === f.path || pathname.startsWith(f.path + "/");
                  return (
                    <li key={f.name}>
                      <Link
                        href={f.path}
                        onClick={close}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 ${active ? "bg-soft font-bold" : "hover:bg-hover"}`}
                      >
                        <span className="truncate">{f.title}</span>
                        <span
                          className={`min-w-5 rounded-full px-1.5 text-center text-[12px] tabular-nums ${f.open ? "bg-accent-soft font-bold text-accent" : "text-muted"}`}
                          aria-label={t.shell.openCount(f.open)}
                        >
                          {f.open}
                        </span>
                      </Link>
                    </li>
                  );
                })}
                {b.forms.length === 0 && <li className="px-2 text-[13px] text-muted">{t.shell.noFormsInBox}</li>}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="grid gap-1.5 px-4 py-4 text-[13px] text-muted">
        <Link href="/settings" onClick={close} className="hover:text-ink hover:underline">
          {t.shell.yourSettings}
        </Link>
        <a href="/export.json" className="hover:text-ink hover:underline">
          {t.shell.download}
        </a>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-58 shrink-0 border-r border-rule md:block">{nav}</aside>
      {drawer && (
        <div className="fixed inset-0 z-30 md:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={close} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-paper shadow-xl">{nav}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col xl:has-[[data-pane]]:pr-[22rem] 2xl:has-[[data-pane]]:pr-[26rem]">
        <div className="sticky top-0 z-10 flex h-13 items-center gap-3 border-b border-rule bg-paper/85 px-4 backdrop-blur md:px-6">
          <button type="button" onClick={() => setDrawer(true)} aria-label={t.shell.openMenu} className="btn px-2 md:hidden">
            <Icon name="menu" />
          </button>
          <div className="ml-auto flex items-center gap-2">
            <ThemeSwitch />
            <Menu
              align="right"
              plain
              label={
                <span className="flex max-w-56 items-center gap-2 font-normal">
                  <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">
                    {initials(actor)}
                  </span>
                  <span className="truncate">{actor}</span>
                  <Icon name="dropdown" className="size-3.5 shrink-0 opacity-70" />
                </span>
              }
            >
              <li role="none">
                <Link role="menuitem" href="/settings" className={item}>
                  {t.shell.yourSettings}
                </Link>
              </li>
              {canSignOut && (
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className={`${item} w-full text-left`}
                    onClick={async () => {
                      await authClient.signOut();
                      router.replace("/login");
                    }}
                  >
                    {t.shell.signOut}
                  </button>
                </li>
              )}
            </Menu>
          </div>
        </div>
        <main className="flex-1 px-4 pt-6 pb-10 md:px-6">{children}</main>
      </div>
    </div>
  );
}

/** Up to two letters for the avatar: "Marcel Bruckner" is MB, "marcel" is M. */
function initials(name: string): string {
  return (
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}
