"use client";

import { useSyncExternalStore } from "react";
import { Icon, type IconName } from "@/app/_lib/icons";
import { t } from "@/app/_lib/copy";

// Light, dark, or whatever the system says: a choice of this browser, kept in localStorage (it is nobody else's
// business and needs no account). app/layout.tsx applies it before the first paint; this sets it and tells the page.
const KEY = "noticebox-theme";
type Theme = "light" | "dark" | "system";

const listeners = new Set<() => void>();
const read = (): Theme => {
  const v = document.documentElement.dataset.theme;
  return v === "light" || v === "dark" ? v : "system";
};
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

function choose(theme: Theme): void {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Storage may be off (a private window); the choice then lasts until the page is left.
  }
  listeners.forEach((f) => f());
}

export function ThemeSwitch() {
  const current = useSyncExternalStore(subscribe, read, () => "system" as Theme);
  const options: [Theme, IconName, string][] = [
    ["light", "light", t.theme.light],
    ["dark", "dark", t.theme.dark],
    ["system", "system", t.theme.system],
  ];
  return (
    <div role="group" aria-label={t.theme.label} className="flex rounded-lg border border-rule bg-card p-0.5">
      {options.map(([value, icon, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={current === value}
          aria-label={label}
          title={label}
          onClick={() => choose(value)}
          className={`grid size-7 place-items-center rounded-md ${current === value ? "bg-soft text-ink" : "text-muted hover:text-ink"}`}
        >
          <Icon name={icon} className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
