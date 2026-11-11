# Golden reports

The files in this directory pin the numbers the engine produces (see *Not compared* for what is
left out). A regression in the simulator, the n-gram tables or any rule shows up as a failing
assertion in `src/golden/reports.test.ts`.

## Regenerating

```bash
pnpm goldens
```

On a clean tree this must produce **no change**. A dirty tree means the engine's output moved —
review the diff and decide whether that was intended before committing it.

The dump runs through vitest (`src/golden/dump.test.ts`, gated on `GOLDENS=1`) because that is the
repository's only TypeScript runner, and because it must resolve `golden/` and `fixtures/` exactly
the way the parity suite does. `src/golden/report.ts` holds the matrix and the payload builder, and
both the dump and the suite use it, so the two cannot drift apart. The dump writes the layout
documents first, since the reports are read against them, then the reports, and removes any report
file the matrix does not name.

## What is covered

`<layout>__<corpus>__<preset>__<case_mode>__<universe>.json`, from `goldenMatrix()`:

| Axis | Values |
|---|---|
| layout | `magic-romak`, `romak`, `qwerty` (`GOLDEN_LAYOUTS` in `src/golden/set.ts`) |
| corpus | `fixture_en`, `fixture_pt`, `fixture_enpt` |
| preset | `layouts_doc`, `cyanophage` |
| case mode | `fold` everywhere, plus two `model` runs for `magic-romak` (`layouts_doc`, `no_space`, on `fixture_en` and `fixture_pt`) |
| universe | `no_space`, `with_space` |

That is 38 reports: 36 fold-mode cells and the two model-mode ones. Each pins the simulation
statistics, the n-gram totals, the registry of logical keys, the producers of every character, the
run histograms, coverage, the typing trace of 15 chosen words (`EXPLAIN_WORDS`: accents, macros and
shift), every rule's value, items, bands, per-key credit and key scale, and the score.

Layouts are resolved from `layouts/<id>.json`, **not** from the bundled registry, so a layout can
leave the shipped catalogue and stay regression-tested here. `layouts/` holds the canonical
document of every layout written in code (`goldenLayouts()`), which `src/golden/layouts.test.ts`
asserts — those are the storage, share-link and hashing formats, so drift there breaks
interoperability. A layout added as a document (`src/layouts/documents.ts`) is its own checked-in
document; it joins `layouts/` only when it is one of the golden layouts.

`inline-magic-romak.txt` is the deflate + base64url share blob of Magic Romak's document, asserted
by the web app's `url/inline.test.ts`. zlib writes other bytes for the same text from one Node to
the next, so the dump leaves the file as it is when it holds the text it would write
(`src/golden/inline-blob.ts`): the dump on CI, which a proposal's pull request runs, would
otherwise rewrite it for nothing.

## What the cells measure

- **The fixtures are small and synthetic.** `fixture_en` is a shuffled word bag, with 136 lowercase
  sentence starts and no uppercase ones. A fixture holds letters, spaces, full stops, a few digits
  (which the default `letters` text class drops) and, in Portuguese, accented letters, and none of
  the symbols a layout's Numbers and Symbols layers carry. The reports cannot tell a misplaced
  key, so `src/layouts/layouts.test.ts` types every character of Magic Romak's two layers and checks
  the keys used.
- **The model-mode cells type the same text as the fold cells**, since the fixtures hold no capital.
  They differ where modelling case changes what a key can do: the producers, the keys excluded by
  case, the typing traces and, on `fixture_pt`, a few presses (keystrokes, chords, macro presses).
  They press no Shift for a capital, and no symbol is unproducible in either mode.
  `src/layout/features.test.ts` pins sentence case on real cased prose.
- **Effort is cyanophage's grid.** `effort` follows `keyboard_svg.js`: the grid by canonical column,
  `577 × Σ effort ÷ keystrokes`, scored over the text's own characters, space included. A thumb
  press costs 1 (`THUMB_EFFORT`) where cyanophage's grid leaves thumbs free, and a space costs
  nothing whichever key types it. `src/rules/effort.test.ts` pins the grid cell by cell and the
  formula against a hand computation. The numbers differ from cyanophage's site, which scores
  Qwerty 1258.15 in ergo mode: the formula is the same and the text is not, as cyanophage's word
  list ships without a license and cannot be a fixture.
- **Rules divide by the text's totals, not by the presses.** The simulator also counts the n-grams
  the text would have if every character took one press (`SimulationTables.text`). Bigram and
  skipgram rules (`percent_of_ngrams`, `sum_distance`) divide by the text's pairs;
  `percent_of_keystrokes` by its characters, space included where the universe counts it, plus one
  space per word where the `space_per_word_in_keystrokes` global is on and it does not;
  `percent_of_symbols` (the Layouts Doc's SFB, over the letters typed) by its characters without
  the space, in either universe; Effort by its characters, space included. Single-key and trigram
  rules are shares of what was pressed. `src/rules/engine.test.ts` pins every denominator.
- **Item lists are deterministic.** Where counts tie at the top-50 cutoff the order is fixed, and the
  suite compares item lists exactly.
- **Each key's part of a value adds up to it.** Every rule result carries `key_scale`: a key's part
  of the value is its `per_layer_key` entry times it, and the parts of every key on every layer add
  up to the value, which the suite checks for every rule that has one.

## Not compared

`globals`, the unigram tables, `travel`, `stats.per_layer` and the other stats that are not
numbers, meta other than `cross_word` and `stream_length`, and the descriptive fields of each
result (label, family, note, enabled, score weight, normalized); of the score, only whether it is
enabled and its value. Everything else is asserted: rule values to a millionth of themselves,
counts and lists exactly.
