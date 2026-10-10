/** An ISO timestamp as "2026-10-10 12:34 UTC". */
export const when = (iso: string): string => iso.slice(0, 16).replace("T", " ") + " UTC";

/** A state as people read it: "in_review" is "in review". */
export const stateLabel = (state: string): string => state.replaceAll("_", " ");

/** The action that moves a submission into a state, named by what it does; the same words on the menu, the dialog and its button. */
export function verbFor(to: string): string {
  switch (to) {
    case "in_review":
      return "Start review";
    case "open":
    case "new":
      return "Reopen";
    default:
      return `Mark as ${stateLabel(to)}`;
  }
}

/** The badge class for a state: what waits is ink on paper, what is being looked at amber, what is done green, what was turned down quiet. */
export function stateTone(state: string, closed: readonly string[]): string {
  if (state === "rejected") return "badge-off";
  if (closed.includes(state)) return "badge-done";
  if (state === "in_review") return "badge-review";
  return "badge-open";
}
