import Link from "next/link";
import { notFound } from "next/navigation";
import { formPath, KINDS, runtime } from "@/backend";
import { ActionForm } from "../../ActionForm";
import { deleteBox, renameBox } from "../../admin";

export const dynamic = "force-dynamic";

// A box's page: its forms, its name, and the way out once it is empty.
export default async function BoxPage({ params }: { params: Promise<{ box: string }> }) {
  const { box: rawBox } = await params;
  const box = decodeURIComponent(rawBox);
  const rt = runtime();
  if (!rt.config.boxes.includes(box)) notFound();
  const forms = Object.values(rt.config.forms).filter((f) => f.box === box);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-[28px] leading-tight font-bold tracking-tight">{box}</h1>

      <section className="mb-10">
        <h2 className="section-title">Forms</h2>
        {forms.length === 0 ? (
          <p className="text-muted">No forms in this box yet.</p>
        ) : (
          <ul className="grid gap-2">
            {forms.map((f) => (
              <li key={f.name} className="flex flex-wrap items-baseline gap-x-3">
                <Link href={formPath(f.name)} className="font-bold hover:underline">
                  {f.title}
                </Link>
                <span className="text-[13px] text-muted">
                  {KINDS[f.kind].label}s · /f/{f.name}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href={`/forms/new?box=${encodeURIComponent(box)}`} className="btn mt-4">
          New form in this box
        </Link>
      </section>

      <section className="mb-10 max-w-xl">
        <h2 className="section-title">Name</h2>
        <ActionForm action={renameBox} button="Rename the box">
          <input type="hidden" name="from" value={box} />
          <label htmlFor="box-to" className="mb-1 block font-bold">
            Name
          </label>
          <input id="box-to" name="to" required maxLength={40} defaultValue={box} className="field" />
          <p className="mt-1 text-[13px] text-muted">The forms in it follow the new name.</p>
        </ActionForm>
      </section>

      <section className="max-w-xl">
        <h2 className="section-title">Remove</h2>
        <p className="text-muted">A box can be removed once it has no forms.</p>
        <ActionForm action={deleteBox} button="Remove the box" danger>
          <input type="hidden" name="name" value={box} />
        </ActionForm>
      </section>
    </div>
  );
}
