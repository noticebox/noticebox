import { notFound } from "next/navigation";
import { boxPath, formPath, runtime } from "@/backend";
import Link from "next/link";
import { Tabs } from "./Tabs";
import { t } from "@/app/_lib/copy";

export const dynamic = "force-dynamic";

// The head of every page of a form: its box, kind and endpoint above the title, then the tabs.
export default async function FormLayout({ params, children }: { params: Promise<{ form: string }>; children: React.ReactNode }) {
  const { form: name } = await params;
  const rt = runtime();
  const form = rt.config.forms[name];
  if (!form) notFound();
  const total = rt.store
    .counts()
    .filter((c) => c.form === form.name)
    .reduce((a, c) => a + c.n, 0);
  return (
    <div className="mx-auto max-w-5xl">
      <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
        <Link href={boxPath(form.box)} className="hover:text-ink hover:underline">
          {form.box}
        </Link>
        <span className="tag">{t.newForm.kinds[form.kind].name.toLowerCase()}</span>
        <span className="tag">/f/{form.name}</span>
      </p>
      <h1 className="mt-1 text-[26px] leading-tight font-bold tracking-tight">{form.title}</h1>
      {form.intro && <p className="mt-1 max-w-prose text-muted">{form.intro}</p>}
      <div className="mt-5 mb-6 border-b border-rule">
        <Tabs base={formPath(form.name)} total={total} />
      </div>
      {children}
    </div>
  );
}
