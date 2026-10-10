# Reports and messages

A form's kind says what it collects and which states a submission can be in. There are two.

## Report

A notice about content: something that should not be there, with a reason and a description, from someone who may want an answer.

| State | Meaning | Reached by |
|---|---|---|
| `open` | Arrived, nobody has looked yet | arrival; *Reopen* from any other state |
| `in_review` | Someone is looking at it | *Start review* |
| `acted_on` | Something was done about the content | *Mark as acted on*, with a reason |
| `rejected` | Nothing was done, on purpose | *Mark as rejected*, with a reason |

`acted_on` and `rejected` are the closed states: a closed report counts as done and falls under the form's [retention](../self-hosting/retention.md). Both need a written reason, because the reason is the record of the decision: what was done, or why nothing was. A closed report can be reopened, which starts a new round with the old history kept.

A report form usually carries hidden fields that say what the report is about (`read_id`, `note_id`, `file` in notefeed's case), a `reason` from a fixed list, a `text`, and an optional `email`. The form's `link` turns the ids into a URL, so the reported thing is one click from the report.

## Message

A contact message: new until answered.

| State | Meaning | Reached by |
|---|---|---|
| `new` | Arrived, not answered | arrival; *Reopen* |
| `answered` | Answered, by whatever means | *Mark as answered* |

`answered` is the closed state. No reason is required, but a note of how it was answered is kept in the history like any other.

## Notes

In either kind, *Add a note* records text without changing the state: what was found, who was asked, what the reporter said. Notes are part of the history and stay with the submission.

## What cannot be changed

A state can only move along the paths above; the dialog offers nothing else. The history is append-only: a step, once recorded, is never edited or removed. The fields of a submission are never edited either; retention removes the personal ones, and that removal is recorded with its time.
