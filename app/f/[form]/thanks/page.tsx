import { notFound } from "next/navigation";
import { runtime } from "@/backend";

export const dynamic = "force-dynamic";

// Where a plain form post lands when the form names no `redirect` of its own.
export default async function ThanksPage({ params }: { params: Promise<{ form: string }> }) {
  const { form: name } = await params;
  const form = runtime().config.forms[name];
  if (!form) notFound();
  return (
    <main className="mx-auto mt-[18vh] max-w-md px-4">
      <div className="card p-6">
        <h1 className="mb-2 text-xl font-bold tracking-tight">{form.title}</h1>
        <p>{form.thanks}</p>
      </div>
    </main>
  );
}
