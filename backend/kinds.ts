// The kinds of form. A kind is a small state machine: what comes in starts in `initial`, the operator moves it along
// `next`, and in a `closed` state it counts as done and falls under the form's retention. Entering a state named in
// `reasonRequired` needs a written reason, so decisions are recorded, not just made.

export type KindName = "report" | "message";

export type Kind = {
  label: string;
  initial: string;
  closed: readonly string[];
  next: Readonly<Record<string, readonly string[]>>;
  reasonRequired: readonly string[];
};

export const KINDS: Readonly<Record<KindName, Kind>> = {
  // A notice about content: taken in, looked at, then acted on or rejected, each with its reasons. Reopening is allowed.
  report: {
    label: "report",
    initial: "open",
    closed: ["acted_on", "rejected"],
    next: {
      open: ["in_review", "acted_on", "rejected"],
      in_review: ["open", "acted_on", "rejected"],
      acted_on: ["open"],
      rejected: ["open"],
    },
    reasonRequired: ["acted_on", "rejected"],
  },
  // A contact message: new until answered.
  message: {
    label: "message",
    initial: "new",
    closed: ["answered"],
    next: { new: ["answered"], answered: ["new"] },
    reasonRequired: [],
  },
};

export function isKind(x: unknown): x is KindName {
  return typeof x === "string" && Object.hasOwn(KINDS, x);
}

export function states(kind: KindName): string[] {
  return Object.keys(KINDS[kind].next);
}
