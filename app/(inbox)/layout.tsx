import { headers } from "next/headers";
import Link from "next/link";
import { actorOf, runtime } from "@/backend";

export const dynamic = "force-dynamic";

// The inbox: everything under here is behind the login proxy (proxy.ts), and the header says who is signed in.
export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  const rt = runtime();
  const actor = actorOf(await headers(), rt);
  const forms = Object.values(rt.config.forms);
  return (
    <>
      <header className="mb-6 flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-rule pb-3">
        <h1 className="text-lg font-bold tracking-tight">
          <Link href="/">noticebox</Link>
        </h1>
        <nav className="flex flex-wrap gap-x-4 text-sm">
          <Link href="/">open</Link>
          <Link href="/?open=0">closed</Link>
          {forms.map((f) => (
            <Link key={f.name} href={`/?form=${encodeURIComponent(f.name)}`}>
              {f.title}
            </Link>
          ))}
          <a href="/export.json">export</a>
        </nav>
        <span className="ml-auto text-sm text-muted">{actor}</span>
      </header>
      <main>{children}</main>
    </>
  );
}
