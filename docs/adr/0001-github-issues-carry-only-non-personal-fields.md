# 0001: GitHub issues carry only non-personal fields, one per submission

- Status: accepted
- Date: 2026-11-05

## Context and Problem Statement

A submission should be able to become an issue in a GitHub repository chosen per form (#21). An issue leaves the box for GitHub, often for a public repository, and retention cannot reach it there. Until now nothing a person wrote ever left the box: notifications carry only a title and a link.

## Considered Options

1. Send the whole submission.
2. Send only the fields marked `personal: false`, the form's link and the submission's id, as an editable draft.
3. Send only a link back to the inbox.

## Decision Outcome

Option 2. The draft uses the same line retention already draws (undescribed fields count as personal), so a form's settings say once what may leave. The person opening the issue sees the draft and may change it; over MCP the tool description tells the assistant to leave out what identifies the writer. Option 1 would publish names and email addresses; option 3 gives the repository nothing to work with.

The repository is set per form (`github`), the token once per instance (`NOTICEBOX_GITHUB_TOKEN`, from the environment, never in the forms file). Each submission gets at most one issue, kept in an `issues` table and as a note in its history.
