/** An ISO timestamp as "2026-10-10 12:34 UTC". */
export const when = (iso: string): string => iso.slice(0, 16).replace("T", " ") + " UTC";

/** A state as people read it: "in_review" is "in review". */
export const stateLabel = (state: string): string => state.replaceAll("_", " ");

type StateLike = { name: string; closed: boolean };

/** The action that moves a submission into a state, named by what it does; the same words on the menu, the dialog and its button. */
export function verbFor(to: string, initial: string): string {
  if (to === initial) return "Reopen";
  if (to === "in_review") return "Start review";
  return `Mark as ${stateLabel(to)}`;
}

/** The badge class for a state: the first (what waits) is ink on paper, a closed one green (quiet when it is a rejection), anything between amber. */
export function stateTone(state: string, states: readonly StateLike[]): string {
  const s = states.find((x) => x.name === state);
  if (!s) return "badge-off";
  if (s.closed) return /reject|spam|decline|closed/.test(state) ? "badge-off" : "badge-done";
  if (states[0]?.name === state) return "badge-open";
  return "badge-review";
}
