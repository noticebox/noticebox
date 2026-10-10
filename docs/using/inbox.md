# The inbox

The inbox is where submissions are read and decided. It is behind the login the proxy puts in front; the name in the top right is who the proxy says is signed in, and every step is recorded under that name.

## Sidebar

The boxes and their forms, each form with the number of submissions that wait for a decision. The front door opens the first form.

## Overview

A form's first tab: how many submissions wait, how many arrived in the last 30 days, a bar per day, the count per state, and what a page needs to post here: the endpoint, where posts are accepted from, where the browser goes afterwards, the retention, where new submissions are announced, and the fields.

## Submissions

The table of a form. *Open* is the default; *Closed*, *All* and each state are a click away. A row shows when a submission arrived, its state and the first text it contains. The date and the text open the submission; the arrow at the end opens what it is about, when the form has a [link](../get-started/concepts.md).

**The state is a dropdown.** Click the badge: it lists what can be done with the submission, named by what it does: *Start review*, *Mark as acted on*, *Mark as rejected*, *Reopen*, *Mark as answered*. Choosing one opens the dialog.

![The dialog: a reason, then the action confirmed under the same name](../assets/screenshot-dialog.png)

**The dialog.** Write the reason, check the next state, confirm with the button that repeats the action's name. A state that needs a reason refuses to be set without one; the choice stays in the dialog so only the reason has to be added. *Add a note* is the same dialog with the state kept.

## A submission

Its fields as the form labelled them, the state dropdown and *Add a note*, the link to what it is about, when and from where it arrived. Beside it the history: received, each move from one state to another, each note; by whom and when, with the reason. A recorded decision's reason is set large: it is what the box exists to keep.

![A submission: the fields, the state, the link to the note, and the history with the recorded reason](../assets/screenshot-detail.png)

When the personal fields have been removed by retention, the page says so and shows what is left: the ids, the category, the states and the decisions.

## Download

*Download everything as JSON* in the sidebar gives every submission with its history, for an audit or a migration. `?form=<name>` limits it to one form. See [Retention, export and backups](../self-hosting/retention.md).
