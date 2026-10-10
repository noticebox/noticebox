"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The tabs of a form: Overview is the form's own page, Submissions everything under /submissions.
export function Tabs({ base }: { base: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: base, label: "Overview", active: pathname === base },
    { href: `${base}/submissions`, label: "Submissions", active: pathname.startsWith(`${base}/submissions`) },
  ];
  return (
    <nav className="-mb-px flex gap-6 text-sm">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.active ? "page" : undefined} className={`border-b-2 pb-2 ${t.active ? "border-accent font-semibold" : "border-transparent text-muted hover:text-ink"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
