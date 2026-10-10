import { notFound } from "next/navigation";
import { runtime } from "@/backend";

export const dynamic = "force-dynamic";

export default async function ThanksPage({ params }: { params: Promise<{ form: string }> }) {
  const { form: name } = await params;
  const form = runtime().config.forms[name];
  if (!form) notFound();
  return (
    <main className="mx-auto max-w-xl">
      <h1 className="mb-2 text-xl font-bold tracking-tight">{form.title}</h1>
      <p>{form.thanks}</p>
    </main>
  );
}
