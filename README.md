# LayoutMaster

Keyboard layout analyzer that understands ZMK layers. It **simulates** how a text corpus is actually typed on a keymap — one-shot and momentary layers, layers armed by macros, adaptive ("magic") keys, repeat keys, multi-letter macros, combos, sticky shift, caps word — and computes the Keyboard Layouts Doc metrics (SFB, SFS, scissors, LSB, alternation/rolls/redirects, usage, effort) on the resulting **physical key stream**. Every rule is data: toggle, re-parameterize, remove or compose new ones.

Specification: [SPEC.md](SPEC.md). Metric glossary: [docs/METRICS.md](docs/METRICS.md). Stack: Elixir + Phoenix LiveView (no database); saved layouts, rule sets and corpora live as JSON in a GitHub data repository (or `priv/data` locally).

## Run

```bash
mix setup            # deps + assets (once)
mix layoutmaster.corpora   # rebuild shipped corpora from priv/corpora_src (optional; outputs are committed)
mix phx.server       # http://localhost:4000
```

Views: **Analyze** (`/`), **Edit** (`/edit`), **Compare** (`/compare`), **Rules** (`/rules`), **Corpus** (`/corpus`), **Library** (`/library`). Short links to saved layouts: `/l/<id>`; JSON export: `/api/layouts/<id>`.

In the editor, swapping two plain keys is re-scored instantly from the existing n-gram tables (marked "estimate after swap"); the full re-simulation replaces the estimate a moment later. Any other edit re-simulates a 100k-symbol sample.

## Storage

Set these to persist to a GitHub repository (single-tenant, server token, Contents API):

| Variable | Meaning |
|---|---|
| `GITHUB_TOKEN` | token with `contents:write` on the data repo |
| `DATA_REPO` | `owner/name` |
| `DATA_BRANCH` | default `main` |
| `DATA_PATH` | default `data` (files: `layouts/<id>.json`, `rulesets/<id>.json`, `corpora/<id>.json`, `*/index.json`) |

Without them the Local adapter writes to `priv/data/`.

## Corpora

Shipped (1 MB samples, see `priv/corpora_src/sources.json` for provenance/licenses): English work chat/email and Brazilian Portuguese work chat/email (Romak, MIT), English news 2023 and Brazilian Portuguese news 2011 (Leipzig Corpora Collection, CC BY 4.0). Custom corpora can be pasted/uploaded in the Corpus view.

## Development

```bash
mix test             # engine scenarios, Romak acceptance traces, rules, corpus, storage, LiveViews
mix precommit        # compile --warnings-as-errors, format, test
```

Engine layout: `lib/layoutmaster/{geometry,layout,host,sim,tables,rules,corpus,storage,analysis}.ex` — see SPEC §10.
