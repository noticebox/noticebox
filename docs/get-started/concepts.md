# Concepts

The words the rest of the documentation uses.

**Box.** A group of forms: a site, a project. The sidebar lists boxes and their forms. A box is nothing but the `box` name on each form.

**Form.** What a page posts to: a name, a kind, fields, where posts may come from, where the browser goes afterwards, how long closed submissions keep personal data, where to announce a new one, and a link to what a submission is about. All in `noticebox.json`; nothing is made by clicking.

**Kind.** What a form collects, and the states that go with it. A **report** is a notice about content and goes *open*, *in review*, then *acted on* or *rejected*. A **message** is *new* until *answered*. [Reports and messages](../using/kinds.md) has the details.

**Submission.** One post to a form: its fields, when it arrived, where from, and its state.

**State and decision.** A submission moves between the states its kind allows. Closing a report, as acted on or rejected, needs a written reason: the reason is the record of the decision. Any state can be reopened.

**History.** Every step a submission took: received, moved from one state to another, or a note added; by whom, when, with what reason. The history is append-only; nothing in it is ever changed or removed.

**Actor.** The person who took a step, by the name the login proxy passes. A step taken by an assistant through MCP is recorded as *name via client*.

**Retention.** A submission closed longer ago than its form's `retentionDays` loses its personal fields: free text, addresses, anything not marked `personal: false`. The ids, the chosen category, the states and the history stay.

**Link.** A form's `link` is a URL template over its fields, such as `https://notefeed.me/r/{read_id}/{note_id}`. Each submission shows it filled in, so the thing it is about is one click away.

**Endpoint.** `POST /f/<form>`: where a page or a script posts. It is public; the inbox is not.
