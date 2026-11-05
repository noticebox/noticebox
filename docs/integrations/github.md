# GitHub issues

A submission can become an issue in a GitHub repository: a report about a broken page becomes a bug in the site's repository, an idea becomes a task. noticebox does not create the issue itself. It links to GitHub's new-issue page, filled in, and you check and submit it there.

## Setting it up

Name the repository on the form: on its *Settings* tab under *GitHub issues*, over MCP with `put_form`, or in the forms file:

```json
"github": { "repo": "example/site", "labels": ["report"] }
```

`"github": "example/site"` is the short form without labels. No token is needed; you open the issue as yourself, signed in to GitHub.

## Opening an issue

A submission's page has *Open GitHub issue*. It opens the repository's new-issue page with:

- **the title**: the form's title-like field (named or labelled title, subject, Betreff), else the first line of free text
- **the body**: every field the person sent, with its label, except their email address (an `email` field, or an undescribed field holding an address); the form's [link](../self-hosting/configuration.md#link); and the link back to the submission in the inbox
- **the labels** the form names, if you may set labels in that repository

Change what you like and submit it on GitHub. GitHub limits how long such a link may be, so a very long submission is cut, with a note that the whole of it is in noticebox.

Over MCP, `get_submission` carries the same link as `github_issue_url`, so an assistant can hand it to you.

## What leaves the box

Nothing, until you submit the issue on GitHub. Then what you submitted lives there, often in a public repository, and [retention](../self-hosting/retention.md) does not reach it. The draft holds what the person wrote, names included if they wrote them: read it before you submit.
