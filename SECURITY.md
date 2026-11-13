# Security policy

## Scope

This policy covers the code in this repository:

- **The app** (`apps/web`, `packages/core`, `packages/corpora`), served at
  [layerbench.github.io](https://layerbench.github.io).
- **The sign-in server** (`worker/`, the Cloudflare Worker, and
  `apps/web/src/server/github-auth.ts`), which swaps GitHub's sign-in code for tokens and opens
  pull requests as the GitHub App.
- **The workflows** (`.github/workflows`), which build, test and deploy the app and the landing
  page, and open pull requests as the GitHub App.

A vulnerability in a dependency belongs to that project: report it there, in private, as its own
security policy says. One that is already public may be in GitHub's Advisory Database and does not
need to be reported here. A bundled layout or corpus text being wrong is not a security issue: open
an issue for that instead (see the templates).

## Reporting a vulnerability

Report a vulnerability in private, through GitHub's own tool for it: open the **Security** tab on
this repository, then **Report a vulnerability**, or go directly to
[github.com/rafaelromao/layerbench/security/advisories/new](https://github.com/rafaelromao/layerbench/security/advisories/new).
This opens a draft security advisory that only you and the maintainer can see, so the report, and
any discussion of it, stays private until a fix is out. Do not open a public issue for a
vulnerability.

Include what you would in any report: what is affected, how to reproduce it, and what it lets an
attacker do.

## What to expect

This is a volunteer-maintained project, with no bug bounty. You can expect:

- An acknowledgement within a few days.
- To be kept up to date as the report is looked into, and told the outcome, whether that is a fix,
  or why it is not treated as a vulnerability.
- Credit in the advisory, if you want it, once a fix ships.
