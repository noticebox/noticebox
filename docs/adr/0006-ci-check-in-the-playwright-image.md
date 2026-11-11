# 0006: The CI check runs in Microsoft's Playwright image

- Status: accepted
- Date: 2026-11-11

## Context and Problem Statement

The `check` job installed Chromium's system libraries on every run with `npx playwright install --with-deps chromium`, which runs apt against the Ubuntu mirrors. On 2026-11-11, GitHub's hosted runners could not resolve those mirrors for hours, on every Ubuntu image (actions/runner-images#15296, #15297). Every pull request's check failed, although nothing in the repository was wrong, and `main` requires `check`, so nothing could merge.

## Considered Options

1. Keep `--with-deps` and wait out outages like this one.
2. Fall back to `npx playwright install chromium` when apt fails, relying on the libraries the runner image happens to ship.
3. Run the job in `mcr.microsoft.com/playwright:v<version>-noble`, which has the browsers and their libraries built in.

## Decision Outcome

Option 3. The check needs no apt and no browser download, so neither the Ubuntu mirrors nor Playwright's CDN can fail it. The image comes from Microsoft's registry, which stayed reachable during the outage.

The image's tag has to match `@playwright/test` exactly. Dependabot bumps the npm package, but not a container tag in a workflow, so a small `playwright` job reads the version from `package-lock.json` and the `check` job's `container:` uses it. Node still comes from `setup-node` and `.nvmrc`, so the check runs on the Node the Docker image uses, whatever Node the Playwright image ships.

### Consequences

- Good: a mirror or CDN outage no longer blocks every pull request.
- Good: a Playwright bump moves the image with it; there is no second version to keep in step.
- Bad: the check depends on Microsoft publishing the image for each Playwright release. It does so on release day; a bump before that fails until it exists.
- Bad: one extra job (a few seconds) before the check starts.
