# Security policy

## Reporting a vulnerability

Report it privately through [**Report a vulnerability**](https://github.com/noticebox/noticebox/security/advisories/new) on this repository's Security tab. Please do not open a public issue for it.

This covers the server and the image `ghcr.io/noticebox/noticebox`: the form intake, the inbox, the MCP endpoint and its OAuth server, and the notifications it sends.

Helpful in a report: the version or image tag, how the instance is configured as far as it matters (the login proxy in front, the forms), and the steps that show the problem.

You get an answer within seven days. Once a fix is released, the advisory is published and names you, unless you would rather not be named.

## Supported versions

Security fixes go into a new release, and only the newest release gets them. There are no backports to older versions.

| Version | Security fixes |
|---|---|
| newest release (`:latest`, and the `:X.Y` tag that follows it) | yes |
| anything older | no: upgrade to the newest release |

How to upgrade: [Upgrading](https://noticebox.github.io/noticebox/self-hosting/upgrading/).

## What the image carries

The image in the registry carries an SBOM (what it contains, the base's packages included) and a build provenance attestation (how, from which commit and by which workflow it was built):

```sh
docker buildx imagetools inspect ghcr.io/noticebox/noticebox:X.Y.Z --format '{{ json .SBOM }}'
docker buildx imagetools inspect ghcr.io/noticebox/noticebox:X.Y.Z --format '{{ json .Provenance }}'
```

## How this repository watches for vulnerabilities

- Dependabot alerts and security updates: a pull request for a fixed version as soon as an advisory is known.
- Secret scanning with push protection: a pushed token is refused.
- CodeQL code scanning on every pull request.
- A daily audit of the production dependencies and of the published image (`.github/workflows/audit.yml`).
