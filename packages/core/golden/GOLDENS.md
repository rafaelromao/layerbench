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
both the dump and the suite use it, so the two cannot drift apart.

## What is covered

`<layout>__<corpus>__<preset>__<case_mode>__<universe>.json`, from `goldenMatrix()`:

| Axis | Values |
|---|---|
| layout | `magic-romak`, `romak-34`, `qwerty` |
| corpus | `fixture_en`, `fixture_pt`, `fixture_enpt` |
| preset | `layouts_doc`, `cyanophage` |
| case mode | `fold` everywhere, plus two `model` runs for `magic-romak` |
| universe | `no_space`, `with_space` |

Layouts are resolved from `layouts/<id>.json`, **not** from the bundled registry, so a layout can
leave the shipped catalogue and stay regression-tested here. `layouts/` also holds the canonical
document of every layout written in code, bundled or retired (Romak 24 and 34), which
`src/golden/layouts.test.ts` asserts — those are the storage, share-link and hashing formats, so
drift there breaks interoperability. A layout added as a document (`src/layouts/documents/`) is its
own checked-in document.

`inline-magic-romak.txt` is the deflate + base64url share blob, asserted by the web app's
`url/inline.test.ts`.

## First re-baseline

The first set of reports came from a generator that is no longer in this repository, so they were
frozen artefacts: the engine could not evolve without either abandoning them or hand-editing them.
They have since been regenerated from this engine. Comparing the two sets, with JSON key order
normalised, the differences were fully accounted for:

- **Nothing structural changed.** Simulation statistics, n-gram totals, the logical-key registry,
  producer enumeration and ordering, coverage, run histograms and every `explain` trace were
  identical to the first set.
- **`lsb` and `lss` gained real values.** Both rules compare a horizontal distance against a
  rule-set global, `{ x_distance: { min: "$global.lsb_adjacent_u" } }`. The first generator substituted
  `$global.` references only when the whole predicate value was a string; here the reference sits one
  level deeper, inside the numeric condition, so it was never substituted and the surviving
  comparison `number >= "$global.lsb_adjacent_u"` is false for every number.
  Lateral stretches never matched, and both rules reported `0` with no items. This engine resolves
  globals wherever they appear, so the rules now report what the metric glossary documents.
- **The composite score moved in 12 reports**, entirely as a consequence of those two rules
  contributing real values and bands.
- **Item lists differ where counts tie at the top-50 cutoff.** The first generator emitted tied items
  in hash order, so which member of a tie group survived truncation was arbitrary. This engine's
  order is deterministic, and the suite now compares item lists exactly.

Two further defects were already fixed before the re-baseline and no longer need
recording as differences: the Analyze view's `travel` heat mode looked up a rule id the catalog calls
`finger_travel` and silently fell back to usage heat, and the relabel eligibility check compared a position
index against the whole `shift_key` map instead of `shift_key.key`.

## Second re-baseline: features instead of layers

Magic Romak lost four layers — `sen_case`, `case_a1`, `sft_a2` and `altrep2` — which existed only
because firmware needs them. Sentence case now arms a one-shot shift, caps word is the `caps_word`
behaviour, shifted Alpha 2 is simply shift state, and the alt-repeat follow-ups match on the tag the
accent macro leaves behind. The layout declares all four in a `features` block, and the compiler
desugars them into the same primitives it always used — so a golden pins the desugared bindings, and
a document that spells the behaviours out longhand still simulates identically.

What moved, measured against the previous set:

- **The other 24 reports are byte-identical.** The feature machinery is dormant unless a layout
  declares it, and Romak 24 and Romak 34 still model their keymaps literally, one-shot layer and all.
- **Every typing trace is unchanged** — all 15 explain words, in both fold and model mode.
- **Fold-mode keystrokes are unchanged.** `per_layer` collapses from seven layers to three, and
  `layer_taps` / `one_shot_activations` fall by the count the sentence-case layer used to add.
- **`wasted_one_shots` collapses** (38 → 0, 146 → 0, 356 → 37). Nearly all of it was the accent
  macro arming a layer the typist never had to visit — an artifact of the workaround, reported until
  now as a real cost. The `Wasted one-shots` rule and `Layer distribution` move accordingly.
- **Model-mode coverage on the fixtures gets worse, and that is correct.** A one-shot shift cannot
  be cancelled, so a *lowercase* letter straight after `. ` is genuinely unproducible — the firmware
  behaves the same way. The pre-shifted layer looked better only because `upperCopy` copied `kp` and
  `macro` bindings and silently skipped the adaptive magic key, letting `h` and `v` through
  unshifted.

  The two model-mode cells therefore measure a **fixture artifact**, not shift modelling:
  `fixture_en` is a shuffled word bag with **136 lowercase sentence starts and no uppercase ones**.
  On real cased prose the same layout reports zero unproducible symbols and spends no shift press at
  a sentence start, which `src/layout/features.test.ts` pins directly. Extending the fixtures with
  real sentences would make these cells meaningful; it would also move every other report, so it is
  left as its own change.

`tag` on a binding and `afterTags` on an adaptive trigger are LayerBench extensions with no ZMK
counterpart. The firmware distinguishes "the previous press came from Alpha 2" by arming the
`ALTREP2` one-shot layer; the engine records a tag instead. Observable output is the same, and
`features.test.ts` pins the case that motivates it — `u` typed by the `qu` macro offers a different
follow-up from a plain `u`, which `lastSymbol` alone cannot express.

## Third re-baseline: Effort as cyanophage computes it

`effort` was described as cyanophage's grid but was not it: it scaled by 100 rather than 577, charged
thumbs 1 rather than 0, and read two cells differently (the top-row outer pinky column at 7 rather
than 5, the bottom-row inner column at 7 rather than 8). It also read the grid by finger, where
cyanophage reads it by position. It now follows `keyboard_svg.js` exactly — the grid by canonical
column, thumbs free, `577 × Σ effort ÷ keystrokes` — so a layout scores the number cyanophage would
give it over the same text. `src/rules/effort.test.ts` pins the grid cell by cell and the formula
against a hand computation.

What moved, checked rule by rule across all 38 reports:

- **`effort` and `hard_words`, and nothing else.** They are the only two rules that read the effort
  grid. Every other rule's values, items and bands are identical.
- **The numbers still differ from cyanophage's site**, which scores Qwerty 1258.15 in ergo mode. The
  formula is the same; the text is not. cyanophage's word list ships without a license, so the
  fixtures cannot include it, and the comparison stops at the formula.

## Fourth re-baseline: Romak's Numbers and Symbols from the author's keymap

Magic Romak's Numbers and Symbols layers came from the generic templates, and Romak 24 and 34 had
none. All three now carry the two layers of the author's keymap, `numbers_layer` and
`symbols_layer` in `zmk/definitions/keymap.dtsi` of github.com/rafaelromao/keyboards, and reach
them the way it does: holding the space thumb for Numbers, holding the Alpha 2 thumb for Symbols.

What moved, checked across all 38 reports:

- **No metric value, item or band.** The fixture corpora contain none of the characters the new
  layers add, and the ones they do contain are typed exactly as before. `qwerty` is untouched.
- **`producers`**, the ways each character can be typed: Magic Romak's digits and symbols now sit
  where the keymap puts them, and Romak 34 gains producers for the ten digits and the symbols.
- **Romak 34's per-layer arrays** (`stats.per_layer`, the `layer_taps_per_100` breakdown) carry the
  two new layers, at zero.

Because the corpora cannot catch a misplaced digit or symbol, `src/layouts/layouts.test.ts` types
them on each of the three layouts and checks the keys used.

## Fifth re-baseline: each word's space counted once in cyanophage's keystrokes

The `cyanophage` preset divides its bigram and skipgram percentages by keystrokes plus one space per
word, the way cyanophage counts them. The keystrokes it started from already held the space presses,
so every word's space was counted twice and each of those percentages came out 12–14% too low.
Keystrokes now count a space press only in the `with_space` universe. The space
per word is added only in `no_space`, since in `with_space` the presses are already there.
`src/rules/engine.test.ts` pins both denominators.

What moved, checked across all 38 reports:

- **The 18 `cyanophage` reports, and only the rules they divide by keystrokes**: `sfb`, `sfb_2u`,
  `repeats`, `lsb`, `fsb`, `hsb`, `thumb_bigrams`, `thumb_double` and `layer_tap_sfb` where they
  match anything, and the skipgrams `sfs`, `sfs_weighted`, `lss`, `fss` and `hss`. Each rises by the
  same factor within a report: Qwerty's `sfb` on `fixture_en` goes from 4.349 to 5.027. Their bands,
  and the score computed from them, move with them.
- **Nothing in the `layouts_doc` reports**, which divide by n-grams. Trigram rules, Effort and the
  layer statistics are untouched in every report.

## Sixth re-baseline: pairs and Effort counted over the text, not the presses

Pair rules divided by the pairs a layout pressed, and Effort by the keystrokes it pressed. A layout
with layer taps, holds or one-shots presses more than the text has characters, and those presses sit
on thumbs, where no letter pair can match and Effort charges nothing, so every such layout looked
better than it types: on English news, 16% of Magic Romak's bigrams were thumb presses. The
simulator now also counts the text's own totals, the n-grams it would have if every character took
one press (`SimulationTables.text`), and the rules divide by those:

- **Bigram and skipgram rules** (`percent_of_ngrams`, `sum_distance`) by the text's pairs;
  `percent_of_keystrokes` by its characters, plus one space per word where space is not counted.
- **Effort** by the text's characters, space included — cyanophage's keystrokes on any layout it
  models.
- **Single-key and trigram rules are unchanged**: they are shares of what was pressed, and the
  trigram categories must still add up within the trigrams pressed.

What moved, checked across all 38 reports:

- **Only the layouts that press more than the text has characters**: Magic Romak everywhere, and
  Romak 34 on the two fixtures with Portuguese in them, where its accents take extra presses. Their pair rules rise
  (Magic Romak's `sfb` on `fixture_en` goes from 0.778 to 0.854) and so does Effort (307.79 to
  328.50).
- **Nothing for Qwerty, or for Romak 34 in English**: a layout typing each character with one press
  has exactly the text's totals, which `src/rules/engine.test.ts` asserts.

## Seventh re-baseline: magic keys and the alt repeat as bindings on their keys

A magic key made in the editor was a binding on its key, and Magic Romak's were declared in
`features` and placed on keys; the editor treated the two differently in a score of ways. Now every
magic key and alt repeat is an `adaptive` binding on its key, and `features` holds only sentence
case and caps word.

The alt repeat's second stage was a second adaptive key wrapped around the first. It is now one list
of branches with the three that need the `alpha2` tag first: branches are tried in order, so it types
exactly what the two stages did.

What moved, checked across all 38 reports:

- **Magic Romak's document** (`layouts/magic-romak.json`, `inline-magic-romak.txt`): its keys
  RBI, LBI and L1 carry their adaptive bindings, and `features` keeps sentence case and caps word,
  written in schema order (`capsWord` had been read back in a different key order).
- **Producer ids on the alt-repeat key of the 14 Magic Romak reports, and nothing else**: the first
  stage's branches go from `adaptive:alpha1/L1#default#t<i>` to `#t<i+3>`, and its repeat from
  `repeat:alpha1/L1#default#default` to `#default`. Applying those two renames to each previous
  report gives the new file byte for byte. Every statistic, total, registry entry, run, rule value,
  score and traced press is unchanged, and so is the order of every producer list.
- **Nothing in the Romak 34 and Qwerty reports.**

## Eighth re-baseline: layer keys named as on the key, and where each press was

A key that reaches a layer is labelled the way the board draws it, `→A2` rather than `→Alpha 2`,
so the lists under the board read like the board. Rule results also say on which layer each key
was pressed: `per_layer_key` splits `per_key` by that layer for the heat map, `layers` gives the
layer of each key of an item, and a pair that ends on a layer key lists, under `then`, the keys
pressed right after it, which are what that key was pressed for.

What moved, checked across all 38 reports:

- **No rule value or band, statistic, n-gram total, run count, coverage entry or producer list.**
- **The layer key's label, wherever it is written**: 26 registry entries, the typing traces that
  press it, and the hand strings and items that contain it. `→Alpha 2` is the only one the fixtures
  press.
- **The order of `same_hand_strings` in 22 reports**, with the same members: it ranks strings by
  count times their length in characters, and the layer key now counts three of them rather than
  eight.
- **The new fields**: `per_layer_key` on every result, `layers` on every n-gram and word item, and
  `then` on the pairs that end on a layer key. They are asserted, and so is `per_key`, which was
  written but not compared before.

## Ninth re-baseline: each key's part of a number adds up to it

Every rule result says what a key's credit is worth, `key_scale`: a key's part of the value is its
`per_layer_key` entry times it, and the parts of every key on every layer add up to the value, which
the suite now checks for every rule that has one. To make them add up, a key is credited with what
the value sums: an effort sum credits each key its own effort times its count, a distance credits
the distance times the count, and a chord's share is split between the keys pressed together.
Finger travel is now kept for the key a finger moved to, and layer taps for the key tapped. The
simulator also weighs same-finger pairs when it chooses how to type a character, and chooses per
word between keys that tap a layer the same way; no golden layout has such keys, and no tie in them
breaks differently, so neither moved anything.

What moved, checked across all 38 reports:

- **No rule value or band, item, statistic, n-gram total, registry entry, run, coverage entry,
  producer list or typing trace.**
- **`per_key` and `per_layer_key` of five rules**: `effort` (cost times presses, where it was the
  presses alone, so thumbs and the home row's free keys are no longer credited), `sfb_distance` and
  `finger_speed` (distance times count), `finger_travel` and `layer_taps_per_100` (empty before).
- **The new field** `key_scale` on every result, null where the value is no sum over keys.

## Not compared

`globals`, the unigram tables, `travel`, `stats.per_layer` and the other stats that are not
numbers, meta other than `cross_word` and `stream_length`, and the descriptive fields of each
result (label, family, note, enabled, score weight, normalized); of the score, only whether it is
enabled and its value. Everything else is asserted: rule values to a millionth of themselves,
counts and lists exactly.
