import Link from "next/link";
import { notFound } from "next/navigation";
import { formPath, KINDS, runtime } from "@/backend";
import { ActionForm } from "../../ActionForm";
import { deleteBox, renameBox } from "../../admin";
import { t } from "@/app/_lib/copy";

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
        <h2 className="section-title">{t.box.forms}</h2>
        {forms.length === 0 ? (
          <p className="text-muted">{t.box.none}</p>
        ) : (
          <ul className="grid gap-2">
            {forms.map((f) => (
              <li key={f.name} className="flex flex-wrap items-baseline gap-x-3">
                <Link href={formPath(f.name)} className="font-bold hover:underline">
                  {f.title}
                </Link>
                <span className="text-[13px] text-muted">{t.box.kindAndEndpoint(KINDS[f.kind].label, f.name)}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href={`/forms/new?box=${encodeURIComponent(box)}`} className="btn mt-4">
          {t.box.newFormHere}
        </Link>
      </section>

      <section className="mb-10 max-w-xl">
        <h2 className="section-title">{t.common.name}</h2>
        <ActionForm action={renameBox} button={t.box.rename}>
          <input type="hidden" name="from" value={box} />
          <label htmlFor="box-to" className="mb-1 block font-bold">
            {t.common.name}
          </label>
          <input id="box-to" name="to" required maxLength={40} defaultValue={box} className="field" />
          <p className="mt-1 text-[13px] text-muted">{t.box.renameHint}</p>
        </ActionForm>
      </section>

      <section className="max-w-xl">
        <h2 className="section-title">{t.common.remove}</h2>
        <p className="text-muted">{t.box.removeText}</p>
        <ActionForm action={deleteBox} button={t.box.remove} danger>
          <input type="hidden" name="name" value={box} />
        </ActionForm>
      </section>
    </div>
  );
}
