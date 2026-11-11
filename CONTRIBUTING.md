# Contributing

How the code is built and checked is in the [README](README.md#develop). This is how a change is
named and how it reaches a release.

## Pull request titles

The title of a pull request into `main` is a [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
header. A merge puts it in `main`'s history, and [Release Please](#releases) reads the next
version and the changelog from it. A check, `pr-title`, fails a pull request whose title does not
follow it, and runs again when the title is edited.

```
type(scope): description
type(scope)!: description        a breaking change
type: description                the scope is optional
```

The description is free text, one line, and the whole title is at most 100 characters. The type and
the scope are lowercase and come from these lists, which the check reads from
`packages/core/src/convention/pr-title.ts`.

| Type | Use it for | In a release |
|---|---|---|
| `feat` | something the app can do that it could not | a minor version, listed under Features |
| `fix` | something that was wrong | a patch version, under Bug Fixes |
| `perf` | the same result, faster | a patch version, under Performance Improvements |
| `revert` | taking a change back | a patch version, under Reverts |
| `docs` | the guide, the README, comments | none |
| `refactor` | code that changes how it is written, not what it does | none |
| `test` | tests only | none |
| `style` | formatting only | none |
| `build` | the build, the dependencies' versions | none |
| `ci` | the workflows | none |
| `chore` | anything else that is housekeeping | none |

A change that is none of the first four opens no release: the next one that is a feature, a fix, a
performance gain or a revert carries the version. A `!` before the colon marks a change that breaks
what was working, whatever its type, and opens a release too (`docs!:` does). While the version is
below 1.0.0 it bumps the minor version, and from 1.0.0 the major.

| Scope | The part of the code it names |
|---|---|
| `analysis` | the engine: the simulator, the metrics, the effort model |
| `layouts` | a bundled layout's definition, the default layers, the layout model |
| `library` | the Library view and the changes proposed to the layouts that come with the app |
| `community` | the community layouts and Submit |
| `editor` | editing a layout in Analyze: keys, layers, combos, macros |
| `rules` | rule sets |
| `sync` | saving layouts to a GitHub account, and the storage behind it |
| `corpora` | the texts layouts are measured on |
| `web` | the rest of the app |
| `worker` | the sign-in server |
| `guide` | the user guide |
| `ci` | the workflows |
| `deps` | dependencies |

A scope is optional. A change that fits none of them is better without one than under a word the
changelog would show once. A part of the code that needs a word gets it in
`PULL_SCOPES`, in the pull request that needs it.

```
feat(editor): macro steps, edited as a key is
fix(analysis): Repeat on a one-shot layer costs one press
docs(guide): say what a proposed change's title looks like
feat(layouts)!: bundled layouts drop the layers their authors do not define
chore(deps): bump vitest
```

If the check fails, edit the title on GitHub. It runs again as soon as the title changes; no push is
needed, and re-running the failed run would read the title it had then. Two limits: GitHub starts no
`pull_request` workflow for a pull request that has a merge conflict, so one is not checked until the
conflict is gone; and nothing requires the check to pass before a merge, which a repository ruleset
that requires `pr-title / title` would.

### Pull requests the app opens

The sign-in server opens a pull request when someone proposes a change or submits a layout, and
when a maintainer deletes or promotes one. No dialog takes a title: the server writes it, from
what was asked and the layout's id, in the form above, so every one passes the check.
Merging a pull request is its maintainer's acceptance, and what it adds is a feature, what it
changes or takes out is a fix.

| Asked | Into | Title |
|---|---|---|
| Change a layout that comes with the app | `main` | `fix(library): change <id>` |
| Delete one | `main` | `fix(library): delete <id>` |
| Promote a custom or community layout into the Library | `main` | `feat(library): promote <id>` |
| Change a community layout | `layerbench-data` | `fix(community): change <id>` |
| Delete one | `layerbench-data` | `fix(community): delete <id>` |
| Submit a layout | `layerbench-data` | `feat(community): add <id>` |

The commits the server and the `library-edit` workflow make on those branches are `chore`, so a
merge counts the change once, by the title. A title edited on GitHub is held to the same check as any
other, for a pull request into `main`; community layouts, in `layerbench-data`, are not released
from and are not checked.

### Merging

Squash a pull request, so `main` has one commit for each change and that commit's header is the
title. In the repository's **Settings**, **General**, section **Pull Requests**, the dropdown under
**Allow squash merging** sets what a squash starts from; choose the one that uses just the pull
request's title (`squash_merge_commit_title: PR_TITLE` in the REST API). With the default, GitHub
squashes a pull request of one commit with that commit's own title, and only a pull request of
several commits with the pull request's.

Release Please also reads a merge commit, by the title in its body, but it does not read a title with
a `!` there: such a pull request is missed altogether, with no release and no changelog line. Only a
squash merge makes a breaking change count. A rebase merge puts the title nowhere in the history.
History before the first release is not conventional and is left as it is.

## Releases

`.github/workflows/release-please.yml` runs on every push to `main`. It keeps one pull request open,
titled `chore(main): release X.Y.Z`, that sets the version in the `package.json` files (the root, and
`packages/core`, `packages/corpora` and `apps/web`, which share it), writes `CHANGELOG.md` from the
titles merged since the last release, and updates `.release-please-manifest.json`. Merging it
tags `vX.Y.Z` and publishes a GitHub release with the same notes. There is one version for the whole
repository, and it is not the app's: the app is deployed on every push to `main`, as before, and
does not read it.

- Do not edit the release pull request's title: Release Please finds the pull request it merged by
  it, and builds the release's notes from its body.
- Release Please counts from the tag `v0.2.0`, the version the manifest starts at, which must exist
  before its first run: it is the commit `b7a0fc8a`, `git tag v0.2.0 b7a0fc8a` and `git push origin
  v0.2.0`. Without it the first release's notes link to a tag that is not there. The config's
  `bootstrap-sha` names the same commit and is read only while no release or tag is found.
- No release pull request is open until a feature, a fix, a performance gain, a revert or a breaking
  change has been merged after that tag.
- The release pull request is opened as the GitHub App, so its checks run. If the workflow fails
  to open it, the App's permissions are the first place to look: it needs to write the repository's
  contents and pull requests.
