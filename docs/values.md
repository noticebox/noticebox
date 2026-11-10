# What noticebox stands for

noticebox is the inbox behind a form on a static page: each submission arrives as a case, moves through the states you define, and is closed with a decision that stays on the record. This page says what noticebox will stay, whoever runs it and whatever it grows into.

It is written for you if you are deciding whether to trust noticebox with what people send you, and for the people who send it. It is also the yardstick for every change: a contribution, from a person or an AI, is judged against these points, and a review names the one it touches ("this breaks V1"). Each point says what it rules out, so that it can be used that way.

## Lines never crossed

These three come first. When a feature would be easier, or would sell better, by bending one of them, the feature changes or is not built.

### V1. Personal data leaves only by a person's hand {#v1}

What someone sends through a form stays in the inbox until a person reads it and decides to pass it on. A notification says only that something arrived, with a link, never what. Nothing sends a submission's content to another service by itself: a GitHub issue, for one, is a filled-in link that a person checks and submits, without the sender's email address.

**Rules out:** content or the sender's email address in ntfy, webhook or mail notifications; forwarding submissions to other services automatically; a token or API call that pushes submission content out of noticebox.

ADRs: [0001](https://github.com/noticebox/noticebox/blob/main/docs/adr/0001-github-issues-as-filled-in-links.md).

### V2. Personal data doesn't outlive the case {#v2}

A submission's personal fields are kept while the case is open, and for the retention period each form sets after it closes. Then they are removed. What stays (ids, states, the history and its reasons) is there to show that the case was handled, holds no personal data, and can be given an end too.

**Rules out:** keeping personal fields without a limit by default; retention that can't be set per form; analytics, tracking or third-party scripts on the endpoint or the thank-you page.

### V3. Every decision is on the record {#v3}

A submission's history is append-only, and its state follows from it. Every move says who made it and when, with a reason where the state asks for one. An assistant acts in a person's name, and the history says so: *name via client*.

**Rules out:** editing or deleting history entries; a change of state without a person behind it; an assistant, token or script acting on its own account.

ADRs: [0002](https://github.com/noticebox/noticebox/blob/main/docs/adr/0002-sign-in-with-better-auth.md).

## What you can rely on

Why you can trust noticebox with your inbox: where it runs, how your form talks to it, and how you leave.

### V4. Your server, nothing calls home {#v4}

noticebox runs as one container with one SQLite file. Every feature is in the self-hosted version. The only outside calls are the ones you configure: your notifier, your sign-in provider, your mail server. The code is AGPL-3.0: anyone may run it, and a changed version run as a service stays open.

**Rules out:** telemetry; features only a hosted version has; an outside service noticebox needs in order to run.

ADRs: [0003](https://github.com/noticebox/noticebox/blob/main/docs/adr/0003-better-sqlite3-and-kysely.md).

### V5. Your page, your form {#v5}

noticebox hosts no form. The page and its form are yours, written however you like; a plain HTML form that posts to `/f/<form>` works without JavaScript and without an embed script. Spam is kept out without anyone else watching: a field bots fill, a rate limit, and the origins a form accepts.

**Rules out:** a form builder or hosted form pages; a required embed script; a third-party captcha or spam service that sees the submissions.

### V6. Your data comes out {#v6}

Submissions and their history can be exported at any time, and the database is a plain SQLite file any tool can open. Leaving noticebox loses nothing it kept.

**Rules out:** a storage format only noticebox can read; an export that drops the history or the reasons.

## Principles that follow

### V7. Claude first {#v7}

Every feature works over MCP first, and every tool result tells the assistant what to do next. The REST API and the web pages follow, over the same backend, so none of them can do what the others can't.

**Rules out:** a feature only the web app or the REST API has; logic in an adapter rather than the backend; after-call guidance only in tool descriptions.

ADRs: [0002](https://github.com/noticebox/noticebox/blob/main/docs/adr/0002-sign-in-with-better-auth.md).

### V8. You decide what a case is {#v8}

States, kinds and fields are configuration, not code. Any state can move to any other. Forms are set up where they are used, in the inbox and over MCP, and take effect at once.

**Rules out:** a fixed workflow; code paths for one form or one kind of form; configuration that only a file or a deploy can change.

ADRs: [0004](https://github.com/noticebox/noticebox/blob/main/docs/adr/0004-forms-live-in-the-database.md).

## Changing this page

Points keep their numbers, so that reviews and issues citing them stay right. A change needs the maintainer's approval and says why in its pull request. Weakening a line never crossed is a change to what noticebox is.
