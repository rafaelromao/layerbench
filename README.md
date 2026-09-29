# LayoutMaster

Keyboard layout analyzer that understands ZMK layers. It **simulates** how a text corpus is actually
typed on a keymap — one-shot and momentary layers, layers armed by macros, adaptive ("magic") keys,
repeat keys, multi-letter macros, combos, sticky shift, caps word — and computes the Keyboard Layouts
Doc metrics (SFB, SFS, scissors, LSB, alternation, rolls, redirects, usage, effort) on the resulting
**physical key stream**. Every rule is data: toggle it, re-parameterize it, remove it, or compose a
new one.

Every layout is shown and sorted by two numbers: **Effort**, cyanophage's measure of how hard the
keys are to reach, and **SFB**, how often one finger presses two keys in a row.

Everything runs in the browser. There is no server and no account, and nothing leaves the page
unless you point it at a repository of your own.

**Using it:** the [guide](docs/guide/README.md), also in the app under **Guide**, starts with four
steps and opens further as you need it. Metric definitions and their sources are in the
[glossary](docs/METRICS.md); the design is in [SPEC.md](SPEC.md).

## Views

| Route | What it does |
|---|---|
| `/` | Analyze a layout: heat-mapped keyboard, every metric, and a trace of how any word is typed |
| `/edit` | Edit a layout on the board: select a key and choose what it does, or type it in ZMK's syntax; drag to swap; rename, reorder and duplicate layers |
| `/compare` | Two layouts side by side, with a delta for each metric |
| `/rules` | Enable, re-parameterize or compose rules, each with its sources; save the set |
| `/corpus` | Browse the shipped corpora and build your own from pasted or uploaded text |
| `/library` | Bundled and saved layouts, sorted by Effort or SFB; import from keymap-drawer YAML, JSON or a text layout |
| `/guide` | The user guide and the metric glossary |

A link carries the whole analysis, so any view can be shared as it stands. `?layout=inline:…` even
carries a layout that was never saved.

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

Layouts, rule sets and corpora are saved in your browser. To keep them somewhere durable, open
**Storage** in the header and point the app at a repository you own: give it a fine-grained personal
access token scoped to that one repository, with read and write access to its contents. Documents
are written as JSON through the GitHub Contents API, one file per document plus an index per
collection.

The token is stored in this browser only, sent to `api.github.com` and nowhere else, and never
appears in a link, an export or an error message. The browser copy is always written first, so
nothing is lost to a network problem.

## Relationship to the Elixir implementation

This application replaced a complete Elixir and Phoenix implementation, which remains in the
repository's history at `07b81b9` (`git show 07b81b9:mix.exs`, or `git checkout 07b81b9`). It is
the behavioral reference: URL formats, layout and rule-set JSON, storage documents and every metric
definition are reproduced here unchanged. `packages/core/golden/` holds reports dumped from it, and the parity
suite asserts this engine matches them to 1e-6. Three deliberate differences are recorded in
`packages/core/golden/DEVIATIONS.md`.

## Develop

```bash
pnpm install
pnpm check        # format and lint
pnpm typecheck
pnpm test
pnpm dev          # http://localhost:5173
```

`pnpm bench` runs the performance suite, which is skipped by default. `pnpm corpora` rebuilds the
corpus samples from `packages/corpora/raw`.

`apps/web/e2e` checks the Edit view's layout in a real browser, at two phone sizes and a desktop
one: nothing wider than the screen, targets a finger can hit, the board in sight while a key is
edited. Playwright's Chromium is downloaded once:

```bash
pnpm --filter @layoutmaster/web exec playwright install chromium
pnpm --filter @layoutmaster/web e2e
```

On a slow network, `PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT=120000` gives the download two minutes
instead of thirty seconds. Where the download is blocked altogether, `E2E_CHANNEL=chrome` runs the
checks on the Google Chrome already installed, with nothing to download.

## Deploy

`pnpm build` writes `apps/web/dist`: hashed assets, the corpus samples, and three files a static
host reads — `_redirects` (so `/edit` resolves to the app instead of a 404), `_headers` (content
security policy and caching) and `404.html` (the same fallback for hosts that use it instead).

On **Cloudflare Pages**, connect the repository and set:

| Setting | Value |
|---|---|
| Build command | `pnpm build` |
| Build output directory | `apps/web/dist` |
| Root directory | `/` |
| `NODE_VERSION` | `22` |

Leave `VITE_BASE` unset — Pages serves from the root of a domain, which is the default. It only
needs a value on a host that serves the site from a subdirectory; the `deploy` workflow sets it for
GitHub Pages.

**Do not point the app's storage at the branch Pages builds from.** Every save is a commit, and
each commit would trigger a rebuild and redeploy. Use a separate data repository, or exclude the
data directory in the project's build watch paths. If that repository is public, so is everything
saved to it.

The page talks to `api.github.com` and to nothing else — `connect-src` in the policy above enforces
it, so a token in this browser cannot be sent anywhere but GitHub. After deploying, **Storage → Test
connection** confirms the token, the repository and the browser's cross-origin access in one click.
