import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { actorOf, checkAuthorize, runtime } from "@/backend";

export const dynamic = "force-dynamic";

// The OAuth step of an MCP client: the login proxy has already identified the person (proxy.ts lets nobody else
// here); the "Allow" posts to /api/oauth/authorize, which sends the client its code.
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const rt = runtime();
  const h = await headers();
  const actor = actorOf(h, rt);
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const one of [v ?? []].flat()) params.append(k, one);
  const checked = checkAuthorize(params, h, rt);
  if (checked.kind === "redirect") redirect(checked.location);
  return (
    <main className="mx-auto mt-[18vh] max-w-md px-4">
      <div className="card p-6">
      <h1 className="mb-2 text-xl font-bold tracking-tight">noticebox</h1>
      {checked.kind === "error" ? (
        <p role="alert" className="text-error">
          {checked.message}
        </p>
      ) : (
        <form method="post" action="/api/oauth/authorize">
          {Object.entries(checked.fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <p className="mb-1">
            <strong>{checked.clientName}</strong> wants to read and decide submissions as <strong>{actor}</strong>.
          </p>
          <p className="mb-6 text-sm text-muted">Everything it does is recorded in your name, marked as done through it. Afterwards you are sent to {checked.redirectHost}.</p>
          <button type="submit" className="btn-primary">
            Allow
          </button>
        </form>
      )}
      </div>
    </main>
  );
}
