import { Submission } from "../Submission";

export const dynamic = "force-dynamic";

// The open submission, as the pane beside the table (the layout above draws the table).
export default async function SubmissionPane({ params }: { params: Promise<{ form: string; id: string }> }) {
  const { form, id } = await params;
  return <Submission name={form} id={id} as="pane" />;
}
