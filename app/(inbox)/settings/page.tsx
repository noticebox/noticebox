import { headers } from "next/headers";
import { actorOf, publicUrl, runtime } from "@/backend";
import { when } from "@/app/_lib/format";
import { ActionForm } from "../ActionForm";
import { revokeGrant } from "../admin";
import { t } from "@/app/_lib/copy";

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
      <h1 className="mb-6 text-[28px] leading-tight font-bold tracking-tight">{t.you.title}</h1>

      <section className="mb-10">
        <h2 className="section-title">{t.you.you}</h2>
        <p>
          {t.you.signedInAs[0]}
          <strong>{actor}</strong>
          {t.you.signedInAs[1]}
        </p>
      </section>

      <section className="mb-10">
        <h2 className="section-title">{t.you.assistants}</h2>
        {rt.secret === null ? (
          <p className="text-muted">{t.you.mcpOff}</p>
        ) : (
          <>
            {grants.length === 0 ? (
              <p className="text-muted">{t.you.none}</p>
            ) : (
              <ul className="grid gap-4">
                {grants.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-bold">{g.client_name}</span>
                    <span className="text-[13px] text-muted">
                      {t.you.allowed(when(g.created_at), when(g.last_used_at))}
                    </span>
                    <ActionForm action={revokeGrant} button={t.you.revoke} danger className="ml-auto [&>button]:mt-0">
                      <input type="hidden" name="id" value={g.id} />
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-[13px] text-muted">
              {t.you.connect} <code>claude mcp add --transport http noticebox {base}/mcp</code>
              {t.you.recordedAs[0]}
              <em>
                {actor}
                {t.you.recordedAs[1]}
              </em>
              {t.you.recordedAs[2]}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
