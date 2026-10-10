import { notFound } from "next/navigation";
import { formPath, KINDS, runtime } from "@/backend";
import { Tabs } from "./Tabs";

export const dynamic = "force-dynamic";

export default async function FormLayout({ params, children }: { params: Promise<{ form: string }>; children: React.ReactNode }) {
  const { form: name } = await params;
  const form = runtime().config.forms[name];
  if (!form) notFound();
  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-xs font-semibold tracking-wider text-muted uppercase">{form.box}</p>
      <h1 className="mt-1 mb-4 text-2xl font-bold tracking-tight">
        {form.title} <span className="ml-1 text-base font-normal text-muted">{KINDS[form.kind].label}s</span>
      </h1>
      <div className="mb-6 border-b border-rule">
        <Tabs base={formPath(form.name)} />
      </div>
      {children}
    </div>
  );
}
