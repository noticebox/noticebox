import { Submission } from "../../submissions/Submission";

export const dynamic = "force-dynamic";

// The same submission on a page of its own, for reading a long one or keeping a link to it without the table.
export default async function CasePage({ params }: { params: Promise<{ form: string; id: string }> }) {
  const { form, id } = await params;
  return <Submission name={form} id={id} as="page" />;
}
