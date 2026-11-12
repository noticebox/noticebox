"use client";

import { useState } from "react";
import { authClient } from "@/app/_lib/auth-client";
import { t } from "@/app/_lib/copy";

type Methods = { email: boolean; providers: { id: string; label: string; builtIn: boolean }[] };

// Email first: a code, which the mail may also carry as a link. Then one button per provider. A refused provider
// sign-in comes back here as ?error=, and the page says so.
export function SignIn({ methods, next, refused }: { methods: Methods; next: string; refused: { provider: string | null; code: string } | null }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(refused ? t.signIn.refused(refused.provider, refused.code) : null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
    setBusy(false);
    if (r.error) setError(t.signIn.failed);
    else setSent(true);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await authClient.signIn.emailOtp({ email, otp: code.trim() });
    if (r.error) {
      setBusy(false);
      setError(t.signIn.failed);
      return;
    }
    // During an MCP sign-in Better Auth answers with where the authorization goes on; otherwise the page asked for.
    const url = (r.data as { url?: string } | null)?.url;
    window.location.assign(url ?? next);
  }

  async function provider(p: Methods["providers"][number]) {
    setBusy(true);
    const errorCallbackURL = `/login?${new URLSearchParams({ next, provider: p.id })}`;
    // An OIDC provider is a social provider to Better Auth as much as GitHub is.
    const r = await authClient.signIn.social({ provider: p.id, callbackURL: next, errorCallbackURL });
    if (r.error) {
      setBusy(false);
      setError(t.signIn.failed);
    }
  }

  return (
    <div className="grid gap-4">
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
      {methods.email &&
        (sent ? (
          <form onSubmit={verify} className="grid gap-3">
            <p role="status">
              {t.signIn.sent(email)}
              {t.signIn.sentLink}
            </p>
            <label className="grid gap-1">
              <span className="text-sm font-bold">{t.signIn.code}</span>
              <input
                className="field"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <button type="submit" className="btn-primary" disabled={busy}>
              {t.signIn.signIn}
            </button>
            <button type="button" className="text-sm text-muted underline" onClick={() => (setSent(false), setCode(""))}>
              {t.signIn.otherAddress}
            </button>
          </form>
        ) : (
          <form onSubmit={send} className="grid gap-3">
            <label className="grid gap-1">
              <span className="text-sm font-bold">{t.signIn.email}</span>
              <input className="field" type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button type="submit" className="btn-primary" disabled={busy}>
              {t.signIn.sendCode}
            </button>
          </form>
        ))}
      {methods.email && methods.providers.length > 0 && <p className="text-center text-sm text-muted">{t.signIn.or}</p>}
      {methods.providers.map((p) => (
        <button key={p.id} type="button" className="btn" disabled={busy} onClick={() => provider(p)}>
          {t.signIn.with(p.label)}
        </button>
      ))}
      {!methods.email && methods.providers.length === 0 && <p className="text-muted">{t.signIn.none}</p>}
    </div>
  );
}
