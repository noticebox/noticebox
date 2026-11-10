import { ActionForm } from "../../ActionForm";
import { createBox } from "../../admin";
import { t } from "@/app/_lib/copy";

export const dynamic = "force-dynamic";

export default function NewBoxPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 text-[28px] leading-tight font-bold tracking-tight">{t.newBox.title}</h1>
      <p className="mb-6 text-muted">{t.newBox.intro}</p>
      <ActionForm action={createBox} button={t.newBox.create}>
        <label htmlFor="box-name" className="mb-1 block font-bold">
          {t.common.name}
        </label>
        <input id="box-name" name="name" required maxLength={40} autoFocus className="field" placeholder="example.org" />
        <p className="mt-1 text-[13px] text-muted">{t.newBox.nameHint}</p>
      </ActionForm>
    </div>
  );
}
