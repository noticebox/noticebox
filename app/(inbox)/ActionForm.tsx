"use client";

import { useActionState, useRef } from "react";
import { t } from "@/app/_lib/copy";
import type { AdminState } from "./admin";

// A small form around one admin action: the fields are the children, the error is shown, the button waits. React
// empties a form's fields after an action, so after a refused one what was typed is put back.
export function ActionForm({
  action,
  button,
  danger = false,
  className,
  children,
}: {
  action: (prev: AdminState, data: FormData) => Promise<AdminState>;
  button: string;
  danger?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [state, act, pending] = useActionState<AdminState, FormData>(async (prev, data) => {
    const typed = [...data.entries()].filter((e): e is [string, string] => typeof e[1] === "string");
    const r = await action(prev, data);
    if (r.error) requestAnimationFrame(() => restore(form.current, typed));
    return r;
  }, {});
  return (
    <form ref={form} action={act} className={className}>
      {children}
      {state.error && (
        <p role="alert" className="mt-2 text-error">
          {state.error}
        </p>
      )}
      {state.secret && (
        <p role="status" className="mt-2">
          {t.you.tokenOnce} <code className="break-all select-all">{state.secret}</code>
        </p>
      )}
      <button type="submit" disabled={pending} className={danger ? "btn mt-3 justify-self-start text-error" : "btn-primary mt-3 justify-self-start"}>
        {button}
      </button>
    </form>
  );
}

function restore(form: HTMLFormElement | null, typed: [string, string][]): void {
  if (!form) return;
  for (const [name, value] of typed) {
    const el = form.elements.namedItem(name);
    if (el instanceof RadioNodeList) {
      for (const r of el) if (r instanceof HTMLInputElement && r.value === value) r.checked = true;
    } else if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      el.checked = true;
    } else if ((el instanceof HTMLInputElement && el.type !== "hidden") || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      el.value = value;
    }
  }
}
