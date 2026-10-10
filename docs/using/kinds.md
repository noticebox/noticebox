# States, reasons and kinds

A form's submissions move through its states. A state is a name and two flags: whether it counts as **closed**, and whether entering it **needs a reason**. Any state can be moved to any other; what noticebox enforces is not the path but the record: every move is an event with who, when and why, and a state that needs a reason cannot be entered without one.

## The presets

A form's kind chooses its first states. They can be renamed, reordered, added to or removed on the form's *Settings* tab, as long as a state with submissions in it stays.

**Report**, a notice about content:

| State | Closed | Needs a reason | Meaning |
|---|---|---|---|
| `open` | | | Arrived, nobody has looked yet |
| `in_review` | | | Someone is looking at it |
| `acted_on` | yes | yes | Something was done about the content |
| `rejected` | yes | yes | Nothing was done, on purpose |

**Message**, a contact message:

| State | Closed | Needs a reason | Meaning |
|---|---|---|---|
| `new` | | | Arrived, not answered |
| `answered` | yes | | Answered, by whatever means |

## What the flags do

**Closed** means done: the submission leaves the *Open* list and the form's [retention](../self-hosting/retention.md) starts counting. Moving it to a state that is not closed reopens it, with the old history kept.

**Needs a reason** makes the reason the record of the decision: what was done, or why nothing was. The dialog refuses the move without one; the reason is shown large in the history.

## Notes

*Add a note* records text without changing the state: what was found, who was asked, what the reporter said. Notes are part of the history and stay with the submission.

## What cannot be changed

The history is append-only: a step, once recorded, is never edited or removed. The fields of a submission are never edited either; retention removes the personal ones, and that removal is recorded with its time.
