# SFB bands: what the Layouts Doc gives, and what a badge on 1.56 may claim

Research for the SFB badge (`BANDS.sfb`, `packages/core/src/rules/catalog.ts`). The question, from the
owner: an SFB of 1.56 reads *high*; what does the Layouts Doc recommend instead? Measured 2026-11-08
on `main` at `cf389aee`. Reddit and Discord are unreachable, so only the Doc, Genkey's source and
cyanophage's page were read.

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
  the Doc's SFB never had. Whether it belongs in the SFB is the owner's call.
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
SFB (Qwerty 4.38% on its English text) with no band, colour or threshold. LayerBench's cyanophage-like
rules give Qwerty 4.38 on the English news sample, as a share of keystrokes with a space per word.

## Is the app's number the Doc's?

Only if Shift and Space are off **and** SFB is a share of letters. Measured with `analyze`, Layouts Doc
rules, English news (`en-general`), first 100,000 symbols, letters, nothing left out, fold, no space,
once as the preset has it (`percent_of_ngrams`) and once with the SFB rule's `aggregate` set to
`percent_of_keystrokes` (no space, no space per word: the letters typed, Genkey's denominator):

| Layout | SFB as the preset has it | as a share of letters | ratio |
|---|---:|---:|---:|
| Magic Romak | 1.6935 | 1.3480 | 0.7960 |
| Colemak, Colemak-DH | 1.4736 | 1.1730 | 0.7960 |
| Qwerty | 6.6193 | 5.2690 | 0.7960 |

The ratio is 0.796 for every bundled layout (36 of 36, 0.7958 to 0.7960), since it is a property of the
text: its bigrams are 0.796 of its letters. The Layouts Doc preset's SFB is 1.26 times the Doc's definition, and Colemak-DH, which
the Doc puts at 1.177 *Mid high*, reads 1.47 in the Library. As a share of letters it is 1.173, *mid high*
as in the Doc (a different corpus, so a check and not a calibration: Graphite and Sturdy differ from the
Doc's tables by about 0.1).

The cyanophage-like rules divide by keystrokes with a space per word, about 1.2 times the letters, so
their SFB reads 0.83 times the share of letters (Qwerty 4.38 against 5.269). With Space counted, the Repeat key and the space bar on one thumb add pairs (METRICS.md, "Thumbs"; PR #109),
and with Shift modelled, the Shift presses; the Doc counted neither.

## What was done, and what was not

- **Done.** The Doc's six bounds stay. What is past the last one is named for what it is, *above mid
  high* (`SFB_ABOVE_SCALE`), where it was named *high*, a Doc category that has no SFB cell. The colour
  does not change (red, as *mid high* already is). SFS (*high*), full scissors, redirects and pinky off
  (*very high*) ended on a padded label the Doc has a dash under as well (SFS six thresholds, the others
  seven), so a scissors reading of 0.8 said *very high*. Asked by the owner, they are named the same
  way: SFS past 7.3 is *above mid high*, full scissors past 0.7, redirects past 9.0 and pinky off
  past 6.8 are *above high* (`negativeStat` in `catalog.ts`). LSB's bands are not in the Doc's table at
  all, so they are LayerBench's own and keep the nine names by position.
- **Not done: bands per setting.** No source gives SFB bands for a number counted with Space or Shift,
  or as a share of bigrams, so any would be invented. Hiding the badge when Space or Shift is on would
  take the label from the view the owner reads, and the engine's band is per rule, not per setting.
  The guide and the glossary say what the bands were measured on instead.
- **Not done: the denominator.** Switching the Layouts Doc preset's SFB to a share of letters would make
  its number the Doc's (Colemak-DH 1.17, Magic Romak 1.35 *mid high*, Qwerty 5.27) and the bands fit it.
  It moves every SFB under that preset by 20%, and the same question holds for SFS, which Genkey also
  divides by `l.Total`; it is the owner's call.

## Before and after, English news, 100,000 symbols

"Library settings" is fold and no space, "Shift and Space" is model and with space; the labels are
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

Engram reads 6.25 here, not the Doc's 1.242 *Mid high* (§15.7.5). The bundled one is a 10-column
version of the Doc's 11-column layout, and its top pair, `th` (3.10), shares a finger there. That is a
question about the layout's definition, not about the bands, and was not looked into further.

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
