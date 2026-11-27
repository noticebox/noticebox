// A decision moves a submission to another of its form's states. Every surface decides through here (the inbox's dialog,
// MCP's decide, REST's decisions), so a decision is announced whichever way it was made: the transition is stored first,
// then posted to the webhooks that asked for decisions, after the answer is on its way. A webhook that is slow or down
// never changes or delays the decision (notify.ts logs it).
import type { Form } from "./config";
import type { Outcome } from "./db";
import { notifyDecision } from "./notify";
import type { Runtime } from "./runtime";

/** Records `actor` moving submission `id` to `to`, then announces it; `baseUrl` is where the inbox is, for the link. */
export function decide(rt: Runtime, form: Form, id: string, actor: string, to: string, reason: string, baseUrl: string): Outcome {
  const from = rt.store.get(id)?.state;
  const now = rt.now();
  const r = rt.store.transition(form, id, actor, to, reason, now);
  if (r.ok && from)
    void notifyDecision(form, { id, from, to, at: now.toISOString() }, baseUrl, rt.fetch, rt.log, (type) => rt.counters.failed(form.name, type));
  return r;
}
