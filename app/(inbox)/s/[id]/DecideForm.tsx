"use client";

import { useActionState, useSyncExternalStore } from "react";
import { decide, type DecideState } from "./actions";

const noop = () => () => {};

// Plain HTML until the page is hydrated (`data-hydrated` says when React has taken over), a server action after.
// React resets a form's fields after each action, so a refused decision ("acted_on needs a reason") redraws the
// fields, keyed by the attempt, with what was submitted.
export function DecideForm({ id, state, next, reasonRequired }: { id: string; state: string; next: string[]; reasonRequired: string[] }) {
  const [result, action, pending] = useActionState<DecideState, FormData>(decide, {});
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const needs = next.filter((t) => reasonRequired.includes(t));
  const attempt = result.n ?? 0;
  return (
    <form action={action} className="max-w-xl" data-hydrated={hydrated || undefined}>
      <input type="hidden" name="id" value={id} />
      <label htmlFor="to" className="mb-1 block text-sm font-semibold">
        Move to
      </label>
      <select key={`to-${attempt}`} id="to" name="to" className="field" defaultValue={result.to ?? ""}>
        <option value="">stay in {state}, only add a note</option>
        {next.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <label htmlFor="reason" className="mt-4 mb-1 block text-sm font-semibold">
        Reason
      </label>
      <textarea key={`reason-${attempt}`} id="reason" name="reason" rows={5} className="field" defaultValue={result.reason ?? ""} />
      {needs.length > 0 && <p className="mt-1 text-sm text-muted">A reason is required for {needs.join(" and ")}. It is kept as the record of the decision.</p>}
      {result.error && (
        <p role="alert" className="mt-2 text-sm text-error">
          {result.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="mt-4 rounded-sm bg-accent px-4 py-1.5 font-bold text-on-accent disabled:opacity-60">
        Record
      </button>
    </form>
  );
}
