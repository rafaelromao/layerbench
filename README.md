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
| `/edit` | Edit a layout in place: type ZMK on a key, drag keys to swap, copy or send to another layer; layers, combos, behaviors, typing paths |
| `/compare` | Two layouts side by side, with a delta for each metric |
| `/rules` | Enable, re-parameterize or compose rules; save the set |
| `/corpus` | Browse the shipped corpora and build your own from pasted or uploaded text |
| `/library` | Bundled and saved layouts; import from JSON or a classic text layout |

A link carries the whole analysis, so any view can be shared as it stands. `?layout=inline:…` even
carries a layout that was never saved.

## Editing a key

Select a key and type on it. The text is ZMK's, with the kinds this model has and ZMK does not
following the same shape:

| Type | Result |
|---|---|
| `ç` · `ão` | that symbol |
| `&kp A` · `&kp N1` · `&kp LS(COMMA)` | a key press, by keycode |
| `&lt num a` · `&mo sym` · `&sl ccedil` · `&to base` · `&tog num` | layer taps and switches |
| `&sk LSHIFT` · `&kp LSHIFT` | a sticky modifier, and a plain one |
| `&macro ão` · `&macro ão then alpha2` | a macro, optionally arming a layer |
| `&trans` · `&none` · `&key_repeat` · `&caps_word` | the rest |
| `&magic` | one of the layout's own behaviors |

A layer is named by its id, its name, or the index ZMK would use. A trailing `tag:name` records the
tag adaptive branches match on. Under the default `symbols` host locale a keycode is resolved to the
symbol it types, so `&kp N1` becomes `1`, shifted `!`.

### Keys and gestures

| | |
|---|---|
| any character | opens the editor on the focused key and starts its binding with that character |
| `Enter` · `F2` | opens the editor on the whole binding; `Enter` again commits it |
| `Escape` | abandons the edit |
| `Delete` · `Backspace` | clears the key |
| arrow keys | move between keys — the board is one tab stop, not thirty-four |
| `Space` | selects the key, which is what the **Key** panel follows |
| tap (touch) | opens the editor, since there is no keystroke to open it with |
| `Alt`+`S` | arms a swap; then click or `Enter` on its partner |
| `Ctrl`/`Cmd`+`Z` | undoes, `Shift` as well redoes |

Dragging a key onto another swaps the two, holding `Alt` copies instead, and dropping a key on a
layer tab sends it to that layer. The palette under the board holds the bindings worth not typing:
drag one onto a key, or click it and then click a key.

### On a touch screen

A finger cannot type on a key, so **tapping one opens the editor** and the menu it opens with builds
a whole binding without a keyboard: tap `&lt`, tap the layer, tap **Apply**. The field is not
focused until you tap it, so the on-screen keyboard stays down until you actually want it, and the
editor moves out of its way when it comes up.

Everything a drag does has a tap that does the same thing — **swap with…**, **copy to…** and
**send to…** in the editor, and tap-then-tap for the palette. Dragging works too, after a short
press so the board can still be scrolled past with a finger. The board keeps its keys at a size a
finger can hit rather than shrinking a split layout into the width of a phone, so it pans sideways;
a split layout is worked on one half at a time anyway.

Combos are built by clicking **pick on board** in the Combos panel and then clicking the keys, and
their output takes the same syntax as a key. Typing-path alternatives reorder by dragging, or with
the arrows beside them.

### What cannot be typed

Some bindings carry more than this syntax can write: an adaptive key's branches, a hold-tap's two
arms, a mod-morph, a tap dance, a macro built from steps, a one-shot carrying release options. On
one of those the editor opens read-only and says which it is, rather than flattening it.

**The Key panel refuses them too.** Its form is built from a fixed set of fields with no room for
those, so applying it would replace the binding rather than change it — it says so, and disables
itself until you press **Replace anyway**. A key a feature generated has no way through at all: it
is rewritten every time the layout compiles, so the panel names the feature and points at
**Features**, where turning the feature off hands the key back.

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
