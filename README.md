# LayoutMaster

Keyboard layout analyzer that understands ZMK layers. It **simulates** how a text corpus is actually
typed on a keymap — one-shot and momentary layers, layers armed by macros, adaptive ("magic") keys,
repeat keys, multi-letter macros, combos, sticky shift, caps word — and computes the Keyboard Layouts
Doc metrics (SFB, SFS, scissors, LSB, alternation, rolls, redirects, usage, effort) on the resulting
**physical key stream**. Every rule is data: toggle it, re-parameterize it, remove it, or compose a
new one.

Specification: [SPEC.md](SPEC.md). Metric glossary: [docs/METRICS.md](docs/METRICS.md).

Everything runs in the browser. There is no server and no account, and nothing leaves the page
unless you point it at a repository of your own.

## Views

| Route | What it does |
|---|---|
| `/` | Analyze a layout: heat-mapped keyboard, every metric, and a trace of how any word is typed |
| `/edit` | Edit a layout: drag keys to swap them, edit bindings, layers, combos, behaviors, typing paths |
| `/compare` | Two layouts side by side, with a delta for each metric |
| `/rules` | Enable, re-parameterize or compose rules; save the set |
| `/corpus` | Browse the shipped corpora and build your own from pasted or uploaded text |
| `/library` | Bundled and saved layouts; import from JSON or a classic text layout |

A link carries the whole analysis, so any view can be shared as it stands. `?layout=inline:…` even
carries a layout that was never saved.

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

The `main` branch holds a complete Elixir and Phoenix implementation. It is the behavioral
reference: URL formats, layout and rule-set JSON, storage documents and every metric definition are
reproduced here unchanged. `packages/core/golden/` holds reports dumped from it, and the parity
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
