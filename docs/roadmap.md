---
hide:
  - toc
---

# Where noticebox is going

noticebox started on 2026-10-10 as the inbox behind the contact and report forms of a few static sites, with an assistant able to read and decide over MCP. It is becoming a self-contained app: its own sign-in, its forms in its own database, and every action reachable by an assistant, a script or a person.

This page says what is planned and why, inside the [values](values.md), and what has shipped. Each step links its issue and the value it serves. Planned steps have no dates, only now, next or later; shipped steps carry the day they shipped.

## The idea behind all of it

One container that keeps the cases people send you, lets you and your assistant decide them on the record, and lets nothing personal leave or linger.

<!-- roadmap -->

## Parked

- **A new look for the inbox** ([#20](https://github.com/noticebox/noticebox/issues/20)): a deliberate visual direction for every page, waiting for that direction to be chosen.

## Decided against

- **Creating GitHub issues through the API**: shipped in 0.8.0 and 0.9.0, then replaced by filled-in links, because a token and an automatic issue would let personal data leave without a person ([V1](values.md#v1), [ADR 0001](https://github.com/noticebox/noticebox/blob/main/docs/adr/0001-github-issues-as-filled-in-links.md)).

## Keep it true

The timeline is rendered from [`docs/roadmap.yml`](https://github.com/noticebox/noticebox/blob/main/docs/roadmap.yml); on GitHub, read that file. Finish a step in the pull request that finishes it: set `status: done`, replace `when` with a `date`, add the link to its pull request, and move it to the top of the shipped entries. Change the file in the pull request that changes the plan.
