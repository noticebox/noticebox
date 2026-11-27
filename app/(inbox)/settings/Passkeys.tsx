"use client";

// The passkeys section of Your settings: the ones the person has, adding one (the browser asks the device or password
// manager) and removing one. Both go straight to Better Auth's passkey endpoints with the session cookie; the page is
// then read again, so the list is the server's.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/app/_lib/auth-client";
import { t } from "@/app/_lib/copy";

export function Passkeys({ list }: { list: { id: string; name: string; added: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await authClient.passkey.addPasskey({ name: name.trim() || undefined });
    setBusy(false);
    if (r?.error) return setError(t.you.addPasskeyFailed);
    setName("");
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    await authClient.passkey.deletePasskey({ id });
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      {list.length === 0 ? (
        <p className="text-muted">{t.you.noPasskeys}</p>
      ) : (
        <ul className="grid gap-4">
          {list.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-bold">{p.name}</span>
              <span className="text-[13px] text-muted">{t.you.passkeyAdded(p.added)}</span>
              <button type="button" className="btn ml-auto text-error" disabled={busy} onClick={() => remove(p.id)} aria-label={t.you.removePasskey(p.name)}>
                {t.you.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="mt-6 grid max-w-md gap-3">
        <label className="grid gap-1">
          <span className="text-sm font-bold">{t.you.passkeyName}</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.you.passkeyNameHint} maxLength={60} />
        </label>
        {error && (
          <p role="alert" className="text-error">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary justify-self-start" disabled={busy}>
          {t.you.addPasskey}
        </button>
      </form>
    </>
  );
}
