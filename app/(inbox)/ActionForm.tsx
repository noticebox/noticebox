"use client";

import { useActionState } from "react";
import type { AdminState } from "./admin";

// A small form around one admin action: the fields are the children, the error is shown, the button waits.
export function ActionForm({ action, button, danger = false, className, children }: { action: (prev: AdminState, data: FormData) => Promise<AdminState>; button: string; danger?: boolean; className?: string; children?: React.ReactNode }) {
  const [state, act, pending] = useActionState<AdminState, FormData>(action, {});
  return (
    <form action={act} className={className}>
      {children}
      {state.error && (
        <p role="alert" className="mt-2 text-error">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={danger ? "btn mt-3 text-error" : "btn-primary mt-3"}>
        {button}
      </button>
    </form>
  );
}
