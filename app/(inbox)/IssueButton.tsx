"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createIssue, type IssueState } from "./actions";

// "Open GitHub issue": a dialog with the draft (only the fields that are not personal), which the person may change
// before it leaves for GitHub.
export function IssueButton({ id, repo, title, body }: { id: string; repo: string; title: string; body: string }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [result, action, pending] = useActionState<IssueState, FormData>(async (prev, data) => {
    const r = await createIssue(prev, data);
    if (r.ok) setOpen(false);
    return r;
  }, {});
  const attempt = result.n ?? 0;
  const failed = result.error && !result.ok;

  useEffect(() => {
    if (!open) dialog.current?.close();
    else if (!dialog.current?.open) dialog.current?.showModal();
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn">
        Open GitHub issue
      </button>
      <dialog ref={dialog} onClose={() => setOpen(false)} aria-labelledby={`issue-${id}`} className="sheet m-auto w-[min(92vw,36rem)] p-0 text-ink shadow-xl">
        {open && (
          <form action={action} className="p-6">
            <h2 id={`issue-${id}`} className="mb-1 text-[22px] leading-tight font-bold tracking-tight">
              Open an issue in {repo}
            </h2>
            <p className="mb-5 text-muted">The draft holds only the fields that are not personal. The issue may be public: leave out anything that names the person who wrote in.</p>
            <input type="hidden" name="id" value={id} />
            <label htmlFor={`issue-title-${id}`} className="mb-1 block font-bold">
              Title
            </label>
            <input key={`t-${attempt}`} id={`issue-title-${id}`} name="title" required maxLength={256} className="field" defaultValue={failed ? result.title : title} />
            <label htmlFor={`issue-body-${id}`} className="mt-4 mb-1 block font-bold">
              Body
            </label>
            <textarea key={`b-${attempt}`} id={`issue-body-${id}`} name="body" rows={10} className="field font-mono text-sm" defaultValue={failed ? result.body : body} />
            {failed && (
              <p role="alert" className="mt-3 text-error">
                {result.error}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="btn">
                Cancel
              </button>
              <button type="submit" disabled={pending} className="btn-primary">
                Open the issue
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
