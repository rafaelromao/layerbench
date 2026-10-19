# LayerBench

> **Using LayerBench?** Open it at [layerbench.github.io](https://layerbench.github.io); what it is
> and how it compares is on [its page](https://rafaelromao.github.io/layerbench/). Everything for
> users is in the [guide](docs/guide/README.md), which is also in the app under **Guide**. Saving
> your work to GitHub is in [Saving and sharing](docs/guide/saving.md).
>
> **This README is for working on LayerBench's code and deploying it.** Metric definitions and
> their sources are in the [glossary](docs/METRICS.md).

Keyboard layout analyzer that understands ZMK layers. It **simulates** how a text corpus is actually
typed on a keymap — one-shot and momentary layers, layers armed by macros, adaptive keys, repeat
keys, multi-letter macros, combos, sticky shift, caps word — and computes the Keyboard Layouts Doc
metrics (SFB, SFS, scissors, LSB, alternation, rolls, redirects, usage, effort) on the resulting
**physical key stream**. Every rule is data: toggle it, re-parameterize it, remove it, or compose a
new one.

Every layout is shown and sorted by two numbers: **Effort**, cyanophage's measure of how hard the
keys are to reach, with thumb presses charged too, and **SFB**, how often one finger presses two
keys in a row.

Everything runs in the browser, and no account is needed. Nothing leaves the page unless you sign
in with GitHub to keep your work in your own account.

## Structure

- `packages/core`: the engine, meaning geometry, the keymap model, the ZMK-faithful simulator, n-gram
  tables, the rule engine and analysis. Pure TypeScript with one runtime dependency; it runs in a
  worker and in Node.
- `packages/corpora`: builds the corpus samples the app serves.
- `apps/web`: the single-page app. The engine runs in a Web Worker, so a million-symbol analysis
  never blocks the interface.
- `worker/`: the Cloudflare Worker for signing in with GitHub, a thin wrapper around
  `apps/web/src/server/github-auth.ts`.
- `docs/guide`: the user guide, shown in the app under **Guide**. `docs/site`: the landing page.

## Routes

| Route | View |
|---|---|
| `/library` | Bundled and custom layouts, sorted by Effort, SFB or name; imports |
| `/analyze` | Analysis and editing of one layout |
| `/compare` | Two layouts side by side |
| `/rules` | Rule sets: enable, re-parameterize, compose, save |
| `/corpus` | Shipped corpora, and custom ones from pasted or uploaded text |
| `/guide` | The user guide and the metric glossary, from `docs/` |

`/` opens the Library. A link carries the whole analysis. The layout travels in it too, as
`#layout=inline:…`: after the `#`, which the browser keeps to itself, so a long one cannot make the
request too long for GitHub Pages to answer (`apps/web/src/url/fragment.ts`). Analyze writes every
layout it has open into its link that way, a custom one too, with its id inside, so the link can be
sent: opened where that id is saved with the same contents, it is the custom layout again, and
anywhere else a layout of its own, saved as a copy. Links name a custom document as `custom:<id>`;
`saved:` links from before the name changed no longer open.

## Storage in the code

`apps/web/src/storage` holds the adapters behind `useStorage()`:

- `IndexedDbAdapter` always holds a copy, written first.
- When someone is signed in, `CompositeStorage` adds a remote copy: `GistAdapter`, with one secret
  gist per collection in their account.

The sign-in state, the trip to GitHub, the in-memory access token and the sealed session the page
keeps are in `apps/web/src/auth/github-session.ts`. The server half is
`apps/web/src/server/github-auth.ts`.

## Bundled layouts

The layouts the app started with are written as data in `packages/core/src/layouts/` (`classic.ts`,
`small.ts`, `romak.ts`), each copied from where its author published it, and given the default
Numbers, Symbols and Accents layers, plus Extras on a board that needs it. The Standard and Thumb
Alpha ones share their main thumbs and base-layer symbols, so that they compare on their letters
(`withStandardThumbs` in `standard.ts`): the four inner thumbs hold Shift, Numbers, Symbols and
Shift and tap Repeat, space, a thumb letter or nothing, and Accents, and no symbol stays on the base
layer but `'` `,` `.` `;`. The Special ones keep every key they had and reach Accents on one combo
(`withDefaultLayers` in `templates.ts`). A new one joins them as a
document: a custom layout, unchanged, added by pull request. Merging the pull request is
the approval, and the deploy that follows puts it in everyone's Library. A layout can also join
with no deploy, as a community layout, by **Submit** in the app ([below](#community-layouts)).

1. In the app, give the layout its name, its author, and in Settings, if it has one, its link to
   where it comes from: the author's firmware, keymap or page. Save it, and copy its LayerBench JSON from the
   editor's **JSON** panel. Signed in, it is also in your "LayerBench: saved layouts" gist.
2. On a branch made from main, add it as `packages/core/src/layouts/documents/<id>.json`, named by
   its `"id"`, as copied.
3. In `packages/core/src/layouts/documents.ts`, import the file and add it to `DOCUMENTS` under its
   id.
4. Name it on the landing page, in the list under the layouts heading in `docs/site/index.html`,
   and update the count in that heading.
5. `pnpm test` checks that it is exactly what LayerBench saves, is named by its id, names an author
   (a link is optional, and an http(s) URL when given), has a name and an id no other layout has, types the whole alphabet and a
   space, and is on the landing page.
6. Open the pull request. The `layouts` workflow runs those checks in a few minutes, sooner than the
   whole of CI, and writes a summary on its run's page for the review: each new or changed layout
   with its source, a link that opens it in the app as it would be bundled, and its Effort and SFB
   on the texts of its languages, placed among the bundled layouts as the Library ranks them.

## Community layouts

Community layouts are layouts other people made, accepted into the Library without a deploy. They
live on the `layerbench-data` branch, kept apart from main:

- `community/<id>.json`: one layout, exactly as LayerBench saves it, named by its id, with an author
  and, optionally, a `link` to its source: what `documentLayout` in
  `packages/core/src/layouts/documents.ts` checks a bundled document for.
- `community/index.json`: `{ "layouts": [<id>, …] }`, which
  `.github/workflows/community-index.yml` on that branch writes on every push that changes
  `community/`. It reads only the
  files' names, never their contents, and lists only names that are document ids.

A pull request into `layerbench-data` that adds one file proposes a layout; merging it is the
maintainer's acceptance. **Submit**, beside Save in Analyze, opens one for a signed-in user's custom
layout (`apps/web/src/server/submit.ts`, through the sign-in Worker): the page checks the layout as
the Library would, has an id no bundled or community layout has, and is saved; the Worker checks it
again, and, as the GitHub App, creates the branch `submit/<login>/<id>` from `layerbench-data`,
commits `community/<id>.json` to it and opens the pull request, naming the submitter. While that
pull request is open, submitting the layout again commits the new version to it. A layout is at
most 64 KB, and an id the branch already holds is refused.

The app (`apps/web/src/community/community.ts`) reads the index and each
file from `raw.githubusercontent.com` each time the Library opens, with no sign-in: plain files, as
unauthenticated calls to the GitHub API are limited to 60 an hour for each address. GitHub's file
server caches a file for a few minutes, so a layout merged appears within about five. Each file is
checked with `documentLayout` and compiled, and skipped if either fails, and what was read is kept in the browser, so
the Library lists the last ones at once while it reads them again. They are ranked in the category
their keys give them, flagged *community*, and named in links as `community:<id>`; saving one makes
a copy.

`data-branch/` on main is the branch's starting tree: the workflow, an empty index and a README.
To give the branch that tree, as a new commit on top of what it holds, so nothing in its history is
lost and the push is not forced:

```bash
git fetch origin layerbench-data
git push origin "$(git commit-tree "$(git rev-parse HEAD:data-branch)" -p origin/layerbench-data -m 'Community: start the community layouts')":refs/heads/layerbench-data
```

Run it from a checkout of main with this change merged. A change to `data-branch/` later is put on
the branch by a pull request into it.

## Bundled corpora

The texts that come with the app are built from `packages/corpora/raw/`: each raw text with its
entry in `sources.json`, which says what it is, its language, its licence and where it comes from.
`pnpm corpora` takes each one's sentences, a line each, in an order that looks random but never
changes, normalizes them, keeps whole sentences up to a megabyte, and writes what the app serves to
`apps/web/public/corpora/`. A new or updated text joins them by pull request, and merging it is the
approval.

1. Put the raw text in `packages/corpora/raw/`, as UTF-8 plain text of at most 10 MB: the same kind
   of text you would paste or upload in **Corpus**. Its language needs a profile in
   `packages/core/src/lang/profiles.ts`; [packages/corpora/README.md](packages/corpora/README.md#adding-a-language)
   says how to add one.
2. Add its entry to `raw/sources.json`, under an id of lower-case words and hyphens: `file`, `name`,
   `language`, `description`, `source` with a link, and `license`, starting `CC0`, `CC BY 4.0`,
   `CC BY-SA 4.0` (with its version) or `Public domain`, since the text is published with the app.
   A source not yet credited goes in the credits at the foot of the landing page.
3. `pnpm corpora <id>` builds it. Commit `apps/web/public/corpora/<id>/` and `index.json` with it.
4. Open the pull request. `pnpm test` checks the entry, and that what the app serves matches it. The
   `corpora` workflow also builds every text again, which must change nothing, and writes a summary
   on its run's page for the review: what the text is, its licence and source, its most frequent
   letters and any letters outside its language, and how the bundled layouts fare on it.

## Develop

```bash
pnpm install
pnpm check        # format and lint
pnpm typecheck
pnpm test
pnpm test:coverage  # the tests again, with the coverage gate below
pnpm dev          # http://localhost:4011
```

### Checks

CI runs `pnpm check`, `pnpm typecheck`, `pnpm test:coverage` and `pnpm build`. `test:coverage` runs
each package's tests under Vitest's v8 coverage and fails when a package covers less than 80% of its
lines, statements, functions or branches. The gate is per package (`packages/core` and `apps/web`),
set in each `vitest.config.ts`, and the thresholds are not lowered to make a change pass: add tests
instead. `src/main.tsx`, the analysis worker's entry, `src/test`, `e2e`, `shots`, type declarations,
test files and config files do not count. The table of each file's coverage is printed by
`pnpm --filter @layerbench/core test:coverage` (or `@layerbench/web`), and `coverage/` is git
ignored.

To sign in on the dev server, set up the GitHub App first (see
[Setting up sign-in](#setting-up-sign-in)). Then put `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
and `SESSION_SECRET` in `apps/web/.env.local`, which git ignores, with a client
secret and a session key of their own rather than the Worker's. `GITHUB_APP_ID` and
`GITHUB_APP_PRIVATE_KEY` there turn on Submit, which opens real pull requests on GitHub. The dev
server answers sign-in
itself, on its own origin. Without them the app says sign-in is not set up and saves in the browser
only.

`pnpm bench` runs the performance suite, which is skipped by default. `pnpm corpora` rebuilds the
corpus samples from `packages/corpora/raw`.

`apps/web/e2e` checks, in a real browser at two phone sizes and a desktop one, the layout of
Analyze, where layouts are edited (nothing wider than the screen, targets a finger can hit, the
board in sight while a key is edited), the Library and the storage dialog on a phone, and that a
link to an unsaved layout opens from after the `#`. No workflow runs it. Playwright's Chromium is
downloaded once:

```bash
pnpm --filter @layerbench/web exec playwright install chromium
pnpm --filter @layerbench/web e2e
```

On a slow network, `PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT=120000` gives the download two minutes
instead of thirty seconds. Playwright's Chromium comes only from `cdn.playwright.dev`, so where that
host is blocked, run the checks on a browser already installed instead: `E2E_CHANNEL=msedge` for
Microsoft Edge, `E2E_CHANNEL=chrome` for Google Chrome, with nothing to download.

## Deploy

The app is a static site on GitHub Pages, at `https://layerbench.github.io`, published from the
repository `layerbench/layerbench.github.io`. Signing in with GitHub is the one part that needs a
server: the Cloudflare Worker in `worker/`, on a domain of its own.

`pnpm build` writes `apps/web/dist`: hashed assets, the corpus samples, and `404.html`, a copy of the
app that GitHub Pages answers a deep link such as `/analyze` with, so the link opens its view. The
status says 404, which browsers do not mind. Leave `VITE_BASE` unset: the app is served from the
root of its domain. It only needs a value for a copy served from a subdirectory, such as a fork's
GitHub Pages project site.

GitHub Pages sends no headers a site can choose. The content security policy travels as a meta tag
written by `vite.config.ts`, a check at the top of `main.tsx` stands in for `frame-ancestors`, and a
meta tag sets the referrer policy; `Cross-Origin-Opener-Policy` and `X-Content-Type-Options` have no
stand-in. The policy's `connect-src` lets the page talk to its own origin, `api.github.com` and the
sign-in Worker, so the token and the session in the page cannot be sent anywhere but there, and to
the branch's `community/` folder on `raw.githubusercontent.com`, which the community layouts are
read from.

### Publishing the app

`.github/workflows/ci.yml` builds every push to main and, once the checks pass, pushes the build to
`layerbench/layerbench.github.io`, whose Pages site serves its `main` branch. Pages publishes only
the repository a workflow runs in, hence the push. Each deploy keeps the bundles of the one before:
Pages lets a browser keep a page for ten minutes, and a page asks for the bundles it was built with.
Set up once:

1. Create `layerbench/layerbench.github.io`, public, with a README so that it has a `main` branch.
   In its **Settings** → **Pages**, choose **Deploy from a branch**, `main`, `/ (root)`.
2. Make a deploy key:

   ```bash
   ssh-keygen -t ed25519 -N "" -C "layerbench app deploy" -f lb-deploy
   ```

   Give `layerbench.github.io` the public half, `lb-deploy.pub`, under **Settings** → **Deploy
   keys**, with **Allow write access**.
3. In this repository, **Settings** → **Environments**, create `app`, limited to the `main` branch,
   and give it the private half, `lb-deploy`, as the secret `APP_DEPLOY_KEY`. Delete both files.
4. Add the repository variable `AUTH_ORIGIN`, the sign-in Worker's address (below). A push to main
   fails without it rather than publishing an app that cannot sign in.

No other repository in the `layerbench` organization may have a Pages site. It would be served on
the app's origin, where it could read what the app keeps in the browser, the sign-in session
included.

### Setting up sign-in

Sign-in needs a GitHub App of your own and the Worker in `worker/`, whose logic is
`apps/web/src/server/github-auth.ts`. It swaps GitHub's sign-in code for tokens, which needs the
app's client secret, and renews them. It also opens Submit's pull requests, as the GitHub App. It
stores nothing: the page keeps the session, sealed with a key only the Worker has, and a submission
goes straight to GitHub. Without the Worker the app still works, saving in the browser only, and
without Submit. Do this once per deployment.

**1. Create the GitHub App.** On GitHub, go to the owner's **Settings** → **Developer settings** →
**GitHub Apps** → **New GitHub App**, and fill in:

| Field | Value |
|---|---|
| GitHub App name | any free name |
| Homepage URL | the app's address, `https://layerbench.github.io/` |
| Callback URL | the app's address, with its trailing slash; add `http://localhost:4011/` to sign in on the dev server |
| Expire user authorization tokens | on (the default) |
| Request user authorization (OAuth) during installation | off |
| Enable Device Flow | off |
| Setup URL | empty |
| Webhook → Active | off |
| Repository permissions → Contents | **Read and write**, for Submit's branch and commit on `rafaelromao/layerbench`; the App is installed there alone |
| Repository permissions → Pull requests | **Read and write**, for Submit's pull request into `layerbench-data` |
| Account permissions → Gists | **Read and write**, where signed-in users' documents are kept |
| Where can this GitHub App be installed? | **Any account**, so anyone can sign in and keep their documents in gists |

Create it. On the page that opens, copy the **Client ID**, and the **App ID** above it. Click
**Generate a new client secret** twice: one for the Worker and one for the dev server, so either can
be revoked alone. Further down, under **Private keys**, click **Generate a private key**: a `.pem`
file downloads, which Submit signs in as the App with.

Then **Install App** → `rafaelromao` → **Only select repositories** → `layerbench`, so Submit can
open pull requests there. An App already installed whose permissions change asks the owner to
accept them: GitHub → **Settings** → **Applications** → **Installed GitHub Apps** → the App →
**Review request**.

**2. Make a session key** for the Worker, the key it seals sessions with, and another for the dev
server:

```bash
openssl rand -base64 32
```

**3. Deploy the Worker.** Put the Client ID in `worker/wrangler.jsonc`; it is public.
Check that `ALLOWED_ORIGINS` there names the app's address. Then, with a Cloudflare account:

```bash
pnpm dlx wrangler@4 login
pnpm dlx wrangler@4 deploy -c worker/wrangler.jsonc
pnpm dlx wrangler@4 secret put GITHUB_CLIENT_SECRET -c worker/wrangler.jsonc
pnpm dlx wrangler@4 secret put SESSION_SECRET -c worker/wrangler.jsonc
pnpm dlx wrangler@4 secret put GITHUB_APP_ID -c worker/wrangler.jsonc
pnpm dlx wrangler@4 secret put GITHUB_APP_PRIVATE_KEY -c worker/wrangler.jsonc < path/to/the-app.private-key.pem
```

`GITHUB_APP_ID` is the App ID, and `GITHUB_APP_PRIVATE_KEY` the private key file, as downloaded.
Without them sign-in works, and Submit says it is not set up.

The deploy prints the Worker's address, `https://layerbench-auth.<your subdomain>.workers.dev`. Set
it as the repository variable `AUTH_ORIGIN`, then push, or re-run CI, so the app is built with it.

**4. Check it.** In the deployed app, open **Storage** and **Sign in with GitHub**. Storage should
say it is saving to secret gists in your account. Save a layout and a "LayerBench: saved layouts"
gist appears there. Then open a custom layout with an author and a linked description in Analyze
and **Submit** it: a pull request into `layerbench-data` opens. Close it if it was only a check.

**To sign everyone out**, give the Worker a new `SESSION_SECRET`: every session sealed with the old
one fails at its next renewal or page load. Revoking the GitHub App's client secret stops renewals
instead, so sessions end as their access tokens expire, within about 8 hours; tokens already issued
stay valid until then.

The Worker answers only the origins in `ALLOWED_ORIGINS`, and its own, and sets its own headers
(`Cache-Control: no-store` among them).

**GitHub-side clean-up.** Documents were once saved to forks as well as gists. Nothing reads what
only that used, so a deployment set up before can drop it:

- People who installed the App on their forks can uninstall it there: GitHub → **Settings** →
  **Applications** → **Installed GitHub Apps**.
- Remove `GITHUB_APP_SLUG` from `worker/wrangler.jsonc` and `apps/web/.env.local`, and
  `UPSTREAM_REPO` wherever it was set (a Worker variable, `.env.local`); redeploy the Worker.
- Sign-in and gists keep the App's Client ID, its client secrets, the Worker's `SESSION_SECRET` and
  `ALLOWED_ORIGINS`, its callback URLs, its **Gists** permission, and **Any account**.
- The App stays installed on `rafaelromao/layerbench`, with **Contents** and **Pull requests**
  read and write, for Submit.
- The `layerbench-data` branch stays: it holds the community layouts (below).

### Landing page

`docs/site` is the landing page: hand-written HTML and CSS with no build step and no JavaScript,
whose own content security policy loads nothing from anywhere else.
`.github/workflows/pages.yml` publishes it at `https://rafaelromao.github.io/layerbench/` whenever a
push changes it, and the header's **About** links there. The dev server serves it at `/about/`,
where its links into the app work too. `apps/web/src/guide/landing.test.ts` holds it to the app:
every link lands on a view, layout, corpus or guide section that exists, and every image is the
file and the shape the page says.

Its screenshots are taken from the running app, in the dark and the light theme, on Playwright's
Chromium, or on Edge or Chrome with `E2E_CHANNEL`:

```bash
E2E_CHANNEL=msedge pnpm --filter @layerbench/web shots
```

The workflow needs this repository's **Settings** → **Pages** → **Source** set to **GitHub
Actions**, and the repository variable `APP_ORIGIN`, the app's address
(`https://layerbench.github.io`). The page links to the app's views by path; the workflow rewrites
those links to name it.

## Licence

The code is under the [MIT licence](LICENSE). The corpus texts, in `packages/corpora/raw` and in
the samples built from them in `apps/web/public/corpora`, keep their own licences, recorded with
their sources in `packages/corpora/raw/sources.json`.
