# SFB bands: what the Layouts Doc gives, and what a badge on 1.56 may claim

Research for the SFB badge (`BANDS.sfb`, `packages/core/src/rules/catalog.ts`). The question, from the
owner: an SFB of 1.56 reads *high*; what does the Layouts Doc recommend instead? Measured 2026-11-08
on `main` at `cf389aee`. Reddit and Discord are unreachable, so only the Doc, Genkey's source and
cyanophage's page were read. "The denominator" below records what was done about the number itself
afterwards (2026-11-08); the sections before it describe the preset as it was at `cf389aee`.

## What the badge was, and why it reads wrong now

- The six bounds (0.525 · 0.625 · 0.735 · 0.875 · 1.075 · 1.375) are the Doc's, and have not moved
  since the engine's first commit (`878f4e7e`, 2026-09-07; `git log -S` finds no other).
- A value past the last bound lands in a seventh category, and `classifyBand` named it by position in
  the nine-word list: *high*. The Doc names no such category (below).
- What moved is the number the badge is drawn on, for Magic Romak. `analyze` on English news, 100,000
  symbols, fold, no space, at `a75396d` (the base of the Magic Romak SFB investigation) and now, after
  the keymap import (`d3d8358e`, `967d7613`, `0dd4846f`, `311eab89`):

  | rules | settings | `a75396d` | now |
  |---|---|---:|---:|
  | Layouts Doc | Library (fold, no space) | 1.24 *mid high* | 1.69 *high* |
  | cyanophage-like | Library (fold, no space) | 0.82 *mid low* | 1.12 *mid high* |
  | either | Shift and Space | 1.43 *high* | 1.69 *high* |

  Colemak is the same to the last digit at both commits, so the bands, the engine and the settings
  did not move; Magic Romak's keys did, and the rise is one pair. Magic Romak's SFB items on English
  news, Layouts Doc rules, Library settings: at `a75396d` they start `e.` 0.18, `ue` 0.12, `sc` 0.12
  (total 1.241); now they start `→A2'` 0.50 (total 1.693), a tap of the one-shot key to Alpha 2
  followed by `'`, on one finger, and the rest of the list is the same to within 0.05. That is a
  layer tap followed by a key on the same finger, the case METRICS lists as `layer_tap_sfb`, a pair
  the Doc's SFB never had. The owner decided it stays counted (2026-11-08), so nothing changes.
- 1.56 itself was not found. Runs of the bundled layouts over the seven corpora, both rule sets and
  both settings that read 1.56: Magic Romak on `it-general`, cyanophage-like rules, Library settings
  (1.5614); Ben Vallack Piano on `fr-general`, same rules and settings (1.5573); Nerps on
  `de-general`, Layouts Doc rules, Library settings (1.5623); Bird 30 on `en-markdown-agents`, same
  (1.5611); Nerps on `en-markdown-agents`, cyanophage-like rules (1.5593). Magic Romak on
  `pt-br-general`, Layouts Doc rules, Shift and Space, gives 1.5742. Which of them the owner read is
  not known; the label is the same for all, so the fix does not depend on it.

## What the Doc says

All from the [Keyboard Layouts Doc, 3rd edition](https://docs.google.com/document/d/1W0jhfqJI2ueJ2FNseR4YAFpNfsUM-_FlREHbpNGmC2o)
(read through its `/mobilebasic` view).

- **§13.4 Stats thresholds.** Two tables with nine columns each, Min to Max: one for the stats to
  maximise (alternation, rolls, in:out roll), one for the negative ones (SFB, SFS, scissors, redirects,
  pinky off). SFB's cells in the second: 0.525, 0.625, 0.735, 0.875, 1.075, 1.375, then a dash under
  High, Very high and Max. Each cell is the highest value of its category. The Doc says the negative
  stats use a limited range, because the categories below would lose most of their usefulness (a
  layout could have 20% SFB, but there is never a need for one that high), and that the values
  chosen "are intrinsically subjective". So the Doc gives six SFB thresholds and says nothing about a
  value above 1.375. SFS has six thresholds, scissors, redirects and pinky off seven, and lateral
  stretches are not in the table at all.
- **§13.2** (the layout stat table) shows how a layout's stats are listed, each with its category, on
  three examples (Noctum SFB 0.550 *Very low*, Mtgap 1.048 *Mid*, Isrt 0.599 *Very low*). It says green
  is good, yellow decent, red poor, without saying which category is which colour, and that "the
  minimum requirement for a layout is that it performs decently at SFBs and SFSs". The layouts
  analysed later in the Doc carry their own rows, among them Colemak DH 1.177 *Mid high* (§14.2.1) and
  Engram 1.242 *Mid high* (§15.7.5). In the 92 rows of those tables that a script could read, no SFB
  is past *Mid high*, and Engram's 1.242 is the highest.
- **§4.1** gives reference points, not bands: Qwerty "around 6%", Dvorak 2.5%, Colemak 1.5%, modern
  layouts "as low as 0.5%", and warns that they "can vary greatly depending on the analyzer and corpus"
  (Qwerty "may receive 4.5%" elsewhere): "all that matters is how layouts perform in relation to one
  another". It ends, of Qwerty, that it "will always have high SFBs, regardless of the analyzer": a
  statement about one layout, not a threshold. Dvorak has "noticeably higher SFBs than modern
  layouts" (§14.1).
- **§13.3** says SFB came from the Genkey analyzer, on the MonkeyRacer corpus (MonkeyType and
  TypeRacer quotes, duplicates removed, more punctuation than other texts).
- **§16.4** says stats are given "disregarding space": with it they would differ wildly and need
  giving twice, for the left and the right thumb.
- §10.7's thresholds (dark red above 0.25% and so on) are for one punctuation pair's share, not a
  layout's SFB, and do not apply.

## What Genkey counts

[semilin/genkey](https://github.com/semilin/genkey) at `HEAD` (the last commit to `output.go` is
2024-03-30; the Doc cites no version): `text.go` lowercases every character; `output.go` prints
SFBs as `100 * sfb / l.Total`, and `layout.go` makes `l.Total` the sum of the counts of the characters
on the layout's keys (its default valid characters are `a`–`z` and `,./?;:-_'"`; a layout file splits
its keys on spaces, so none is a space bar). So the Doc's SFB is same-finger bigrams as a share of the
**characters typed on the layout's keys**, in practice the letters, with case folded and no space.
The Doc cites no Genkey version, so this is HEAD's behaviour; the Colemak-DH check below fits it.

## What cyanophage gives

[cyanophage.github.io/playground.html](https://cyanophage.github.io/playground.html) prints a layout's
SFB (Qwerty 4.38% on its English text) and Effort (1258.15) with no band, category or threshold:
the text is a fixed colour and compared with nothing (`keyboard_svg.js`, read in full on 2026-11-09,
with `index.html`, `table.html` and `compare.html`, whose only script sorts). LayerBench's
cyanophage-like rules give Qwerty 4.38 on the English news sample, as a share of keystrokes with a
space per word.

What it does colour is a ramp. Each finger's SFB bar is `red = 128 + 6000 * share`, green and blue
128, red clamped to 16..255: grey at nothing, full red at a share of 127 / 6000 of the input,
2.117%. The key heat and the usage bars are the same ramp with other constants (key heat against the
most frequent letter, 11.87% in English). Nothing in it says what a good or a bad layout is, and
nothing in it is for Effort. It is the only SFB-specific reference the site gives, which is why the
cyanophage-like rule set's SFB ruler is drawn on it (below).

## Is the app's number the Doc's?

Only if Shift and Space are off **and** SFB is a share of letters; at `cf389aee` the preset was not,
and since "The denominator" below it is. Measured then with `analyze`, Layouts Doc
rules, English news (`en-general`), first 100,000 symbols, letters, nothing left out, fold, no space,
once as the preset has it (`percent_of_ngrams`) and once with the SFB rule's `aggregate` set to
`percent_of_keystrokes` (no space, no space per word: the letters typed, Genkey's denominator):

| Layout | SFB as the preset has it | as a share of letters | ratio |
|---|---:|---:|---:|
| Magic Romak | 1.6935 | 1.3480 | 0.7960 |
| Colemak, Colemak-DH | 1.4736 | 1.1730 | 0.7960 |
| Qwerty | 6.6193 | 5.2690 | 0.7960 |

The ratio is 0.796 for every bundled layout (36 of 36, 0.7958 to 0.7960), since it is a property of the
text: its bigrams are 0.796 of its letters. The Layouts Doc preset's SFB was 1.26 times the Doc's definition, and Colemak-DH, which
the Doc puts at 1.177 *Mid high*, read 1.47 in the Library. As a share of letters it is 1.173, *mid high*
as in the Doc (a different corpus, so a check and not a calibration: Graphite and Sturdy differ from the
Doc's tables by about 0.1).

The cyanophage-like rules divide by keystrokes with a space per word, about 1.2 times the letters, so
their SFB reads 0.83 times the share of letters (Qwerty 4.38 against 5.269). With Space counted, the Repeat key and the space bar on one thumb add pairs (METRICS.md, "Thumbs"; PR #109),
and with Shift modelled, the Shift presses; the Doc counted neither.

## What was done, and what was not

- **Done, then superseded (#117).** The Doc's six bounds stayed, and what is past the last one was
  named *above mid high* (`SFB_ABOVE_SCALE`) where it had been *high*, a Doc category with no SFB
  cell. The colour did not change (red, as *mid high* already was). It named the gap and left the
  ranges where they were, and the ranges were what the owner objected to: a Colemak-level SFB was
  still in the worst step of a ruler built to tell modern layouts apart. See the next section, which
  redraws it. LSB's bands are not in the Doc's table at all, so they are LayerBench's own and keep the
  nine names by position.
- **Not done: renaming what is past the last threshold of SFS, scissors, redirects and pinky off.**
  SFS has six thresholds in the table, scissors, redirects and pinky off seven, and a dash under the
  rest, as SFB does, and the same rename was first made for them (the owner's "same fix", on the
  strength of the dashes). The Doc's per-layout rows then showed that it does name those values, with
  the next word of the nine (columns SFB, SFS, scissors, alt, roll, redirect, in:out roll, pinky off,
  hand use, each a category then its value; read through `/mobilebasic`, the rows named here checked
  by hand): SFS 7.344 (Uciea), 7.483 (Colemak DH) and 7.541 (ColemaQ) are *High*, 8.744 (Poutea) *Very
  high*; scissors 0.71 (Hands Down Neu) and 0.81 (Uciea) *Very high*; redirects 12.1 (Colemak DH) and
  13.6 (ColemaQ) *Very high*; pinky off 8.1 (Journey) and 8.3 (Saiga) *Very high*. Those are the
  labels the app gave, so the owner's decision (2026-11-08) was to put them back: these four keep the
  next label in the list, and `engine.test.ts` pins the Doc's rows above. (An SFS of 8.744 is *very
  high* in the Doc and *high* here: the table has no bound for it, and none is made up.) SFB is
  different: no row has one past 1.375 (the highest is Engram 1.242), so the Doc names nothing there
  and *above mid high* claims only what it knows.
- **Layer taps stay in the SFB.** `→A2'` and the like are counted, as the owner decided; the number
  moves with the keymap, not with the bands.
- **Not done: bands per setting.** No source gives SFB bands for a number counted with Space or Shift,
  or as a share of bigrams, so any would be invented. Hiding the badge when Space or Shift is on would
  take the label from the view the owner reads, and the engine's band is per rule, not per setting.
  The guide and the glossary say what the bands were measured on instead.
- **Done afterwards: the denominator** (#118, "The denominator" below), **and the ruler** (next section).

## The ruler redrawn (2026-11-09)

Decided by the owner: the ruler is part of the rule set, each rule set draws its own, the old names
come back (*high*, *very high*, *max*), and the colours follow the steps. Effort's ruler is LayerBench's
own, so it was redrawn on the owner's word too: *min* up to 300 and *max* above 600, the seven steps
between them equal (300 / 7 = 42.9, rounded: 300 · 343 · 386 · 429 · 471 · 514 · 557 · 600), where it
had been 20 apart from 440 to 580, just above the easiest bundled layout. Its colours are the same
thirds.

**Layouts Doc rule set.** The Doc's first five SFB bounds, then its sequence carried on in place of
the sixth: its steps are 0.10, 0.11, 0.14, 0.20 and 0.30, and the next three, 0.45, 0.66 and 0.94,
continue them from its last bound, 1.375, to 1.825, 2.485 and 3.425. Each begins its name (*high* above 1.825, *very high* above
2.485, *max* above 3.425), so *mid high* runs to 1.825 where the Doc ends it at 1.375. The Doc's rows
(Noctum 0.550 and Isrt 0.599 *Very low*, Mtgap 1.048 *Mid*, Colemak DH 1.177 and Engram 1.242 *Mid
high*) keep their categories, which `engine.test.ts` pins. Nine steps are coloured in thirds by
`classifyBand`'s position rule, so green is *min* to *low*, amber *mid low* to *mid high* and red *high*
to *max*: *mid high* is no longer red.

**cyanophage-like rule set.** Nine equal steps over his ramp, 2.117% / 9 = 0.2352 each:
0.235 · 0.470 · 0.706 · 0.941 · 1.176 · 1.411 · 1.646 · 1.881, *max* above. His ramp is one finger's
share, so reading it as a layout's total is an assumption, said in the guide. Everything else the
set carries, Effort included, is the Layouts Doc set's, as he has no ruler for it.

Where the layouts read now (`analyze`, English news, the first 100,000 symbols, from the numbers in
the denominator section; names read off the bounds):

| Layout | Layouts Doc, Library | Layouts Doc, Shift and Space | cyanophage-like, Library |
|---|---|---|---|
| Magic Romak | 1.35 mid high | 2.03 high | 1.12 mid |
| Romak | 1.17 mid high | 1.55 mid high | 0.97 mid |
| Qwerty | 5.27 max | 5.62 max | 4.38 max |
| Dvorak | 2.12 high | 2.50 very high | 1.76 very high |
| Colemak, Colemak-DH | 1.17 mid high | 1.54 mid high | 0.97 mid |
| Graphite | 0.86 mid low | 1.25 mid high | 0.71 mid low |
| Sturdy | 0.76 mid low | 1.15 mid high | 0.63 low |
| Hands Down Neu | 0.89 mid | | 0.74 mid low |
| RSTHD | 1.10 mid high | | 0.92 mid low |

Under #117 the same numbers read *above mid high* for Qwerty and Dvorak in both columns, and in the
Shift and Space column for Magic Romak, Romak and the Colemaks (2.03, 1.55, 1.54: now *high*, *mid
high*, *mid high*); before #117 all of those were *high*.

## The denominator: SFB as a share of the letters typed

Done 2026-11-08, on the owner's decision. The Layouts Doc preset's `sfb` has `aggregate:
'percent_of_symbols'`, a new aggregate: the matched pairs over the text's symbols, its characters
without the space (`textSymbols`, `engine.ts`). The cyanophage-like preset is unchanged (its pair
rules still become `percent_of_keystrokes`). `sfb_2u`, a part of SFB, divides by the same letters, so
the two cards read in one unit; every other rule, SFS included, is unchanged. On English
news, 100,000 symbols, fold, no space (the Library's settings):

| Layout | before | after | band before → after |
|---|---:|---:|---|
| Magic Romak | 1.6935 | 1.3480 | above mid high → mid high |
| Colemak, Colemak-DH | 1.4736 | 1.1730 | above mid high → mid high |
| Qwerty | 6.6193 | 5.2690 | above mid high |
| Engram (ten columns, #120) | 1.5590 | 1.2410 | above mid high → mid high |

After over before is 0.796 on all 36 bundled layouts (0.7958 to 0.7960), as it is the text's bigrams
per letter. Colemak-DH, 1.177 *mid high* in the Doc, reads 1.173 *mid high*, and Engram, 1.242 *Mid
high* in the Doc (§15.7.5), reads 1.241 (other corpus and layout details, so two checks and not a
calibration).

- **Space and Shift.** The letters are the denominator whether space is counted or not, and whether
  capitals go through Shift or are folded; the number does not move because the denominator did.
  `percent_of_keystrokes` was the alternative, and with Space on it divides by the letters and the
  spaces, so the Doc's letters-only share would have turned into cyanophage's. What Space and Shift
  change now is the count. Space adds the space bar's pairs: Colemak-DH goes from 1.17 to 1.59 with
  Space on, `⟳␣` (Repeat then space, one thumb) 0.41 of it, and Magic Romak from 1.35 to 1.77. Before,
  Space on lowered 28 of the 36 bundled layouts (Qwerty 6.62 to 4.72), because the pairs it was a
  share of grew with the spaces' pairs too; now, with the default `cross_word: reset`, it lowers none,
  raises 28 and leaves 8 as they were. (With `bridge`, pairs cross words without Space and the space
  press breaks them, so Space can lower it.) Shift puts its presses into the stream, which makes some
  pairs and breaks others: with Space off, Magic Romak goes from 1.35 to 1.61, Colemak-DH from 1.17 to
  1.12 and Qwerty from 5.27 to 5.20. The Doc counted neither Space nor Shift, so those readings are
  not the Doc's number, and the guide says so; the badge still names the band of the number shown.
- **SFS was not changed**, the owner's call. Genkey divides its skipgram stat by the letters too
  (`output.go`: `100 × SFBs(l, true) / l.Total`), but counts skips of up to nine keys in between with
  weight 1, ½, ¼, … (`text.go`), where `sfs` counts skip 1 alone over the text's skipgrams (0.600 of
  its letters, not 0.796). Skip 1 over the letters reads 0.600 of today's number, far under the
  Doc's thresholds (5.3 to 7.3); the weighted sum is near them. Through the engine, English news,
  Library settings, with `skip_weights` 1, ½, ¼ (skips 1 to 3 are all it records; the weights of skips
  4 to 9 add 0.246 to these 1.75):

  | Layout | skip 1 over skipgrams (today) | skip 1 over letters | skips 1–3 weighted over letters |
  |---|---:|---:|---:|
  | Magic Romak | 6.53 | 3.92 *min* | 6.09 |
  | Colemak-DH | 8.08 | 4.85 *min* | 7.19 |
  | Qwerty | 10.25 | 6.15 *mid low* | 8.70 |
  | Graphite | 5.31 | 3.19 *min* | 5.45 |

  The Doc's own row for Colemak DH has SFS 7.483 (*High*, as listed above): that fits its SFS being
  Genkey's stat, without proving it (one layout, another corpus). Genkey weighs skip 1 at 1, the
  Doc's §4.6 example, which `sfs_weighted` follows, at 0.5 against 1 for an SFB: the same ratios
  between skips, another scale. Making SFS the Doc's means changing what it counts first, then its
  divisor.

## Before and after #117, English news, 100,000 symbols

The labels' change (`high` to `above mid high`), with the numbers as they were at `cf389aee`, before
the denominator above moved them. "Library settings" is fold and no space, "Shift and Space" is model and with space; the labels are
the old *high* and the new *above mid high* wherever they differ. Only layouts past 1.375 change.

Layouts Doc rules (the default of a link with no `preset`):

| Layout | Library settings | label | Shift and Space | label |
|---|---:|---|---:|---|
| Magic Romak | 1.69 | high → above mid high | 1.69 | high → above mid high |
| Romak | 1.47 | high → above mid high | 1.29 | mid high |
| Qwerty | 6.62 | high → above mid high | 4.66 | high → above mid high |
| Dvorak | 2.67 | high → above mid high | 2.07 | high → above mid high |
| Colemak | 1.47 | high → above mid high | 1.28 | mid high |
| Colemak-DH | 1.47 | high → above mid high | 1.28 | mid high |
| Graphite | 1.08 | mid high | 1.04 | mid |
| Sturdy | 0.96 | mid | 0.96 | mid |
| Hands Down Neu | 1.12 | mid high | 0.76 | mid low |
| Engram | 6.25 | high → above mid high | 4.52 | high → above mid high |
| RSTHD | 1.38 | high → above mid high | 3.79 | high → above mid high |

Engram reads 6.25 here, not the Doc's 1.242 *Mid high* (§15.7.5). The bundled one was a 10-column
version of the Doc's 11-column layout, and its top pair, `th` (3.10), shared a finger there. That was
a question about the layout's definition, not about the bands; #120 has since put it on ten columns
as its author's board has them (`docs/research/engram-columns.md`), so its row above is the layout
as it was at `cf389aee`.

cyanophage-like rules:

| Layout | Library settings | label | Shift and Space | label |
|---|---:|---|---:|---|
| Magic Romak | 1.12 | mid high | 1.69 | high → above mid high |
| Romak | 0.97 | mid | 1.29 | mid high |
| Qwerty | 4.38 | high → above mid high | 4.66 | high → above mid high |
| Dvorak | 1.76 | high → above mid high | 2.07 | high → above mid high |
| Colemak | 0.97 | mid | 1.28 | mid high |
| Colemak-DH | 0.97 | mid | 1.28 | mid high |
| Graphite | 0.71 | low | 1.04 | mid |
| Sturdy | 0.63 | low | 0.96 | mid |
| Hands Down Neu | 0.74 | mid low | 0.76 | mid low |
| Engram | 4.13 | high → above mid high | 4.52 | high → above mid high |
| RSTHD | 0.92 | mid | 3.78 | high → above mid high |

Custom rule sets saved before this keep the bands they were saved with, as Effort's note says, and so
the label they had.
