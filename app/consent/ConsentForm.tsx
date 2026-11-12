"use client";

import { useState } from "react";
import { authClient } from "@/app/_lib/auth-client";
import { t } from "@/app/_lib/copy";

// Allow or deny an MCP client. oauthProviderClient sends this page's signed query along, which says what is consented to.
export function ConsentForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function answer(accept: boolean) {
    setBusy(true);
    const { data, error } = await authClient.oauth2.consent({ accept });
    if (error || !data?.url) {
      setBusy(false);
      setError(true);
      return;
    }
    window.location.assign(data.url);
  }

  return (
    <div className="grid gap-3">
      <div className="flex gap-3">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => answer(true)}>
          {t.consent.allow}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => answer(false)}>
          {t.consent.deny}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-error">
          {t.consent.failed}
        </p>
      )}
    </div>
  );
}
