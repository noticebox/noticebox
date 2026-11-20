# 0008: A decision is announced, and may start a read by a token holder

- Status: accepted
- Date: 2026-11-20

## Context and Problem Statement

Up to 0.21.1 a webhook hears only that a submission arrived. Some cases go on elsewhere once a person has decided on them: 3dbruckner.de's
order requests move to Invoice Ninja when they are accepted (#113). The service that does it needs to know when that decision was made.
V1 says personal data leaves only by a person's hand, and rules out forwarding submissions automatically.

## Considered Options

1. The other service polls the API for submissions in the accepted state.
2. A webhook on every decision, with the two states and the link; the service then reads the case with an API token.
3. noticebox pushes the case's content to the other service when it is accepted.

## Decision Outcome

Option 2, from 0.22.0. A webhook names the events it wants (`on: ["received", "decided"]`, arrivals only without it, so existing
webhooks don't change). A decision posts `{event, form, kind, id, from, to, at, url}` after it is stored: never a field, the reason or
who decided. Every way of deciding (the inbox, MCP, REST) goes through `backend/decide.ts`, so none is missed.

Option 3 breaks V1: noticebox itself would send content out. Option 1 works but costs a poll per minute for an answer the decision
already has. With option 2 the content leaves only through a read with a token a person made and gave to that service, started by that
person's decision: that is the person's hand V1 asks for.

### Consequences

- Good: another service hears of a decision at once, and noticebox stays an inbox with no integration of its own.
- Good: the post carries nothing a stranger wrote; the content still needs a token.
- Bad: posts are not retried and may arrive out of order; a consumer that must not miss one also reads the state through the API.
- Decision posts carry no `test` flag: a test post's submission is closed and deleted when it arrives, so it is never decided.
