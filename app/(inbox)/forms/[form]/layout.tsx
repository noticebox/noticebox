import { notFound } from "next/navigation";
import { formPath, runtime } from "@/backend";
import { Tabs } from "./Tabs";

export const dynamic = "force-dynamic";

export default async function FormLayout({ params, children }: { params: Promise<{ form: string }>; children: React.ReactNode }) {
  const { form: name } = await params;
  const form = runtime().config.forms[name];
  if (!form) notFound();
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-3 text-[28px] leading-tight font-bold tracking-tight">{form.title}</h1>
      <div className="mb-8 border-b border-rule">
        <Tabs base={formPath(form.name)} />
      </div>
      {children}
    </div>
  );
}
