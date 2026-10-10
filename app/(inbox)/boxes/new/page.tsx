import { ActionForm } from "../../ActionForm";
import { createBox } from "../../admin";

export const dynamic = "force-dynamic";

export default function NewBoxPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 text-[28px] leading-tight font-bold tracking-tight">New box</h1>
      <p className="mb-6 text-muted">A box groups forms: a site, a project. The sidebar lists forms under their box.</p>
      <ActionForm action={createBox} button="Create the box">
        <label htmlFor="box-name" className="mb-1 block font-bold">
          Name
        </label>
        <input id="box-name" name="name" required maxLength={40} autoFocus className="field" placeholder="example.org" />
        <p className="mt-1 text-[13px] text-muted">Letters, digits, spaces, dots, dashes and underscores.</p>
      </ActionForm>
    </div>
  );
}
