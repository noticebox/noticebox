# Compared with other form tools

noticebox is not a form builder, and it is not a general form backend either. It is the inbox behind a form you already have, for the cases where each submission must be decided or answered, and the decision kept. This page says where that fits and where another tool is the better choice.

!!! note
    The other tools change their plans and features often. What is said about them here is their general shape, not a feature-by-feature or price comparison; check their own pages before you decide.

## Three kinds of tool

**Form builders** (Google Forms, Typeform, Tally, Jotform) host the form itself: you design it in their editor and share a link or an embed. The page, the look and the data live with them. noticebox hosts no form pages; the page is yours.

**Form backends** (Formspree, Basin, Getform, Formspark, FormSubmit, Netlify Forms) are an endpoint a static page posts to, which is what noticebox is too. They keep the submissions, mail them to you and pass them on to other services. What they do with a submission after it arrives is mostly: show it, search it, forward it.

**Survey and feedback tools** (Formbricks and the like) collect answers to analyse them in aggregate. noticebox treats each submission as a case for one person to close.

## Where noticebox differs

| | Typical form backend | noticebox |
|---|---|---|
| Where it runs | Their servers; you sign up | Your server, one container and one SQLite file |
| Who sees the data | You and the provider | You |
| After a submission arrives | Read, search, export, forward | Moved through states you define, each move with who, when and a written reason |
| Record of what happened | Usually none beyond the submission | An append-only history per submission |
| Personal data | Kept until you delete it | Removed from closed submissions after a retention period; ids, states and history stay |
| Accounts | Theirs, with plans and seats | None: the login is your reverse proxy's |
| Notifications | Often the full submission by email | Only that something arrived and a link; never the content |
| Assistants | Integrations, Zapier-style automation | [MCP](../integrations/mcp.md): an assistant reads, annotates and decides in the signed-in person's name, recorded as *name via client* |
| The form page | Hosted by some, yours with others | Always yours |
| Spam | Honeypot, captcha, filters | A honeypot, a per-address rate limit and an optional list of accepted origins |

## When noticebox is the better fit

- A submission is a **report or a request that has to be decided**, with a reason you can show later, such as content reports or takedown notices.
- A **contact message must be answered**, and you want to see what has not been.
- The data should stay on a **server you run**, and you do not want to hand out accounts.
- Several people, or an assistant on someone's behalf, handle the inbox and **who did what** matters.
- Personal data should **not outlive the case** it was collected for.

## When another tool is the better fit

- You want to **build the form without writing HTML**, with a visual editor, conditional questions or a hosted page. Use a form builder.
- You need **file uploads**, payments, signatures, or integrations with dozens of services. noticebox takes text fields only and notifies through ntfy or a webhook.
- You want **survey analysis**: charts over many answers, response rates, A/B tests.
- You do not want to **run a server** or keep backups. A hosted backend does this for you; noticebox is one container but you operate it.
- Your site is **hosted on a platform with built-in forms**, such as Netlify, and mailing the submissions to yourself is all you need.

## Moving from a form backend

If you already post to a hosted endpoint, the page changes in one place: the form's `action`.

```html
<!-- before -->
<form method="post" action="https://formspree.io/f/xyzabcde">
<!-- after -->
<form method="post" action="https://inbox.example.org/f/contact">
```

A hidden `_gotcha` honeypot field is understood as it is by Formspree, so it can stay. Other tool-specific hidden fields, such as a custom subject or reply-to, are taken as ordinary fields by noticebox unless the form is strict. See [Posting from a page](../integrations/forms.md) for what noticebox does with a post, and the [Quick start](quick-start.md) to run it.
