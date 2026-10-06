# LayoutMaster

> **Using LayoutMaster?** Everything for users is in the [guide](docs/guide/README.md), which is
> also in the app under **Guide**. Saving your work to GitHub is in
> [Saving and sharing](docs/guide/saving.md).
>
> **This README is for working on LayoutMaster's code and deploying it.** The design is in
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
- `functions/`: the Cloudflare Pages Function for signing in with GitHub, a thin wrapper around
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
| `/about/` | The landing page, copied from `docs/site` by the build |

`/` opens the Library. A link
carries the whole analysis, and `?layout=inline:…` carries a layout that was never saved; Analyze
writes unsaved edits into its link that way.

## Storage in the code

`apps/web/src/storage` holds the adapters behind `useStorage()`:

- `IndexedDbAdapter` always holds a copy, written first.
- When someone is signed in, `CompositeStorage` adds a remote copy:
  - `GitHubAdapter`, using the Contents API, on the `layoutmaster-data` branch of their fork, or of
    this repository for its owner.
  - `GistAdapter`, with one secret gist per collection, otherwise.
- `target.ts` decides between the two from the app's installations.

The sign-in state and the in-memory access token are in `apps/web/src/auth/github-session.ts`. The
server half is `apps/web/src/server/github-auth.ts`. SPEC §4.3 has the details.

## Develop

```bash
pnpm install
pnpm check        # format and lint
pnpm typecheck
pnpm test
pnpm dev          # http://localhost:5173
```

To sign in on the dev server, set up the GitHub App first (see
[Setting up sign-in](#setting-up-sign-in)). Then put the same variables as on Pages in
`apps/web/.env.local`, which git ignores. Without them the app says sign-in is not set up and
saves in the browser only.

`pnpm bench` runs the performance suite, which is skipped by default. `pnpm corpora` rebuilds the
corpus samples from `packages/corpora/raw`.

`apps/web/e2e` checks the layout of Analyze, where layouts are edited, in a real browser, at two phone sizes and a desktop
one: nothing wider than the screen, targets a finger can hit, the board in sight while a key is
edited. Playwright's Chromium is downloaded once:

```bash
pnpm --filter @layoutmaster/web exec playwright install chromium
pnpm --filter @layoutmaster/web e2e
```

On a slow network, `PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT=120000` gives the download two minutes
instead of thirty seconds. Playwright's Chromium comes only from `cdn.playwright.dev`, so where that
host is blocked, run the checks on a browser already installed instead: `E2E_CHANNEL=msedge` for
Microsoft Edge, `E2E_CHANNEL=chrome` for Google Chrome, with nothing to download.

## Deploy

`pnpm build` writes `apps/web/dist`: hashed assets, the corpus samples, the landing page at
`about/`, and three files a static host reads — `_redirects` (so `/analyze` resolves to the app
instead of a 404), `_headers` (content security policy and caching) and `404.html` (the same
fallback for hosts that use it instead).

On **Cloudflare Pages**, connect the repository and set:

| Setting | Value |
|---|---|
| Build command | `pnpm build` |
| Build output directory | `apps/web/dist` |
| Root directory | `/` |
| `NODE_VERSION` | `22` |

Leave `VITE_BASE` unset — Pages serves from the root of a domain, which is the default. It only
needs a value on a host that serves the site from a subdirectory, such as a GitHub Pages project
site.

The page talks to its own origin and `api.github.com` and to nothing else — `connect-src` in the
policy above enforces it, so the access token in the page cannot be sent anywhere but GitHub.

### Setting up sign-in

Sign-in needs a GitHub App of your own and one server-side piece:
`functions/api/auth/[[path]].ts`, a Pages Function whose logic is
`apps/web/src/server/github-auth.ts`. It swaps GitHub's sign-in code for tokens, which needs the
app's client secret, and renews them. It stores nothing. On a host without Functions the app still
works, saving in the browser only. Do this once per deployment.

**1. Create the GitHub App.** On GitHub, go to your avatar → **Settings** → **Developer settings**
→ **GitHub Apps** → **New GitHub App**, and fill in:

| Field | Value |
|---|---|
| GitHub App name | any free name; its URL form is the *slug* used below |
| Homepage URL | your app's address, e.g. `https://layoutmaster-2d7.pages.dev` |
| Callback URL | `https://<your app>/api/auth/callback`; add `http://localhost:5173/api/auth/callback` to sign in on the dev server |
| Expire user authorization tokens | on (the default) |
| Request user authorization (OAuth) during installation | off |
| Enable Device Flow | off |
| Setup URL | empty |
| Webhook → Active | off |
| Repository permissions → Contents | **Read and write** |
| Account permissions → Gists | **Read and write** |
| Where can this GitHub App be installed? | **Any account**, so other people can give it their forks |

Create it. On the page that opens, copy the **Client ID**, click **Generate a new client secret** and
copy the secret, and note the slug from the app's public page, `https://github.com/apps/<slug>`.

**2. Make a session key**, which encrypts the sign-in cookie:

```bash
openssl rand -base64 32
```

**3. Add the variables to Cloudflare Pages.** In the Pages project, **Settings** → **Variables and
Secrets**, add these for **Production** and again for **Preview**:

| Variable | Value | Type |
|---|---|---|
| `GITHUB_CLIENT_ID` | the Client ID | Text |
| `GITHUB_CLIENT_SECRET` | the client secret | Secret |
| `GITHUB_APP_SLUG` | the slug | Text |
| `SESSION_SECRET` | the output of step 2 | Secret |
| `UPSTREAM_REPO` | optional: the `owner/name` whose forks hold documents; `rafaelromao/layoutmaster` if unset | Text |

Variables reach only deployments made after they are set, so deploy again (push, or **Retry
deployment**) once they are in.

**4. Keep saves from starting builds.** **Settings** → **Builds** → **Branch control**: exclude
`layoutmaster-data` from preview deployments.

**5. Give the app your own repository.** Open `https://github.com/apps/<slug>/installations/new`,
choose your account, **Only select repositories**, pick this repository (or your fork of it),
and **Install**. Skip this and documents go to gists.

**6. Check it.** In the deployed app, open **Storage**, **Sign in with GitHub**, then **Check
again**. Storage should say it is saving to your repository on `layoutmaster-data`. Save a layout
and the commit appears on that branch, not on main.

**If signing in loops back to a login page** and the app sits behind **Cloudflare Access**: Access's
cookie must not be SameSite=Strict. In Cloudflare Zero Trust, **Access** → **Applications** → your
app → cookie settings, set SameSite to None or Lax. It is None unless someone changed it.

Requests to the Function skip `_redirects` and `_headers`, so it sets its own headers
(`Cache-Control: no-store` among them).

### Landing page

`docs/site` is the landing page: hand-written HTML and CSS with no build step and no JavaScript,
whose own content security policy loads nothing from anywhere else. The app's build copies it to
`/about/`, the dev server serves it there from `docs/site` directly, and the header links to it as
**About**. `apps/web/src/guide/landing.test.ts` holds it to the app: every link lands on a view,
layout, corpus or guide section that exists, and every image is the file and the shape the page
says.

Its screenshots are taken from the running app, in the dark and the light theme, with Edge or
Chrome already installed:

```bash
E2E_CHANNEL=msedge pnpm --filter @layoutmaster/web shots
```

`.github/workflows/pages.yml` publishes `docs/site` to GitHub Pages, and only runs when started by
hand while the project is private. To make it the public page, set Settings → Pages → Source to
**GitHub Actions**, add a repository variable `APP_ORIGIN` with the app's public address (the page's
links into the app are rewritten to it), and give the workflow a `push` trigger on `docs/site/**`.
