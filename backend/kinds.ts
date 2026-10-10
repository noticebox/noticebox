// The kinds of form are presets: the states a form of that kind starts with. A state is a name and two flags: whether
// it counts as closed (done, and under the form's retention) and whether entering it needs a written reason, so that
// decisions are recorded, not just made. Any state can be moved to any other; what is kept is the record of each move.

export type KindName = "report" | "message";

export type State = { name: string; closed: boolean; reason: boolean };

export type Kind = { label: string; states: State[] };

export const KINDS: Readonly<Record<KindName, Kind>> = {
  // A notice about content: taken in, looked at, then acted on or rejected, each with its reasons.
  report: {
    label: "report",
    states: [
      { name: "open", closed: false, reason: false },
      { name: "in_review", closed: false, reason: false },
      { name: "acted_on", closed: true, reason: true },
      { name: "rejected", closed: true, reason: true },
    ],
  },
  // A contact message: new until answered.
  message: {
    label: "message",
    states: [
      { name: "new", closed: false, reason: false },
      { name: "answered", closed: true, reason: false },
    ],
  },
};

export function isKind(x: unknown): x is KindName {
  return typeof x === "string" && Object.hasOwn(KINDS, x);
}

export const STATE_NAME = /^[a-z][a-z0-9_]{0,31}$/;

/** Reads a form's `states`: a list of names or `{ name, closed, reason }` objects; absent, the kind's preset. */
export function parseStates(at: string, raw: unknown, kind: KindName): State[] {
  if (raw === undefined || raw === null) return KINDS[kind].states.map((s) => ({ ...s }));
  if (!Array.isArray(raw) || raw.length === 0) throw new Error(`${at}: a list of at least one state`);
  const out: State[] = [];
  for (const [i, x] of raw.entries()) {
    const o = typeof x === "string" ? { name: x } : x;
    if (typeof o !== "object" || o === null || Array.isArray(o)) throw new Error(`${at}[${i}]: a name or { name, closed, reason }`);
    const { name, closed, reason } = o as Record<string, unknown>;
    if (typeof name !== "string" || !STATE_NAME.test(name)) throw new Error(`${at}[${i}].name: lowercase letters, digits and _, up to 32 characters`);
    if (out.some((s) => s.name === name)) throw new Error(`${at}: the state "${name}" is listed twice`);
    for (const [k, v] of [["closed", closed], ["reason", reason]] as const) if (v !== undefined && typeof v !== "boolean") throw new Error(`${at}[${i}].${k}: true or false`);
    out.push({ name, closed: closed === true, reason: reason === true });
  }
  return out;
}

export const stateOf = (states: readonly State[], name: string): State | undefined => states.find((s) => s.name === name);
