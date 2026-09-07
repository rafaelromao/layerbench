# LayoutMaster

Keyboard layout analyzer that understands ZMK layers. It **simulates** how a text corpus is actually
typed on a keymap — one-shot and momentary layers, layers armed by macros, adaptive ("magic") keys,
repeat keys, multi-letter macros, combos, sticky shift, caps word — and computes the Keyboard Layouts
Doc metrics (SFB, SFS, scissors, LSB, alternation/rolls/redirects, usage, effort) on the resulting
**physical key stream**. Every rule is data: toggle, re-parameterize, remove or compose new ones.

Specification: [SPEC.md](SPEC.md). Metric glossary: `docs/METRICS.md`.

> **Status.** This branch re-implements the app in TypeScript. The feature-complete Elixir/Phoenix
> version lives on `main` and is the behavioral reference: URL formats, layout/rule-set/storage JSON
> and every metric definition are ported unchanged. `packages/core/golden/` holds reports dumped from
> that implementation; the parity suite asserts the TypeScript engine reproduces them.

## Structure

- `packages/core` — the engine: geometry, keymap model, ZMK-faithful simulator, n-gram tables,
  rules, analysis. Pure TypeScript, runs in a Web Worker and in Node.
- `packages/corpora` — builds the shipped corpus samples served by the web app.
- `apps/web` — Vite + React single-page app, deployed to GitHub Pages. The engine runs in a worker;
  saved layouts live in IndexedDB and, optionally, in a GitHub data repository of your own.

## Develop

```bash
pnpm install
pnpm check        # Biome format + lint
pnpm typecheck
pnpm test
pnpm dev          # http://localhost:5173
```

`pnpm bench` runs the performance suite (skipped by default).
