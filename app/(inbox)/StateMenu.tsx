"use client";

import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { stateLabel, verbFor } from "@/app/_lib/format";
import { decide, type DecideState } from "./actions";
import { Icon } from "@/app/_lib/icons";
import { t } from "@/app/_lib/copy";

const noop = () => () => {};

export type StateMenuProps = {
  id: string;
  state: string;
  tone: string; // the badge class for the current state
  states: { name: string; closed: boolean; reason: boolean }[]; // the form's states, the first being where submissions start
  size?: "sm" | "lg";
  withNote?: boolean; // also a plain "Add a note" button beside the badge
};

// The state of a submission as a dropdown: the badge opens the list of what can be done with it, and choosing an
// action opens the dialog where the reason is written and the action confirmed under the same name. A note is the
// same dialog with the state kept. Plain until hydrated (`data-hydrated` says when React has taken over).
export function StateMenu({ id, state, tone, states, size = "sm", withNote = false }: StateMenuProps) {
  const initial = states[0]?.name ?? state;
  const next = states.map((s) => s.name).filter((n) => n !== state);
  const reasonRequired = states.filter((s) => s.reason).map((s) => s.name);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null); // the dialog is open while this is a string
  const [pick, setPick] = useState(""); // what the dialog's "Then" says now; the title, the button and the reason's need follow it
  const dialog = useRef<HTMLDialogElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [result, action, pending] = useActionState<DecideState, FormData>(async (prev, data) => {
    const r = await decide(prev, data);
    if (r.ok) setTarget(null); // done: the dialog closes, the page has been refreshed by the action
    return r;
  }, {});
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const attempt = result.n ?? 0;

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  useEffect(() => {
    if (target === null) dialog.current?.close();
    else if (!dialog.current?.open) dialog.current?.showModal();
  }, [target]);

  const choose = (to: string) => {
    setOpen(false);
    setPick(to);
    setTarget(to);
  };
  const chosen = pick;
  const title = chosen ? verbFor(chosen, initial) : t.stateMenu.addNote;
  const needs = reasonRequired.includes(chosen);
  const big = size === "lg";

  return (
    <div ref={root} className="relative inline-flex items-center gap-2" data-hydrated={hydrated || undefined}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.stateMenu.state(stateLabel(state))}
        onClick={() => setOpen((o) => !o)}
        className={`badge ${tone} ${big ? "px-3 py-1 text-[14px]" : ""} cursor-pointer hover:brightness-95`}
      >
        {stateLabel(state)}
        <Icon name="dropdown" className="size-3 shrink-0 opacity-70" />
      </button>
      {withNote && (
        <button type="button" onClick={() => choose("")} className="btn">
          {t.stateMenu.addNote}
        </button>
      )}
      {open && (
        <ul role="menu" className="sheet absolute top-full left-0 z-30 mt-1 min-w-52 p-1 text-[15px] shadow-lg">
          {next.map((t) => (
            <li key={t} role="none">
              <button type="button" role="menuitem" onClick={() => choose(t)} className="block w-full rounded-md px-2.5 py-1.5 text-left hover:bg-hover">
                {verbFor(t, initial)}
              </button>
            </li>
          ))}
          <li role="none" className="my-1 border-t border-rule" />
          <li role="none">
            <button type="button" role="menuitem" onClick={() => choose("")} className="block w-full rounded-md px-2.5 py-1.5 text-left hover:bg-hover">
              {t.stateMenu.addNote}
            </button>
          </li>
        </ul>
      )}
      <dialog
        ref={dialog}
        onClose={() => setTarget(null)}
        aria-labelledby={`dlg-${id}`}
        className="sheet m-auto w-[min(92vw,30rem)] rounded-xl p-0 text-ink shadow-xl"
      >
        {target !== null && (
          <form action={action} className="p-5">
            <h2 id={`dlg-${id}`} className="mb-1 text-[18px] leading-tight font-bold tracking-tight">
              {title}
            </h2>
            <p className="mb-4 text-[14px] text-muted">{needs ? t.stateMenu.whyReason : t.stateMenu.whyNote}</p>
            <input type="hidden" name="id" value={id} />
            <label htmlFor={`reason-${id}`} className="mb-1 block text-sm font-bold">
              {chosen ? t.stateMenu.reason : t.stateMenu.note}
            </label>
            <textarea
              key={`reason-${attempt}`}
              id={`reason-${id}`}
              name="reason"
              rows={4}
              autoFocus
              required={needs || !chosen}
              className="field"
              defaultValue={result.ok ? "" : (result.reason ?? "")}
            />
            <label htmlFor={`to-${id}`} className="mt-4 mb-1 block text-sm font-bold">
              {t.stateMenu.then}
            </label>
            <select key={`to-${attempt}`} id={`to-${id}`} name="to" className="field" defaultValue={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">{t.stateMenu.keep(stateLabel(state))}</option>
              {next.map((t) => (
                <option key={t} value={t}>
                  {verbFor(t, initial).toLowerCase()}
                </option>
              ))}
            </select>
            {result.error && !result.ok && (
              <p role="alert" className="mt-3 text-error">
                {result.error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setTarget(null)} className="btn">
                {t.common.cancel}
              </button>
              <button type="submit" disabled={pending} className="btn-primary">
                {title}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
