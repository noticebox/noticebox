/** An ISO timestamp as "2026-10-10 12:34 UTC". */
export const when = (iso: string): string => iso.slice(0, 16).replace("T", " ") + " UTC";

/** A state as people read it: "in_review" is "in review". */
export const stateLabel = (state: string): string => state.replaceAll("_", " ");

/** The badge class for a state: what waits, what is being looked at, what is done. */
export function stateTone(state: string, closed: readonly string[]): string {
  if (state === "rejected") return "badge-off";
  if (closed.includes(state)) return "badge-done";
  if (state === "in_review") return "badge-review";
  return "badge-open";
}
