# 0001: GitHub issues are filled-in links, opened by a person

- Status: accepted
- Date: 2026-11-05

## Context and Problem Statement

A submission should be able to become an issue in a GitHub repository chosen per form (#21, #23, #25). An issue leaves the box for GitHub, often for a public repository, and retention cannot reach it there.

## Considered Options

1. noticebox creates the issue through GitHub's API, with a token (per instance in 0.8.0, per form in 0.9.0), from a draft of the non-personal fields.
2. noticebox links to the repository's new-issue page with the title, body and labels in the URL; the operator checks and submits it on GitHub.

## Decision Outcome

Option 2, from 0.10.0. A person reads every issue before it exists, so the draft can carry everything the person sent, which is what makes it useful, except their email address, which never belongs in an issue. noticebox holds no GitHub token and calls no GitHub API: nothing to create, rotate, encrypt or leak, and nothing leaves the box until someone submits on GitHub. The cost: noticebox does not learn the issue's number, and a long submission is cut to fit GitHub's URL limit, with a note.

Option 1 shipped in 0.8.0 and 0.9.0. 0.10.0 drops it, and drops its `issues` and `form_tokens` tables at start.
