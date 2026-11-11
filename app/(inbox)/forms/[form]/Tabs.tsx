"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@/app/_lib/copy";

// The tabs of a form: Submissions everything under /submissions and a submission's own page (with how many the form keeps), Overview the form's
// own page, Settings its file. The current tab is bold and underlined, not only darker.
export function Tabs({ base, total }: { base: string; total: number }) {
  const pathname = usePathname();
  const tabs = [
    {
      href: `${base}/submissions`,
      label: t.tabs.submissions,
      count: total,
      active: pathname.startsWith(`${base}/submissions`) || pathname.startsWith(`${base}/case/`),
    },
    { href: base, label: t.tabs.overview, count: null, active: pathname === base },
    { href: `${base}/settings`, label: t.tabs.settings, count: null, active: pathname === `${base}/settings` },
  ];
  return (
    <nav aria-label={t.tabs.nav} className="-mb-px flex gap-6">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={`border-b-2 pb-2.5 ${tab.active ? "border-ink font-bold" : "border-transparent text-muted hover:text-ink"}`}
        >
          {tab.label}
          {tab.count !== null && <span className="ml-1.5 text-[13px] font-normal text-muted tabular-nums">{tab.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
