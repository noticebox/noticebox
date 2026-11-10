import Link from "next/link";
import { redirect } from "next/navigation";
import { formPath, runtime } from "@/backend";
import { t } from "@/app/_lib/copy";

export const dynamic = "force-dynamic";

// The front door opens the first form; the sidebar has the rest. Without any, it says where to start.
export default function InboxPage() {
  const first = Object.keys(runtime().config.forms)[0];
  if (first) redirect(formPath(first));
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="text-[22px] font-bold">{t.home.title}</h1>
      <p className="mt-2 text-muted">{t.home.text}</p>
      <Link href="/forms/new" className="btn-primary mt-6">
        {t.shell.newForm}
      </Link>
    </div>
  );
}
