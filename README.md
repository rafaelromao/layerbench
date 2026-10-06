# LayoutMaster

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

**Using it:** the [guide](docs/guide/README.md), also in the app under **Guide**, starts with four
steps and opens further as you need it. Metric definitions and their sources are in the
[glossary](docs/METRICS.md); the design is in [SPEC.md](SPEC.md).

## Views

| Route | What it does |
|---|---|
| `/library` | Where the site opens. Bundled and saved layouts in one list, sorted by Effort, SFB or name; import from keymap-drawer YAML, JSON or a text layout |
| `/analyze` | Analyze and edit a layout: heat-mapped keyboard, every metric following each edit, a trace of how any word is typed, the characters it cannot type; select a key to see its own numbers and change what it does, or type it in ZMK's syntax; drag to swap; rename, reorder and duplicate layers; save it |
| `/compare` | Two layouts side by side, with a delta for each metric, both typed with or without the same special features |
| `/rules` | Enable, re-parameterize or compose rules, each with its sources; save the set |
| `/corpus` | Browse the shipped corpora and build your own from pasted or uploaded text |
| `/guide` | The user guide and the metric glossary |
| `/about/` | The landing page: what LayoutMaster simulates, why its numbers can be trusted, and how it compares with other analyzers. A static page from `docs/site`, linked as **About** in the header |

`/` opens the Library. A link to an analysis from before Analyze had its own path, `/?layout=…`,
still opens that analysis, and a link to `/edit`, from before editing moved into Analyze, opens it
there.

A link carries the whole analysis, so any view can be shared as it stands. `?layout=inline:…` even
carries a layout that was never saved, and Analyze writes unsaved edits into its link that way.

The editor works the same with a mouse, a keyboard or a finger: [Editing a
layout](docs/guide/editing.md) covers every gesture and shortcut, [Special keys](docs/guide/special-keys.md)
the tap-holds, one-shots, magic and repeat keys, and [Importing and exporting](docs/guide/importing.md)
the keymap-drawer round trip.

## Structure

- `packages/core` — the engine: geometry, keymap model, ZMK-faithful simulator, n-gram tables, the
  rule engine and analysis. Pure TypeScript with one runtime dependency; runs in a worker and in Node.
- `packages/corpora` — builds the corpus samples the app serves.
- `apps/web` — the single-page app. The engine runs in a Web Worker, so a million-symbol analysis
  never blocks the interface.

## Storage

Layouts, rule sets and corpora are always saved in your browser. To have them on every browser you
use, sign in with GitHub and they are kept in your GitHub account as well.

**To save in gists** (the default):

1. Open **Storage** in the header and click **Sign in with GitHub**.
2. Approve the app on GitHub. You come back to the page you were on, unsaved edits included.

From then on every save also goes to secret gists in your account, one each for layouts, rule sets
and corpora. Secret gists are unlisted, not private: anyone with a gist's address can read it.

**To save in your fork of layoutmaster instead:**

1. Fork layoutmaster on GitHub, if you have not already. The repository's owner skips this: their
   documents go to the repository itself.
2. Sign in as above.
3. In **Storage**, follow **Give LayoutMaster access to it**. On GitHub, choose your account, then
   **Only select repositories**, pick your fork, and **Install**.
4. Back in the app, open **Storage** and click **Check again**. It now says it is saving to your
   fork, on the branch `layoutmaster-data`.

Saves are commits to `layoutmaster-data`, under `data/`. The branch is made from your default
branch the first time, so whatever was in `data/` there comes along, and your main branch never
gets a save commit, so syncing the fork with the original never conflicts. If the fork is public,
so is everything saved to it.

**Good to know**

- Documents saved before you switched (in this browser, or in gists) are not moved for you. Click
  **Copy this browser's documents up** to send what this browser holds to wherever Storage now
  saves.
- **Sign out** leaves everything in this browser where it is.
- The browser copy is always written first, so a network problem never loses work.
- The page holds only a short-lived GitHub token, in memory, and sends it to `api.github.com` and
  nowhere else. It never appears in a link, an export or an error message.

## Relationship to the Elixir implementation

This application replaced a complete Elixir and Phoenix implementation, which remains in the
repository's history at `07b81b9` (`git show 07b81b9:mix.exs`, or `git checkout 07b81b9`). URL
formats, layout and rule-set JSON and storage documents are reproduced here unchanged, so links and
data repositories work with both. `packages/core/golden/` began as reports dumped from it, which this
engine matched to 1e-6; they are now regenerated from this engine and pin every number it produces,
and `packages/core/golden/GOLDENS.md` records each deliberate change to them and why.

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
