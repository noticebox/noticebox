# GitHub issues

A submission can become an issue in a GitHub repository: a report about a broken page becomes a bug in the site's repository, a request becomes a task. Each form names its own repository and has its own token, and each submission gets at most one issue.

## Setting it up

1. Name the repository on the form: on its *Settings* tab under *GitHub issues*, over MCP with `put_form`, or in the forms file:

```json
"github": { "repo": "example/site", "labels": ["report"] }
```

`"github": "example/site"` is the short form without labels. Labels that do not exist yet are created by GitHub, if the token may.

2. Create a fine-grained personal access token for that repository. The form's *Settings* tab, under *GitHub token*, has *How to make the token* with a link to GitHub's new-token page, filled in for this form (name, description, the owner, a year's expiry, Issues write), and the steps for the rest; over MCP, `github_token_guide` returns the same link and steps. What the token needs:
    - **Resource owner**: the repository's owner (an organisation may have to allow or approve fine-grained tokens)
    - **Repository access**: *Only select repositories*, that one repository
    - **Permissions**: *Issues: Read and write*, nothing else (*Metadata: Read-only* is added by GitHub)
3. Set it: paste it on the *Settings* tab and save, or have an assistant call `set_github_token`. From then on noticebox says who set it and when, never the token; replace it before it expires, remove it to stop issues. Keep it in your password manager too.

The token is the form's, not the instance's: a fine-grained token reaches one owner, and a form for one product should not be able to write to another's repositories. It is stored in the database encrypted with a key derived from `NOTICEBOX_SECRET`, so the database file and its backups never hold it in clear; changing the secret makes it unreadable, and the *Settings* tab asks for it again. No page and no tool returns it again; `get_form` and `github_token_guide` say only whether a form has one, who set it and when. A token set over MCP has passed through the assistant's conversation; where that matters, paste it on the *Settings* tab instead.

## Opening an issue

On a submission's page, *Open GitHub issue* shows the draft: a title, and a body with the fields marked `personal: false`, the form's [link](../self-hosting/configuration.md#link) and the submission's id. Change what you like and confirm. Over MCP, `create_issue` does the same; an assistant may pass its own `title` and `body`.

The issue is recorded with the submission: a note in its history, *Opened GitHub issue example/site#12* with the link, in the name of whoever opened it, and a button to the issue on the submission's page. `get_submission` carries it as `issue`. A second issue for the same submission is refused.

## What leaves the box

An issue lives on GitHub, often in a public repository. The draft therefore leaves out every personal field (free text and email unless marked otherwise, and every undescribed field), as [retention](../self-hosting/retention.md) would. Whatever you type into the draft yourself is sent as it is: leave out what identifies the person who wrote in. Retention does not reach the issue; it stays on GitHub until you delete it there.
