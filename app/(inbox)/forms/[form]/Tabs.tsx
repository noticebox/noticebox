"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@/app/_lib/copy";

// The tabs of a form: Overview is the form's own page, Submissions everything under /submissions, Settings its file.
export function Tabs({ base }: { base: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: base, label: t.tabs.overview, active: pathname === base },
    { href: `${base}/submissions`, label: t.tabs.submissions, active: pathname.startsWith(`${base}/submissions`) },
    { href: `${base}/settings`, label: t.tabs.settings, active: pathname === `${base}/settings` },
  ];
  return (
    <nav aria-label={t.tabs.nav} className="-mb-px flex gap-7">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.active ? "page" : undefined} className={`border-b-2 pb-2.5 ${t.active ? "border-accent font-bold" : "border-transparent text-muted hover:text-ink"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
