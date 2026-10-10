import { notFound, redirect } from "next/navigation";
import { runtime, submissionPath } from "@/backend";

export const dynamic = "force-dynamic";

// The short link to a submission, for links that only know the id.
export default async function ShortLink({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = runtime().store.get(id);
  if (!s) notFound();
  redirect(submissionPath(s.form, s.id));
}
