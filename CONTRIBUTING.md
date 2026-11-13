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
needed, and re-running the failed run would read the title it had then. A pull request into `main`
does not merge until the check passes: the repository's ruleset for `main` requires
`pr-title / title` ([Merging](#merging)). GitHub starts no `pull_request` workflow for a pull request
that has a merge conflict, so one is neither checked nor merged until the conflict is gone.

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

The sign-in server is deployed by hand (README → Worker), so one deployed before this rule goes on
opening pull requests into `main` with the old titles, as `Library: change enthium`, until it is
deployed again. The `library-edit` workflow does not wait for that: it titles the pull request as
the table says, from the request, before it applies it, unless the title it has follows the check
already, in which case a person's own is kept. The check runs again within a minute or so of the
pull request being opened, once the workflow has installed what it needs; failing to title never
stops the request from being applied. The check runs again by itself when the title is
edited. And CI does not fail a pull request for the request still being on its branch while
`library-edit` applies it: it waits for that run, which replaces it with the result's own.

The commits the server and the `library-edit` workflow make on those branches are `chore`, so a
merge counts the change once, by the title. A title edited on GitHub is held to the same check as any
other, for a pull request into `main`; community layouts, in `layerbench-data`, are not released
from and are not checked.

### Merging

Squash a pull request, so `main` has one commit for each change and that commit's header is the
title. A squash is the only merge `main` takes, and it takes just the pull request's title, with no
body: Release Please reads a body too, and a line of the description that reads as `fix: …`, or a
`BREAKING CHANGE:` footer, would add a changelog line or a version the title does not have.

Two settings of the repository hold this, each set by an owner:

- **Settings**, **General**, **Pull Requests**: under **Allow squash merging**, **Pull request
  title** (`squash_merge_commit_title: PR_TITLE` and `squash_merge_commit_message: BLANK` in the
  REST API). With GitHub's default, a pull request of one commit is squashed under that commit's own
  title.
- **Settings**, **Rules**, **Rulesets**: the ruleset `main`, made from `.github/rulesets/main.json`.
  It holds the default branch to pull requests, merged by a squash only, and only once
  `pr-title / title` has passed: the check run named `title`, the workflow's job, from GitHub
  Actions. It asks for no approval, as GitHub does not count an author's own, and no one bypasses
  it. Merge commits and rebase merges stay on for the repository, for the pull requests into
  `layerbench-data`, which nothing is released from.

When the file changes, apply it again, with an owner's token (`gh` fills `{owner}` and `{repo}`
from the clone's remote):

```sh
gh api -X PATCH repos/{owner}/{repo} -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=BLANK
id=$(gh api repos/{owner}/{repo}/rulesets --jq '.[] | select(.name == "main") | .id')
if [ -n "$id" ]; then
  gh api -X PUT "repos/{owner}/{repo}/rulesets/$id" --input .github/rulesets/main.json
else
  gh api -X POST repos/{owner}/{repo}/rulesets --input .github/rulesets/main.json
fi
```

Release Please also reads a merge commit, by the title in its body, but it does not read a title with
a `!` there: such a pull request is missed altogether, with no release and no changelog line. And a
merge commit brings the pull request's commits with it, so a change whose commit has a conventional
header of its own is listed twice. A rebase merge puts the title nowhere in the history. History
before the first release is not conventional and is left as it is.

## Updating GitHub Actions pins

Workflow actions are pinned to a full commit SHA so a tag cannot change what a workflow runs. Keep
the release tag beside each pin as a comment (`uses: owner/action@<40-character-sha> # vX.Y.Z`).
Use an exact release tag, not a moving major tag, and update every use of the same action to the same
version and SHA. The `actions/*` actions must each have one version throughout the workflows.

To resolve a release tag, inspect both its direct ref and its peeled ref:

```sh
git ls-remote https://github.com/OWNER/REPOSITORY.git \
  'refs/tags/vX.Y.Z' 'refs/tags/vX.Y.Z^{}'
```

For an annotated tag, use the 40-character commit SHA on the `^{}` line; for a lightweight tag, use
the SHA on the direct tag line. Verify the repository and release tag before updating the pin. Update
all workflow uses, including secret-bearing jobs and `data-branch/.github/workflows/community-index.yml`,
the starting tree copied to the `layerbench-data` branch. Keep that workflow's path filter pointed at
itself so an update runs the community index check. The pin test reads this starting-tree workflow
directly. Run `pnpm --filter @layerbench/core exec vitest run src/convention/workflow-pins.test.ts`
to check the main workflow inventory, pin format, version comments and consistent GitHub-owned action
versions.

## Releases

`.github/workflows/release-please.yml` runs on every push to `main`, but runs Release Please only if
the commit subjects since the latest version tag include a feature, fix, performance gain, revert,
breaking change or release pull request. It checks the full unreleased history, not only the latest
push, so a later housekeeping push can recover a release run replaced while queued. Release Please
keeps one pull request open, titled `chore(main): release X.Y.Z`, that sets the version in the
`package.json` files (the root, and
`packages/core`, `packages/corpora` and `apps/web`, which share it), writes `CHANGELOG.md` from
GitHub-generated release notes, and updates `.release-please-manifest.json`. GitHub groups notes by
merged pull request, so a squash and its older merge commit appear once. The workflow labels merged
pull requests from their Conventional Commit title; [`.github/release.yml`](.github/release.yml)
keeps the visible Features, Bug Fixes, Performance Improvements and Reverts categories and excludes
the types hidden by `changelog-sections`. Release Please runs for a feature, fix, performance gain,
revert, breaking change, or its own release pull request; non-breaking docs, tests and workflow-only
changes do not create releases. Merging the release pull request tags `vX.Y.Z` and publishes a
GitHub release.
For the first public release, the workflow prepends [`docs/releases/0.3.0.md`](docs/releases/0.3.0.md)
to the generated notes; dispatch the workflow to retry that edit if publishing succeeded but the
notes update failed. A manual dispatch only reconciles the existing release notes; it does not run
Release Please or create a release from housekeeping changes. There is one version for the whole
repository, and it is not the app's: the app is deployed on every push to `main`, as before, and does
not read it.

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
