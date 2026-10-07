# LayerBench

> **Using LayerBench?** Open it at [layerbench.github.io](https://layerbench.github.io); what it is
> and how it compares is on [its page](https://rafaelromao.github.io/layerbench/). Everything for
> users is in the [guide](docs/guide/README.md), which is also in the app under **Guide**. Saving
> your work to GitHub is in [Saving and sharing](docs/guide/saving.md).
>
> **This README is for working on LayerBench's code and deploying it.** The design is in
> [SPEC.md](SPEC.md), and metric definitions and their sources are in the
> [glossary](docs/METRICS.md).

Keyboard layout analyzer that understands ZMK layers. It **simulates** how a text corpus is actually
typed on a keymap — one-shot and momentary layers, layers armed by macros, adaptive ("magic") keys,
repeat keys, multi-letter macros, combos, sticky shift, caps word — and computes the Keyboard Layouts
Doc metrics (SFB, SFS, scissors, LSB, alternation, rolls, redirects, usage, effort) on the resulting
**physical key stream**. Every rule is data: toggle it, re-parameterize it, remove it, or compose a
new one.

Every layout is shown and sorted by two numbers: **Effort**, cyanophage's measure of how hard the
keys are to reach, and **SFB**, how often one finger presses two keys in a row.

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
| `/library` | Bundled and saved layouts, sorted by Effort, SFB or name; imports |
| `/analyze` | Analysis and editing of one layout |
| `/compare` | Two layouts side by side |
| `/rules` | Rule sets: enable, re-parameterize, compose, save |
| `/corpus` | Shipped corpora, and custom ones from pasted or uploaded text |
| `/guide` | The user guide and the metric glossary, from `docs/` |

`/` opens the Library. A link carries the whole analysis. A layout that was never saved travels in
it too, as `#layout=inline:…`: after the `#`, which the browser keeps to itself, so a long one
cannot make the request too long for GitHub Pages to answer (`apps/web/src/url/fragment.ts`).
Analyze writes unsaved edits into its link that way.

## Storage in the code

`apps/web/src/storage` holds the adapters behind `useStorage()`:

- `IndexedDbAdapter` always holds a copy, written first.
- When someone is signed in, `CompositeStorage` adds a remote copy:
  - `GitHubAdapter`, using the Contents API, on the `layerbench-data` branch of their fork, or of
    this repository for its owner.
  - `GistAdapter`, with one secret gist per collection, otherwise.
- `target.ts` decides between the two from the app's installations.

The sign-in state, the trip to GitHub, the in-memory access token and the sealed session the page
keeps are in `apps/web/src/auth/github-session.ts`. The server half is
`apps/web/src/server/github-auth.ts`. SPEC §4.3 has the details.

## Bundled layouts

The layouts the app started with are written as data in `packages/core/src/layouts/` (`classic.ts`,
`small.ts`, `romak.ts`), each copied from where its author published it. A new one joins them as a
document: a layout saved in LayerBench, unchanged, added by pull request. Merging the pull request is
the approval, and the deploy that follows puts it in everyone's Library.

1. In the app, give the layout its name, its author, and a description that links to where it comes
   from: the author's firmware, keymap or page. Save it, and copy its LayerBench JSON from the
   editor's **JSON** panel. A layout you saved while signed in is also on your data branch, as
   `data/layouts/<id>.json`.
2. Add it, as copied, as `packages/core/src/layouts/documents/<id>.json`, named by its `"id"`.
3. In `packages/core/src/layouts/documents.ts`, import the file and add it to `DOCUMENTS` under its
   id.
4. Name it on the landing page, in the list under the layouts heading in `docs/site/index.html`,
   and update the count in that heading.
5. `pnpm test` checks that it is exactly what LayerBench saves, is named by its id, names an author
   and links its source, has a name and an id no other layout has, types the whole alphabet and a
   space, and is on the landing page.
6. Open the pull request.

## Develop

```bash
pnpm install
pnpm check        # format and lint
pnpm typecheck
pnpm test
pnpm dev          # http://localhost:4011
```

To sign in on the dev server, set up the GitHub App first (see
[Setting up sign-in](#setting-up-sign-in)). Then put `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`,
`GITHUB_APP_SLUG` and `SESSION_SECRET` in `apps/web/.env.local`, which git ignores, with a client
secret and a session key of their own rather than the Worker's. The dev server answers sign-in
itself, on its own origin. Without them the app says sign-in is not set up and saves in the browser
only.

`pnpm bench` runs the performance suite, which is skipped by default. `pnpm corpora` rebuilds the
corpus samples from `packages/corpora/raw`.

`apps/web/e2e` checks the layout of Analyze, where layouts are edited, in a real browser, at two phone sizes and a desktop
one: nothing wider than the screen, targets a finger can hit, the board in sight while a key is
edited. Playwright's Chromium is downloaded once:

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
sign-in Worker, and to nothing else, so the token and the session in the page cannot be sent
anywhere but there.

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
app's client secret, and renews them. It stores nothing: the page keeps the session, sealed with a
key only the Worker has. Without the Worker the app still works, saving in the browser only. Do this
once per deployment.

**1. Create the GitHub App.** On GitHub, go to the owner's **Settings** → **Developer settings** →
**GitHub Apps** → **New GitHub App**, and fill in:

| Field | Value |
|---|---|
| GitHub App name | any free name; its URL form is the *slug* used below |
| Homepage URL | the app's address, `https://layerbench.github.io/` |
| Callback URL | the app's address, with its trailing slash; add `http://localhost:4011/` to sign in on the dev server |
| Expire user authorization tokens | on (the default) |
| Request user authorization (OAuth) during installation | off |
| Enable Device Flow | off |
| Setup URL | empty |
| Webhook → Active | off |
| Repository permissions → Contents | **Read and write** |
| Account permissions → Gists | **Read and write** |
| Where can this GitHub App be installed? | **Any account**, so other people can give it their forks |

Create it. On the page that opens, copy the **Client ID**, and note the slug from the app's public
page, `https://github.com/apps/<slug>`. Click **Generate a new client secret** twice: one for the
Worker and one for the dev server, so either can be revoked alone.

**2. Make a session key** for the Worker, the key it seals sessions with, and another for the dev
server:

```bash
openssl rand -base64 32
```

**3. Deploy the Worker.** Put the Client ID and the slug in `worker/wrangler.jsonc`; they are public.
Check that `ALLOWED_ORIGINS` there names the app's address. Then, with a Cloudflare account:

```bash
pnpm dlx wrangler@4 login
pnpm dlx wrangler@4 deploy -c worker/wrangler.jsonc
pnpm dlx wrangler@4 secret put GITHUB_CLIENT_SECRET -c worker/wrangler.jsonc
pnpm dlx wrangler@4 secret put SESSION_SECRET -c worker/wrangler.jsonc
```

The deploy prints the Worker's address, `https://layerbench-auth.<your subdomain>.workers.dev`. Set
it as the repository variable `AUTH_ORIGIN`, then push, or re-run CI, so the app is built with it.
Documents are saved to forks of `rafaelromao/layerbench`; a Worker variable `UPSTREAM_REPO` names
another `owner/name`.

**4. Give the app your own repository.** Open `https://github.com/apps/<slug>/installations/new`,
choose your account, **Only select repositories**, pick this repository (or your fork of it),
and **Install**. Skip this and documents go to gists.

**5. Check it.** In the deployed app, open **Storage**, **Sign in with GitHub**, then **Check
again**. Storage should say it is saving to your repository on `layerbench-data`. Save a layout
and the commit appears on that branch, not on main.

**To sign everyone out**, give the Worker a new `SESSION_SECRET`: every session sealed with the old
one stops working. Revoking the GitHub App's client secret does it too.

The Worker answers only the origins in `ALLOWED_ORIGINS`, and its own, and sets its own headers
(`Cache-Control: no-store` among them).

### Landing page

`docs/site` is the landing page: hand-written HTML and CSS with no build step and no JavaScript,
whose own content security policy loads nothing from anywhere else.
`.github/workflows/pages.yml` publishes it at `https://rafaelromao.github.io/layerbench/` whenever a
push changes it, and the header's **About** links there. The dev server serves it at `/about/`,
where its links into the app work too. `apps/web/src/guide/landing.test.ts` holds it to the app:
every link lands on a view, layout, corpus or guide section that exists, and every image is the
file and the shape the page says.

Its screenshots are taken from the running app, in the dark and the light theme, with Edge or
Chrome already installed:

```bash
E2E_CHANNEL=msedge pnpm --filter @layerbench/web shots
```

The workflow needs this repository's **Settings** → **Pages** → **Source** set to **GitHub
Actions**, and the repository variable `APP_ORIGIN`, the app's address
(`https://layerbench.github.io`). The page links to the app's views by path; the workflow rewrites
those links to name it.

## Licence

The code is under the [MIT licence](LICENSE). The corpus texts, in `packages/corpora/raw` and in
the samples built from them in `apps/web/public/corpora`, keep their own licences, CC BY 4.0 and
CC BY-SA 4.0, recorded with their sources in `packages/corpora/raw/sources.json`.
