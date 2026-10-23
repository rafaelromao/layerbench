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
| layout | `magic-romak`, `romak`, `qwerty` |
| corpus | `fixture_en`, `fixture_pt`, `fixture_enpt` |
| preset | `layouts_doc`, `cyanophage` |
| case mode | `fold` everywhere, plus two `model` runs for `magic-romak` |
| universe | `no_space`, `with_space` |

Layouts are resolved from `layouts/<id>.json`, **not** from the bundled registry, so a layout can
leave the shipped catalogue and stay regression-tested here. `layouts/` also holds the canonical
document of every layout written in code, which `src/golden/layouts.test.ts` asserts — those are the storage, share-link and hashing formats, so
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

## Tenth re-baseline: dead keys type, and Magic Romak has a Dead keys layer

The simulator now types through a dead key: an accent, then the letter it composes with, as one
way to type the accented letter, letting go of any layer key held for the accent before the letter,
and shifting the letter rather than the accent for a capital. Magic Romak gains the default Dead
keys layer, reached by tapping Alpha 2's R1, which typed a second apostrophe before.

What moved, checked across the 14 Magic Romak reports; nothing else moved:

- **In the 12 fold reports, only the producer lists and the per-layer breakdown**: the dead-key
  producers join the lists, and every per-layer result gains an empty entry for Dead keys. Alpha 2
  is still the cheaper way to every Portuguese accent, so no press, value or trace moved.
- **The Portuguese model-mode report types more of the fixture**: 7,850 symbols where it typed
  7,789. Accented letters the Alpha 2 route could not type in some states (`é` 8 times, `á` 5, `ú`
  2, `ã`, `ç`, `ê`) now go through Dead keys, 17 presses on that layer. Each was a hard word
  boundary before, so the letters around them typed less too, and every unproducible count
  fell. Every rule value moves with that text: SFB 1.49 → 1.77 and Effort 312.9 → 315.2, and wasted
  one-shots 7.6 → 10.3 %, since tapping from Alpha 2 to Dead keys spends a one-shot on a layer key.
  The explained words did not change.
- **Magic Romak's document and its inline link**, with the new layer, the Alpha 2 key and the
  description. Dead keys has keys of its own for `ç` and `ñ`; no fixture has an `ñ`, so that moved
  only the producer lists.

## Eleventh re-baseline: Romak, named so, types `à`

Romak 34 is named Romak, and gains the `à` combo Romak 24 and Magic Romak have, `RHM`+`RHR` on Alpha
2, which types `à` and arms the alt-repeat layer as its other accents do.

What moved, checked across the 12 Romak reports; nothing else moved:

- **Only the producer lists**, which gain `à`. No fixture has an `à`, so no press, value or trace
  moved.
- **Romak's document**, with its name and the combo.

## Twelfth re-baseline: magic keys are adaptive keys

The kind of key a press is, `key_kind`, says `adaptive` where it said `magic`, as the editor and
the guide now call these keys, and the note of `adaptive_hit_rate` no longer says "(magic)". The
reports were changed by that text alone; no press, value, item or trace moved.

The layouts say so too, keeping their names: Romak 24's and Romak's behaviours `magic` and
`reversedMagic`, which no key refers to, are `adaptiveHV` and `adaptiveVH`, and the
descriptions of Magic Romak, Magic Sturdy and Nordrassil say adaptive key. Only those five
documents and Magic Romak's inline link changed.

## Thirteenth re-baseline: every bundled layout has the default layers

Every bundled layout but Magic Romak and Romak gains Numbers, Symbols and Dead keys, keeping all its
keys: the space key also holds Numbers, and a thumb of the other hand holds Symbols. Dead keys was
then a one-shot from that thumb, or from Numbers where no thumb was free; since the fourteenth
re-baseline no thumb reaches it, only the LHR+LHM combo. Romak, which has its own Numbers and
Symbols, gains Dead keys as Magic Romak has it, from Alpha 2's right thumb.

What moved, checked across the 38 reports; nothing else moved:

- **Qwerty in English, Romak everywhere, and Magic Romak**: no value, press or trace. Qwerty's
  and Romak's producer lists and per-layer results gain the new layers.
- **Qwerty on the Portuguese fixtures** types the 308 accented letters it skipped (`ç` 66, `ã` 63,
  `é` 50, `á` 49, `ú` 28, `ó` 22, `ê` 20, `í` 10), each as a tap to Dead keys, its accent and its
  letter; nothing is left unproducible. With no skipped letter breaking a word, the Portuguese
  fixture has 1,402 words where it had 1,547, and every rule value moves with that text: on the
  Layouts Doc's rules, SFB 7.13 → 6.82 and Effort 1054.6 → 1064.7, and layer taps go from none to
  3.62 per 100.
- **The 34 layouts' documents**, Romak's among them, with the new layers and thumbs.

## Fourteenth re-baseline: Dead keys from one combo, and Romak's Alpha 2 combos

Every layout with the default layers reaches Dead keys the same way: LHR and LHM pressed
together on its base layer, a one-shot. No thumb taps it any more; the Symbols thumb only holds
Symbols, and on Numbers it taps space. The analysis can now press a combo to bring a layer on,
type a dead key that is a combo, and hold a combo for its hold; a combo that types nothing is
named as a key with its binding would be (`→DK`, `´`).

Magic Romak and Romak gain the Alpha 2 combos of the author's keymap: the dead keys `` ´ ¨ ` ^ ~ ``
on LHM+LHI, LTM+LTI, LBM+LBR, LHR+LHM and LBI+LBM, `-` and `:`, and `?` and `!`, which hold `¿`
and `¡`. Magic Romak keeps its Dead keys layer. Romak loses Alt repeat 2 and Dead keys: its
accents are plain presses, Alpha 2's `é` holds `œ`, and its right outer thumb types `'` again.

What moved, checked across the 38 reports; nothing else moved:

- **Qwerty in English, and Magic Romak in folded case**: no value or press. Qwerty's traces name
  the combo where they named the thumb, and Magic Romak's producer lists gain its combos.
- **Qwerty on the Portuguese fixtures**: its 308 taps into Dead keys are the combo. Effort does not
  move, both being free on cyanophage's grid, but the combo's ring finger types `^` and `~` next:
  on the Layouts Doc's rules SFB 6.82 → 8.42 on Portuguese and 7.06 → 7.88 on the mix, layer taps
  3.62 → 0 per 100, and combo usage 0 → 2.94.
- **Magic Romak in modelled case on Portuguese**: 17 accents it typed through Dead keys are an
  Alpha 2 combo, a press less each: SFB 1.769 → 1.525, Effort 315.2 → 313.2.
- **Romak**: no value of a press. An accent arms no Alt repeat 2 left unused, so wasted one-shots
  go 91.3 → 11.0 % on Portuguese and 100 → 0 on English; macro usage 3.58 → 1.49, `qu` and `ç`
  being the only macros left; and the alt repeat's branch leaves the excluded producers.
- **The 35 layouts' documents**, and Magic Romak's share blob.

## Fifteenth re-baseline: Dead keys' left home and bottom rows swapped

On Dead keys the left hand's home and bottom rows swap, column by column: `«` `»` `` ` `` on the
home row, `^` `€` `¨` below it. The right hand, the top row and the pinky stay. A board with no
bottom row keeps `^` `€` `¨` on its home row, with nothing to swap them with.

What moved, checked across the 38 reports; nothing else moved:

- **Qwerty in English, and Magic Romak**: no value or press; the producer lists, and Qwerty's
  traces, name the keys where the accents are now.
- **Qwerty on the Portuguese fixtures**: `^` is a row lower under the same ring finger, so SFB
  does not move, but the bottom row is not free on cyanophage's grid: Effort 1064.7 → 1067.0, and
  SFB distance 12.31 → 12.51 on Portuguese.
- **The 33 layouts' documents** with a bottom row, Magic Romak's among them, and its share blob.

## Sixteenth re-baseline: thumb presses cost in Effort, and never roll or alternate

Effort charges a thumb press 1 (`THUMB_EFFORT`), where cyanophage's grid leaves thumbs free; a
space still costs nothing, whichever key types it. A trigram with a thumb press in it, the space
bar aside, is never an alternation or a roll, and still counts in the total. The simulator chooses
how to type on cyanophage's own grid, as before, so nothing typed moves.

What moved, checked across the 38 reports; nothing else moved:

- **No press, trace, total or statistic**, in any report: only rule values and the composite
  score, and the notes of Effort, alternation and rolls.
- **Magic Romak and Romak 34**, every report: Effort and hard words up by their thumb presses —
  Magic Romak 328.50 → 384.24 in English, 313.75 → 347.85 in Portuguese; Romak 34 514.77 → 531.68
  and 400.63 → 423.67, the same with or without the space — and alternation, alt SFS, rolls, in-
  and out-rolls and the in:out ratio down by the trigrams their taps made: Magic Romak in English,
  cyanophage-like, alternation 37.35 → 22.49 and rolls 51.02 → 36.88. SFB and the rest stay.
- **Qwerty**: no value, as the fixtures press none of its thumbs but for the space; the three
  notes only.

## Seventeenth re-baseline: Dead keys' left top and home rows swapped instead

The fifteenth's swap is undone, and the left hand's top and home rows swap instead: the acute and
the tilde on the home row with `£` between them, `^` `€` `¨` above, `«` `»` `` ` `` below as
before. Every board has a top row, the 18-key one too, so every Dead keys layer has it.

What moved, checked across the 38 reports; nothing else moved:

- **Qwerty in English, and Magic Romak**: no value or press; the producer lists, and Qwerty's
  traces, name the keys where the accents are now.
- **Qwerty on the Portuguese fixtures**: the acute and the tilde, the accents it types most, are
  under the same fingers a row down, so SFB does not move, but the home row is free on
  cyanophage's grid: Effort 1067.0 → 1041.2, and SFB distance 12.51 → 12.01 on Portuguese.
- **The 34 layouts' documents** with Dead keys, Ben Vallack Piano's now among them, and Magic
  Romak's share blob.

## Eighteenth re-baseline: `;` as a combo on Romak and Magic Romak

Romak and Magic Romak gain the keymap's `cb_semi`: RBM and RBR pressed together type `;` on Alpha 1
and on Numbers, a typing combo. Its hold, which jumps to the end of the line first, is editing and
is left out.

What moved, checked across the 38 reports; nothing else moved:

- **No value, press or statistic**: the fixtures are counted as letters. The two layouts' producer
  lists gain the combo; in Magic Romak's modelled report the combos after it sit a position
  further on, so the registry and the items that name them do too.
- **Magic Romak's and Romak's documents**, and Magic Romak's share blob.

## Nineteenth re-baseline: a combo that reaches a layer says what came next

A pair that ends on a key pressed to reach a layer lists, under `then`, the keys pressed right after
it (eighth re-baseline). Which keys those are was read from the legend, `⇩` for a hold, so a combo
that taps a layer never had them, nor did a hold that arms a one-shot, toggles or jumps to a layer.
Each press now carries the layer it reached, and every one of them has them.

What moved, checked across the 38 reports; nothing else moved:

- **`then` on the pairs that end on Qwerty's Dead keys combo**, in its eight Portuguese reports:
  `d→DK`, `s→DK`, `c→DK` and others, and `␣→DK` with space. Compared without `then`, every report
  is the same as before, byte for byte.
- **Nothing in the Magic Romak and Romak 34 reports.**

## Twentieth re-baseline: Accents, Numbers, Symbols and Extras replace Dead keys

The default layers are Numbers, Symbols, Extras where the board needs it, and Accents (issue #17).
Numbers and Symbols keep the 24-key core and add the pinky's top and bottom keys and the inner
column: `€ £ § ª º °` on Numbers, `; ¿ ¡ « »` on Symbols. Extras, on while both are held, has those
of them a board has no key for, where Dead keys had them; Magic Romak's 24 keys have none of them,
so it gets all eleven. Accents replaces Dead keys on the same LHR+LHM one-shot combo: the five dead
keys where they were, `ñ ç œ æ ß`, and nineteen accented letters and `qu` as macros, a key each. A
board with no bottom row gets its own arrangement, and Symbols 2 goes. Magic Romak's and Romak's
Numbers and Symbols are the defaults on the keymap's thumbs, and Magic Romak reaches Accents from
Alpha 2's right outer thumb, where it reached Dead keys; Romak gains Accents on the combo, and
declares Alpha 2's `ç` its typing path, so that `ç` still arms Ç extension. The planner brings a
layer that only comes on with others, as Extras does, on by bringing those on in turn.

What moved, checked across the 38 reports; nothing else moved:

- **Magic Romak and Romak**: no value, press or trace. Their producer lists and per-layer results
  gain the new layers.
- **Qwerty in English**: the fixture's ten `qu` are Accents' macro, the combo and one key, two
  presses as before but cheaper: Effort 1243.07 → 1241.90, and combo and macro usage 0 → 0.10.
- **Qwerty on the Portuguese fixtures** types its accented letters with a key each where it had
  an accent and the letter: 298 macro presses, and 242 fewer keystrokes (10,466 → 10,224 on
  Portuguese). Effort 1041.2 → 1028.0 and SFB 8.42 → 8.70 on the Layouts Doc's rules, SFS
  13.25 → 10.15, redirects 16.08 → 13.64; on the mix Effort 1141.8 → 1134.6, SFB 7.88 → 8.02.
  The composite score goes 25.40 → 28.57 on Portuguese.
- **The 35 layouts' documents** written in code, and Magic Romak's share blob. Romak 24, retired,
  keeps its own Numbers and Symbols and does not move.

## Twenty-first re-baseline: Accents' keys placed by how often the texts use them

Accents' keys move so that the most used cost least in Effort: the presses on each key, typing all
the app's texts (German's included) on the default analysis settings, ranked against the Effort
grid's cost of each position. The dead keys and the letters no dead key makes, `ñ` among them, stay
on the 24-key core's finger keys, so a board without the pinkies' top and bottom or the inner
column keeps them; the least used letters go past it. `qu` trades places with `ê`, which keeps the
core place `qu` would have had. Same on the board with no bottom
row, from the dead keys down. Nothing joins or leaves the layer.

What moved, checked across the 38 reports; nothing else moved:

- **Magic Romak**: no value, press or trace; its producer list follows Accents' new keys.
- **Qwerty**: the same presses, on other keys. In English the fixture's `qu` is off the right
  pinky's top key: Effort 1241.90 → 1240.73. On Portuguese Effort 1028.02 → 1018.13, with SFB
  8.70 → 9.04 and SFS 10.15 → 11.52 on the Layouts Doc's rules: `á` and `à` are now on the left
  middle and ring fingers' home keys, the two the Accents combo is pressed with. On the mix Effort
  1134.63 → 1129.09, SFB 8.02 → 8.19.
- **Romak**: Accents' macros now cost less than its Alpha 2 combos for some letters and for `qu`,
  so 72 of its Portuguese accented letters (10 `qu` in English) come from Accents rather than a
  layer tap: Effort 423.67 → 416.81 on Portuguese, 531.68 → 531.09 in English; SFB 1.50 → 1.56.
- **The 35 layouts' documents** written in code, and Magic Romak's share blob.

## Twenty-second re-baseline: the standard thumbs, and Romak becomes Standard

The bundled Standard and Thumb Alpha layouts share their main thumbs and base-layer symbols (issue
#19). The main thumbs hold Shift, Numbers, Symbols and Shift, left to right; where LayerBench placed
the thumbs they tap Repeat, space, the first thumb letter or nothing, and Accents one-shot, and where
the author did, space and letters stay and the other main thumbs tap Accents, then Repeat, right to
left. Every other thumb key goes, the LHR+LHM combo to Accents goes, and the base layer keeps only
its letters and `'` `,` `.` `;`. Romak is renamed from `romak-34` and becomes Standard: Alpha 1,
the default layers and the standard thumbs, without Alpha 2, Ç extension, their combos, the `;`
combo and its `/`. Romak 24 is deleted, document and all; the engine tests that used it use Magic
Romak, or a small layout of their own for the alt-repeat layer an accent arms. Its report files are
renamed `romak__…`.

What moved, checked across the 38 reports; nothing else moved:

- **Magic Romak**: nothing, its share blob included.
- **Qwerty** taps Repeat on L1 for a doubled letter (279 presses in English, where Repeat had none),
  reaches Accents by the one-shot on R1 instead of the combo, and holds R0 for `/`. On the Layouts
  Doc's rules in English, Effort 1240.73 → 1234.06, SFB 7.31 → 7.04, repeats 4.26 → 0.15 and thumb
  bigrams 0 → 3.89; in Portuguese, Effort 1018.13 → 1042.86, SFB 9.04 → 7.66 and thumb bigrams
  0 → 5.27. The composite score goes 28.57 → 25.32 on Portuguese with no space.
- **Romak** types every accented letter through Accents, as Qwerty does, where Alpha 2 had some of
  them: in Portuguese 58 more keystrokes (10,166 → 10,224), no wasted one-shot (11.04 → 0), macro
  usage 1.82 → 2.91, Effort 416.81 → 421.23 and SFB 1.56 → 1.76 on the Layouts Doc's rules. In
  English Effort 531.09 → 531.68, its `/` gone from RBP. The composite score goes 36.28 → 32.50 on
  Portuguese with no space.
- **The 26 documents** of Romak and the Standard and Thumb Alpha layouts, each declaring R1, held,
  its shift key, so that Caps word has a key to go on; both Shifts are the left one.
  `romak-24.json` and `romak-34.json` are deleted, and `romak.json` is new.

## Twenty-third re-baseline: Accents in rows and columns, reached by two thumbs

Accents is rearranged on the 30 main keys so that it is easy to remember
(`docs/research/accents-layer.md`). On the right hand, a row per accent (grave, acute,
circumflex) and a column per vowel. On the left, German's letters, the tilde's with `ç`, and the
ligatures with `qu` and `ß`, a row each, with the dead keys at the rows' ends. The same keys stay
on the layer. Four other changes come with it:

- A layout whose base layer types more vowels with the left hand gets Accents mirrored (Dvorak,
  Engram, Enthium, Nordrassil, Uno).
- The Special layouts reach Accents by the outer main thumbs pressed together, L1+R1, or L0+R0 on
  a board with one thumb a hand, instead of LHR+LHM. A row-stagger board keeps LHR+LHM.
- Extras carries the Accents keys a board lacks.
- `ı`, typed by no layout until now, is on Symbols' right inner top key, on Extras where a board
  lacks that key, and on Symbols' right outer thumb with no bottom row.

What moved, checked across the 38 reports; nothing else moved:

- **Magic Romak**: no value, press or trace. Its document and share blob gain Accents' new keys,
  and on Extras the ten Accents keys its 24 keys lack and `ı`, on RTM, its board having no RTC. Its
  producer lists follow them: `qu` from `macro:accents/RTM` to `macro:accents/LTM`, and some dead-key
  routes now through Extras.
- **Qwerty**, which is not mirrored (its `a` and `e` on the left, `i` `o` `u` on the right): the same
  presses on other keys. In English, `qu` moves from RTM to LTM, the same cost: Effort 1234.06, SFB
  4.84 and 7.04 unchanged; SFS 6.19 → 6.25 on cyanophage's rules. On Portuguese, Effort
  1042.86 → 1055.95, while SFB falls 5.50 → 4.79 on cyanophage's rules and 7.66 → 6.68 on the
  Layouts Doc's, and SFS 5.87 → 4.91. `ã` and `ç` are on the left index and middle's bottom keys,
  where `ã` and `ç` were on the right ring's home key and the left index's bottom key. On the mix,
  Effort 1138.16 → 1144.73 and SFB 5.17 → 4.82.
- **Romak**: in English as Qwerty. On Portuguese, Effort 421.23 → 434.32 and SFB 1.26 → 1.35 on
  cyanophage's rules; on the mix, Effort 476.29 → 482.85.
- **The 35 layouts' documents** written in code: Accents' new keys, mirrored on the five layouts
  above, the Special layouts' combo on thumbs, Extras' new keys, and Symbols' `ı`.

## Twenty-fourth re-baseline: Effort banded from min to max

Effort gets bands on the Doc's nine steps, lower being better: upper bounds 440 · 460 · 480 · 500 ·
520 · 540 · 560 · 580, as agreed with the maintainer. They come from the Effort of the bundled
Standard and Thumb Alpha layouts on the default analysis settings: 20 apart, from 440, just above
Enthium's 435, to 580, so that Colemak's 630, Dvorak and Qwerty are *max*.

What moved, checked across the 38 reports; nothing else moved:

- **The `effort` result's `band`, and nothing else of it or of any other result**: it had none.
  Magic Romak's is *min* on every text (348 to 384). Qwerty's is *max* (1056 to 1234). Romak's is
  *mid high* in English (532), *mid low* on the mix (483) and *min* on Portuguese (434).

## Twenty-fifth re-baseline: Magic Romak without Extras and Accents

Magic Romak follows its author's keymap, which has neither layer: it loses Extras and Accents, the
Extras condition and Alpha 2's way to Accents, whose right outer thumb types `'` again. It gains
the keymap's combos for `€` on Symbols and for `°` and `º`, or `ª` held, on Numbers. It no longer
types `£ § « » ı ß œ æ`.

What moved, checked across the 38 reports; nothing else moved:

- **Magic Romak**: no value, press or trace, the texts typing none of what it lost. Its producer
  lists lose Accents' and Extras' routes, the accents now coming from Alpha 2 and its dead-key
  combos alone, and `€`, `°`, `º` and `ª` come from the new combos; `'` gains Alpha 2's right
  outer thumb. Its per-layer results lose Extras and Accents.
- **Magic Romak's document and share blob**, its languages, measured by `pnpm languages`, losing
  French and German, which it no longer types whole.

## Twenty-sixth re-baseline: Numbers and Symbols on the inner thumbs, Extras on both

Every layout holds Numbers on its left inner thumb and Symbols on its right inner one, as Romak
does, and where there is Extras, Symbols' left inner thumb holds Numbers too, so holding both inner
thumbs brings Extras on in either order. Bird, Nordrassil and Ben Vallack Piano held Numbers on
their space key, L1, beside the inner thumb, and Nordrassil Symbols on its free right outer thumb.

Checked across the 38 reports, none of which moved. What moved is in the documents:

- **Bird, Nordrassil and Ben Vallack Piano's documents**: L0 holds Numbers, still typing `q`, the
  magic key and Repeat, and L1 types space alone. Bird's and Nordrassil's Symbols lose their own
  space on L1, where the base layer's shows through. Nordrassil's R0, its other magic key, holds
  Symbols and R2 types nothing; `0` goes on R1. Ben Vallack Piano's Symbols has `=` on L0 and `ı` on
  L1, the other way round.
- **Bird, Finch, Caksoylar and Ben Vallack Piano's documents**: Symbols' L0 holds Numbers, and
  taps space on Finch and Caksoylar, `=` on Ben Vallack Piano, moved there from L1, and `q` on
  Bird, as on its base layer.
- Their languages, measured by `pnpm languages`, did not move.

## Twenty-seventh re-baseline: Portuguese is `pt`

Portuguese's tag is `pt`, not `pt-BR`, and its name Português. Its text is still the Brazilian
news, `pt-br-general`.

What moved, checked across the 38 reports; nothing else moved:

- **No report**: none names a language.
- **The documents of the 18 layouts that are for Portuguese, and Magic Romak's share blob**: `pt-BR`
  becomes `pt` in their languages, and nothing else.

## Twenty-eighth re-baseline: home row mods, and Ben Vallack Piano's one-shot Shift

Every bundled layout but Magic Romak holds Gui, Ctrl, Alt and Shift on its base layer's home row
from the left pinky in, mirrored on the right, the left modifiers on both hands. Ben Vallack Piano
taps a one-shot Shift where its keymap has Repeat, its L0, and that is its Shift key.

What moved; the 38 reports and Magic Romak's document did not:

- **Every other layout's document**: LHP, LHR, LHM, LHI, RHI, RHM, RHR and RHP are tap-holds of
  what they typed and their modifier. A tapped one types what the key typed and is scored as it was,
  so no fold-mode number moves, and the only model-mode reports are Magic Romak's.
- **Ben Vallack Piano's document**: L0 taps `sk LSHIFT`, still holding Numbers, `keys.shift` is
  L0, one-shot, and its description says so. Its languages, measured by `pnpm languages`, did not
  move.
- **Nordwind**, a document of its own, carries the same eight tap-holds in its JSON.

## Twenty-eighth re-baseline: Magic Romak's home block mods, and its code moved

Romak and Magic Romak are written like the other layouts, in `CLASSIC_DEFS` and `SMALL_DEFS`, and
`romak.ts` is gone. Romak's document is what it was, its keys in another order. Magic Romak holds
its author's keymap's home block mods: Shortcuts on each pinky (an imported key), Ctrl, Alt and
Shift from the ring finger in, Shift with Gui on LBR and LBM, and Gui on LBI and the magic key.

What moved, checked across the 38 reports; nothing else moved:

- **Magic Romak's document and share blob**: the twelve keys hold what the keymap holds there,
  each still typing what it typed.
- **No report**: the fixture texts are typed the same, holds being no part of what they press, and
  every layout's languages, measured by `pnpm languages`, are as they were.

## Twenty-ninth re-baseline: Magic Romak reaches only the layers that type

Magic Romak holds no key for a layer of its author's keymap that types nothing. The Shortcuts layer
on each pinky goes, of the home block mods; so do the holds for functions on Numbers' `,`, media on
its `0` and macros on Symbols' `_`, which are plain taps now. The editor makes no imported key.

What moved, checked across the 38 reports; nothing else moved:

- **Magic Romak's document and share blob**: those five keys hold nothing, each still typing what
  it typed.
- **No report**: the fixture texts are typed the same, as those holds typed nothing, and every
  layout's languages, measured by `pnpm languages`, are as they were.

## Thirtieth re-baseline: Engram's link

Engram's link went to a domain that no longer serves Engram. It is now the author's repository for
the layout bundled here, Engram v2.0 of 2021: `https://github.com/binarybottle/engram-2021`.

What moved, checked across the 38 reports; nothing else moved:

- **Engram's document**: its `link`, and nothing else.

## Thirty-first re-baseline: authors' layers in place of the default ones

A layout whose author's keymap defines layers past the letters keeps them, in place of the default
layers, as Magic Romak already did: Magic Sturdy, Enthium, Hands Down Gold, Promethium and
Vibranium, T-34, Finch, Cem Aksoylar's Colemak-DH and Ben Vallack Piano. Each brings its author's
layers on the keys its board has, the keys and combos that reach them, and its author's combos for
symbols and accents. None has Accents, Extras or the standard thumbs, and nothing is added: what its
author's layers do not type, it does not type. An author's Numbers and Symbols count toward its
category, as its own layers.

What moved, checked across the 38 reports; nothing else moved:

- **No report**: they are Qwerty's, Romak's and Magic Romak's, which keep what they had.
- **The nine layouts' documents**: their default layers, and the keys and the Accents combo that
  reached them, give way to their authors' layers, holds and combos.
  - Enthium and the three Hands Down lose the standard thumbs for their authors': Enthium holds
    Numbers on Tab (L1) and Symbols on `r`, Hands Down Numbers on Backspace (L1) and Symbols on
    space, its R1 Enter, and its L0 its thumb letter alone.
  - Their base layers keep their marks again: Enthium's `=` `-` `/`, Hands Down's `#` `/` `"` `-`.
  - Magic Sturdy holds its author's modifiers on the home and bottom rows, Shift on `r` and `e`, its
    `d` holding nothing now.
  - Hands Down holds Ctrl, Alt, Gui and Shift from each pinky in.
  - Ben Vallack Piano holds Ctrl, Alt and Gui on the top row from each ring finger in, its home row
    holding its layers; its R0 arms its author's shifted Alpha 2, where its comma is.
- **Categories**: Hands Down's three are Special, their author's Symbols having `z` and `q`, a
  second alpha layer, and their `œ` combo typing `œu`, a macro; so is Enthium, its author's Numbers
  having letters and its Symbols typing three backticks at once, a macro.
- **Their languages**, measured by `pnpm languages`:
  - Enthium and Ben Vallack Piano are for English alone, and Finch no longer for Italian, their
    authors' layers having no accents.
  - Hands Down Gold loses German, which needs `ß`; Promethium and Vibranium lose German and, by
    Effort, Portuguese.
- **Bird's, Colemak-DH's and Nordwind's documents**: their languages only, as the better half by
  Effort moved with the others. Bird is no longer for Spanish, Colemak-DH no longer for French, and
  Nordwind, a document, is for Portuguese too.

## Thirty-second re-baseline: sentence case is zmk-sentence-case

Sentence case models rafaelromao/zmk-sentence-case, which Magic Romak's author's keymap builds with.
The space key is a sentence space: after `.`, `?` or `!` it leaves a capital pending, and the next
key press that sends a keycode takes it. A letter a–z comes out a capital; a digit, a symbol, a dead
key or a modifier goes through as it is, and the letter after it is lowercase. A layer key sends
none, and leaves the capital pending. It was an adaptive key that typed a space and a one-shot
Shift, which shifted whatever came next. Which punctuation ends a sentence, and the modifier, are
the module's now.

Magic Romak's Alpha 2 key is the keymap's `sentence_alpha2`, a sentence morph: while a capital is
pending, it arms Shift with Alpha 2, as the keymap arms its shifted Alpha 2, so an accent that
starts a sentence is a capital too. A macro that types nothing and turns a layer on is pressed as
the layer key it ends with.

What moved, checked across the 38 reports; nothing else moved:

- **Magic Romak's document and share blob**: its space key's tap is a sentence space, and its
  Alpha 2 key's tap a sentence morph.
- **Magic Romak's reports**: macro presses, and Macro usage with them, fall: a space after a
  sentence's end ran the old adaptive key's macro, and is a sentence space now (146 to 10 on the
  English fixture). Its space is typed by the space key itself, not by an adaptive key's default and
  branch. Keystrokes, layer taps, one-shots, Effort and every other number are as they were.

## Not compared

`globals`, the unigram tables, `travel`, `stats.per_layer` and the other stats that are not
numbers, meta other than `cross_word` and `stream_length`, and the descriptive fields of each
result (label, family, note, enabled, score weight, normalized); of the score, only whether it is
enabled and its value. Everything else is asserted: rule values to a millionth of themselves,
counts and lists exactly.
