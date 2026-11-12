import { headers } from "next/headers";
import { connections, listApiTokens, personOf, publicUrl, runtime } from "@/backend";
import { when } from "@/app/_lib/format";
import { ActionForm } from "../ActionForm";
import { createToken, revokeGrant, revokeToken } from "../admin";
import { t } from "@/app/_lib/copy";

export const dynamic = "force-dynamic";

// The signed-in person's page: who they are to noticebox, the assistants they allowed through MCP, and their API tokens.
export default async function SettingsPage() {
  const rt = runtime();
  const h = await headers();
  const person = await personOf(h, rt);
  const actor = person?.email ?? "";
  const grants = person ? await connections(rt, person.id) : [];
  const tokens = person ? await listApiTokens(rt, person.id) : [];
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
        {grants.length === 0 ? (
          <p className="text-muted">{t.you.none}</p>
        ) : (
          <ul className="grid gap-4">
            {grants.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-bold">{g.client_name}</span>
                <span className="text-[13px] text-muted">{t.you.allowed(when(g.created_at))}</span>
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
      </section>

      <section className="mb-10">
        <h2 className="section-title">{t.you.tokens}</h2>
        <p className="mb-4 text-muted">
          {t.you.tokensText[0]}
          <code>{base}/api/v1</code>
          {t.you.tokensText[1]}
        </p>
        {tokens.length === 0 ? (
          <p className="text-muted">{t.you.noTokens}</p>
        ) : (
          <ul className="grid gap-4">
            {tokens.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-bold">{k.name}</span>
                <code className="text-[13px] text-muted">{k.start}…</code>
                <span className="text-[13px] text-muted">
                  {t.you.tokenLine(k.scope, when(k.created_at), k.expires_at && when(k.expires_at), k.last_used_at && when(k.last_used_at))}
                </span>
                <ActionForm action={revokeToken} button={t.you.revoke} danger className="ml-auto [&>button]:mt-0">
                  <input type="hidden" name="id" value={k.id} />
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={createToken} button={t.you.makeToken} className="mt-6 grid max-w-md gap-3">
          <label className="grid gap-1">
            <span className="text-sm font-bold">{t.you.tokenName}</span>
            <input className="field" name="name" required maxLength={60} />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-bold">{t.you.tokenScope}</span>
            <select className="field" name="scope" defaultValue="read">
              <option value="read">{t.you.scopeRead}</option>
              <option value="read+write">{t.you.scopeWrite}</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-bold">{t.you.tokenDays}</span>
            <select className="field" name="days" defaultValue="90">
              {[30, 90, 365].map((d) => (
                <option key={d} value={d}>
                  {t.you.days(d)}
                </option>
              ))}
              <option value="none">{t.you.noExpiry}</option>
            </select>
          </label>
        </ActionForm>
      </section>
    </div>
  );
}
