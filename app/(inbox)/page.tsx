import { redirect } from "next/navigation";
import { formPath, runtime } from "@/backend";

export const dynamic = "force-dynamic";

// The front door opens the first form; the sidebar has the rest.
export default function InboxPage() {
  const first = Object.keys(runtime().config.forms)[0]!;
  redirect(formPath(first));
}
