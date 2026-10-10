import { headers } from "next/headers";
import { actorOf, publicUrl, runtime } from "@/backend";
import { when } from "@/app/_lib/format";
import { ActionForm } from "../ActionForm";
import { revokeGrant } from "../admin";

export const dynamic = "force-dynamic";

// The signed-in person's page: who they are to noticebox, and the assistants they allowed through MCP.
export default async function SettingsPage() {
  const rt = runtime();
  const h = await headers();
  const actor = actorOf(h, rt) ?? "";
  const grants = rt.store.grants(actor);
  const base = publicUrl(h, rt);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-[28px] leading-tight font-bold tracking-tight">Your settings</h1>

      <section className="mb-10">
        <h2 className="section-title">You</h2>
        <p>
          Signed in as <strong>{actor}</strong>. The name comes from the login in front of noticebox; every step you take is recorded under it.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="section-title">Connected assistants</h2>
        {rt.secret === null ? (
          <p className="text-muted">MCP is off on this instance: no NOTICEBOX_SECRET is set.</p>
        ) : (
          <>
            {grants.length === 0 ? (
              <p className="text-muted">No assistant is connected. What you allow appears here and can be revoked.</p>
            ) : (
              <ul className="grid gap-4">
                {grants.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-bold">{g.client_name}</span>
                    <span className="text-[13px] text-muted">
                      allowed {when(g.created_at)}, last used {when(g.last_used_at)}
                    </span>
                    <ActionForm action={revokeGrant} button="Revoke" danger className="ml-auto [&>button]:mt-0">
                      <input type="hidden" name="id" value={g.id} />
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-[13px] text-muted">
              To connect Claude Code: <code>claude mcp add --transport http noticebox {base}/mcp</code>. What an assistant does is recorded as <em>{actor} via its name</em>.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
