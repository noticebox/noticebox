import { KINDS, runtime } from "@/backend";
import { ActionForm } from "../../ActionForm";
import { BoxPicker } from "../../BoxPicker";
import { createForm } from "../../admin";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));

// A new form: its name (the endpoint), its box, its kind and its title. The fields its kind usually has are filled
// in and changed on the settings page afterwards.
export default async function NewFormPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const rt = runtime();
  const preset = one((await searchParams).box);
  const boxes = rt.config.boxes;
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 text-[28px] leading-tight font-bold tracking-tight">New form</h1>
      <p className="mb-6 text-muted">A form is what a page posts to. Its name is the endpoint, /f/&lt;name&gt;. The fields come with the first submission, or a page describes them itself; the kind chooses the first states, which the settings page can change.</p>
      <ActionForm action={createForm} button="Create the form" className="grid gap-5">
        <div>
          <label htmlFor="form-name" className="mb-1 block font-bold">
            Name
          </label>
          <input id="form-name" name="name" required maxLength={40} pattern="[a-z0-9][a-z0-9_-]*" autoFocus className="field" placeholder="contact" />
          <p className="mt-1 text-[13px] text-muted">Lowercase letters, digits, dashes and underscores. It cannot be changed later.</p>
        </div>
        <div>
          <label htmlFor="form-title" className="mb-1 block font-bold">
            Title
          </label>
          <input id="form-title" name="title" maxLength={120} className="field" placeholder="Contact" />
        </div>
        <BoxPicker boxes={boxes} defaultValue={preset && boxes.includes(preset) ? preset : (boxes[0] ?? "")} />
        <fieldset>
          <legend className="mb-1 block font-bold">Kind</legend>
          {(Object.keys(KINDS) as (keyof typeof KINDS)[]).map((k, i) => (
            <label key={k} className="mb-1 flex items-start gap-2">
              <input type="radio" name="kind" value={k} defaultChecked={i === 0} className="mt-1" />
              <span>
                <span className="font-bold">{k === "report" ? "Report" : "Message"}</span>{" "}
                <span className="text-muted">{k === "report" ? "about content: open, in review, then acted on or rejected with a reason" : "a contact message: new until answered"}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </ActionForm>
    </div>
  );
}
