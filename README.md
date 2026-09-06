# LayoutMaster

Keyboard layout analyzer that understands ZMK layers. It simulates how a text corpus is actually typed on a keymap with multiple alpha layers (one-shot layers, adaptive "magic" keys, repeat keys, macros, combos) and computes the Keyboard Layouts Doc metrics on the resulting physical key stream. Every rule is configurable.

Specification: [SPEC.md](SPEC.md).

## Structure

- `packages/core` — pure TypeScript engine (geometry, keymap model, simulator, tables, rules, presets).
- `packages/corpora` — build scripts that turn raw text into the shipped corpus data.
- `apps/web` — Vite + React static web app (GitHub Pages).

## Develop

```bash
pnpm install
pnpm test
pnpm dev
```
