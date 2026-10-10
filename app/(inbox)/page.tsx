import Link from "next/link";
import { redirect } from "next/navigation";
import { formPath, runtime } from "@/backend";

export const dynamic = "force-dynamic";

// The front door opens the first form; the sidebar has the rest. Without any, it says where to start.
export default function InboxPage() {
  const first = Object.keys(runtime().config.forms)[0];
  if (first) redirect(formPath(first));
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="text-[22px] font-bold">Nothing here yet</h1>
      <p className="mt-2 text-muted">A form is what a page posts to. Make one, and its endpoint is ready.</p>
      <Link href="/forms/new" className="btn-primary mt-6">
        New form
      </Link>
    </div>
  );
}
