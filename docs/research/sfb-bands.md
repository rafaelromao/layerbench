# SFB bands: what the Layouts Doc gives, and the rulers built on it

Research for the SFB ruler (`BANDS.sfb` in `packages/core/src/rules/catalog.ts`), the cyanophage-like
rule set's own (`CYANOPHAGE_BANDS`), and Effort's, which is drawn from the SFB progression. The
questions: what does the Keyboard Layouts Doc give for SFB, what is its number a share of, is the
app's number the same one, and what should a ruler say where the Doc's table stops? The sources are
the Doc (3rd edition, read through its `/mobilebasic` view), Genkey's source and cyanophage's
playground. Reddit and Discord, where layout authors discuss SFB, are not among the sources.

Every layout figure below is the engine's `analyze` on English news (`en-general`), the first
100,000 symbols, letters only, case folded, Space not counted: the Library's settings. The rules are
the Layouts Doc set's unless a heading says otherwise. The layouts are the 35 that come with the app,
as their authors design them.

## In short

- **The Doc gives six SFB thresholds and no more.** 0.525 · 0.625 · 0.735 · 0.875 · 1.075 · 1.375, and
  a dash under *high*, *very high* and *max*. No layout row in the Doc has an SFB past 1.242. The
  Layouts Doc ruler keeps the first five bounds and carries the Doc's sequence on in place of the
  sixth: 1.825 · 2.485 · 3.425. *Mid high* therefore runs to 1.825.
- **The Doc's SFB is a share of the letters typed**, with case folded and no space (Genkey divides by
  the characters on the layout's keys). The Layouts Doc preset's SFB is the same share. Colemak-DH
  reads 1.133, where the Doc has 1.177, and Engram 1.307, where the Doc has 1.242: both *mid high*.
  As a share of bigrams they would read 1.435 and 1.642.
- **cyanophage rates nothing.** The one ramp his pages draw for same-finger bigrams saturates at
  2.117% of the input. The cyanophage-like ruler is nine equal steps up to there (0.235 apiece); that
  reads one finger's ramp as a layout's total, which is an assumption.
- **Effort's ruler is LayerBench's own**: *min* up to 400, *max* above 900, and between them the SFB
  progression at the same relative places.
- **SFS is not the Doc's number**: it is a share of skipgrams over one skipped key.

## What the Doc says

All from the [Keyboard Layouts Doc, 3rd edition](https://docs.google.com/document/d/1W0jhfqJI2ueJ2FNseR4YAFpNfsUM-_FlREHbpNGmC2o).

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
The Doc cites no Genkey version, so this is HEAD's behaviour; the Colemak-DH and Engram checks below
fit it.

## What cyanophage gives

[cyanophage.github.io/playground.html](https://cyanophage.github.io/playground.html) prints a layout's
SFB (Qwerty 4.38% on its own English word list) and Effort (1258.15) with no band, category or threshold:
the text is a fixed colour and compared with nothing (`keyboard_svg.js`, with `index.html`,
`table.html` and `compare.html`, whose only script sorts; read 2026-11-09). LayerBench's
cyanophage-like rules give Qwerty 4.45 on the English news sample, as a share of keystrokes with a
space per word and the characters it cannot type, and an Effort of 1238. On the same text the two
read the same: the e2e `apps/web/e2e/cyanophage.spec.ts` holds the app to his page's numbers on
the whole sample, Qwerty 4.52% and 1254.51 on both (see [cyanophage-e2e.md](cyanophage-e2e.md)).

What the page does colour is a ramp. In the finger view of the SFB panel (the default view lists
bigrams in fixed-colour bars) each finger's bar is `red = 128 + 6000 * share`, green and blue 128, red
clamped to 16..255: grey at nothing, a pale red (#ff8080) that stops getting redder at a share of
127 / 6000 of the input, 2.117%. The bar's height, `30000 * share`, stops at 150px, 0.5%. The key heat
and the usage bars are the same ramp with other constants (key heat against the most frequent letter,
11.87% in English), and the finger-pair matrix colours every pair of fingers, same-finger cells
included, by `128 + 3 * share`, a different quantity. Nothing in it says what a good or a bad layout
is, and nothing in it is for Effort. The finger bar is the one ramp for a count of same-finger
bigrams, which is why the cyanophage-like rule set's SFB ruler is drawn on it; the same `6000`
colours the per-finger skipgram bars (`keyboard_svg.js` line 1994), so it is a general ramp, not one
set for SFB, and using it as SFB's ruler is an assumption. The ramp code is at lines 1883-1893 and
1987-1998.

## Is the app's number the Doc's?

Yes when Shift and Space are off, because the Layouts Doc preset's SFB is a share of the letters
typed (`percent_of_symbols`: the matched pairs over the text's symbols, its characters without the
space, `textSymbols` in `rules/engine.ts`). `sfb_2u`, a part of SFB, divides by the same letters, so the
two cards read in one unit. Measured with the SFB rule's `aggregate` set three ways, Layouts Doc rules,
Library settings (`percent_of_keystrokes` with Space off and no space per word is the letters typed
too, which is why its column equals the preset's):

| Layout | share of bigrams (`percent_of_ngrams`) | share of letters (the preset) | share of keystrokes, no space (`percent_of_keystrokes`) |
|---|---:|---:|---:|
| Magic Romak | 1.6935 | 1.3480 | 1.3480 |
| Colemak, Colemak-DH | 1.4346 | 1.1331 | 1.1331 |
| Engram | 1.6422 | 1.3066 | 1.3066 |
| Qwerty | 6.8517 | 5.4117 | 5.4117 |

A share of letters over a share of bigrams is 0.790 to 0.796 on the 35 bundled layouts: it is a
property of the text, whose bigrams are 0.796 of its symbols when a layout types every character, and
fewer where a layout has no key for one (Qwerty and Colemak-DH have no key for `'` or `-`, nor for
`?` `!` and a few accented letters, so 716 of the sample's 100,000 characters are skipped, taking
their bigrams with them). A share of bigrams would put Colemak-DH, which the Doc has at 1.177
*Mid high*, at 1.435 and Engram, which the Doc has at 1.242, at 1.642. As a share of letters they read 1.133 and 1.307, both *mid high* as in the Doc. The text and
the layouts differ from the Doc's, so these are checks and not a calibration: other layouts differ
from the Doc's rows by up to about 0.2 (Gallium 0.777 here and 0.644 in the Doc, Graphite 0.905 and
0.707).

The cyanophage-like rules divide by keystrokes with a space per word, about 1.2 times the letters, so
their SFB reads 0.821 to 0.831 times the share of letters on the bundled layouts (Qwerty 4.45 against
5.41). Every other pair rule, SFS included, is a share of the text's pairs.

### Space and Shift

The letters are the denominator whether Space is counted or not, and whether capitals go through Shift
or are folded; what Space and Shift change is the count.

- **Space** adds the pairs the space bar makes. Where a layout's space key shares a finger with
  another thumb key, those are same-finger bigrams: Magic Romak goes from 1.348 to 1.766 with Space
  on, `⟳␣` (the Repeat key, then space, on one thumb) being 0.41 of it, and Romak from 1.067 to 1.520
  (`⟳␣` 0.42). Sunlight goes from 0.642 to 2.355 (`r␣` 1.11, `␣r` 0.61: a letter on the space bar's
  thumb) and Aptmak from 0.979 to 4.949 (`e␣` 3.50). Colemak-DH and Qwerty have no other key on the
  space bar's finger, so they do not move. Of the 35 bundled layouts Space raises 11, lowers none and leaves
  24 as they are. (With `cross_word: bridge`, pairs cross words without Space and the space press
  breaks them, so Space can lower the number: Colemak-DH reads 3.193 without it and 1.133 with it.)
- **Shift** puts its presses into the stream, which makes some pairs and breaks others. With Space
  off it lowers 31 of the 35 layouts and raises 4 (Magic Romak, 1.348 to 1.612, and the three Hands
  Down with their authors' layers): Colemak-DH goes from 1.133 to 1.090 and Qwerty from 5.412 to
  5.246.
- **Both** can add a thumb's Shift to its space: Night reads 0.521 with Shift and Space off and 3.939
  with both on (`␣⇧` 3.45), and Ben Vallack Piano 0.690 and 3.081.

The Doc counted neither Space nor Shift, so those readings are not the Doc's number, and the guide
says so. The badge still names the band of the number shown.

### SFS

SFS is not the Doc's number: it is the share of the text's skipgrams over one skipped key. Genkey
divides its skipgram stat by the letters too (`output.go`: `100 × SFBs(l, true) / l.Total`), but
counts skips of up to nine keys in between with weight 1, ½, ¼, … (`text.go`), where `sfs` counts
skip 1 alone over the text's skipgrams (0.59 to 0.60 of its letters, not 0.79). Skip 1 over the
letters reads 0.6 times the `sfs` number, far under the Doc's thresholds (5.3 to 7.3); the weighted
sum is near them. Through the engine, English news, Library settings, with `skip_weights` 1, ½, ¼ (skips 1
to 3 are all the engine records; the weights of skips 4 to 9 add 0.246 to these 1.75):

| Layout | skip 1 over skipgrams (`sfs`) | skip 1 over letters | skips 1–3 weighted over letters |
|---|---:|---:|---:|
| Magic Romak | 6.53 | 3.92 *min* | 6.09 |
| Colemak-DH | 8.56 | 5.06 *min* | 7.55 |
| Qwerty | 10.95 | 6.47 *mid low* | 9.11 |
| Graphite | 5.60 | 3.34 *min* | 5.76 |

The Doc's own row for Colemak DH has SFS 7.483 (*High*, as listed under the other rules below): that
fits its SFS being Genkey's stat, without proving it (one layout, another corpus). Genkey weighs skip
1 at 1, then ½, ¼; the Doc's §4.6 example, which `sfs_weighted` follows, weighs skips 1 to 3 at 0.5,
0.25, 0.125 against 1 for an SFB: the same ratios between skips, on another scale. Making SFS the Doc's means changing what it counts
first, then its divisor.

## The rulers

### Layouts Doc rule set

The first five bounds are the Doc's. The Doc's sixth, 1.375, ends *mid high* in its table, and the
three dashes after it are filled by carrying the Doc's sequence on in its place. Its steps are
0.10, 0.11, 0.14, 0.20 and 0.30 (each larger than the one before, by a tenth at first and about
half from the fourth), and the next three, 0.45, 0.66 and 0.94, continue them from the last bound,
1.375, to 1.825, 2.485 and 3.425. Each number begins the name it is said of (*high* above 1.825,
*very high* above 2.485, *max* above 3.425), so *mid high* runs to 1.825 where the Doc ends it at
1.375, and no row of the Doc contradicts that: the highest SFB in its tables, Engram's 1.242, is
*mid high* either way. The Doc's rows (Noctum 0.550 and Isrt 0.599 *Very low*, Mtgap 1.048 *Mid*,
Colemak DH 1.177 and Engram 1.242 *Mid high*) keep their categories, which `engine.test.ts` pins.
Nine steps are coloured in thirds by `classifyBand`'s position rule: green is *min* to *low*, amber
*mid low* to *mid high* and red *high* to *max*.

| Step | SFB up to | Colour |
|---|---|---|
| min | 0.525 | green |
| very low | 0.625 | green |
| low | 0.735 | green |
| mid low | 0.875 | amber |
| mid | 1.075 | amber |
| mid high | 1.825 | amber |
| high | 2.485 | red |
| very high | 3.425 | red |
| max | above 3.425 | red |

### cyanophage-like rule set

cyanophage has no ruler, so the one drawn on his ramp is nine equal steps up to where it stops,
2.117% / 9 = 0.2352 each: 0.235 · 0.470 · 0.706 · 0.941 · 1.176 · 1.411 · 1.646 · 1.881, *max* above
(it takes what is above full red too, where his bar stays saturated). His ramp is one finger's share,
so reading it as a layout's total is an assumption, said in the guide. Everything else the set
carries, Effort included, is the Layouts Doc set's, as he has none.

### Effort

Effort has no source with a ruler, so its bounds are LayerBench's own, on the same nine steps: *min* up
to 400 and *max* above 900, and between them the SFB progression (0.525 · 0.625 · 0.735 · 0.875 ·
1.075 · 1.375 · 1.825 · 2.485) at the same relative places, 255.1 Effort to the unit of SFB, rounded:
400 · 426 · 454 · 489 · 540 · 617 · 732 · 900, steps of 26 · 28 · 35 · 51 · 77 · 115 · 168. The steps are
narrow where the layouts cluster and wide where only the worst are, as the Doc's are for SFB. Equal
steps between the same ends (71.4 apart: 400 · 471 · 543 · 614 · 686 · 757 · 829 · 900) put 31 of the
35 bundled layouts at *mid low* or below, 17 of them at *low*; the progression spreads them over all
nine steps (1 · 1 · 5 · 6 · 14 · 4 · 2 · 1 · 1, *min* to *max*). Scaling the Layouts Doc SFB ruler as
built onto 400 to 900, 0.525 to 400 and 3.425 to 900, would put a 129-point step between 495 and 624
and 18 of the 35 layouts in *mid high*; that ruler leaves 1.375 out, and Effort's keeps it, so the
two are not step for step the same.

### The other rules past their last threshold

SFS has six thresholds in the Doc's table, scissors, redirects and pinky off seven, and a dash under
the rest, as SFB does. The Doc's per-layout rows name those values, with the next word of the nine
(columns SFB, SFS, scissors, alt, roll, redirect, in:out roll, pinky off, hand use, each a category
then its value; read through `/mobilebasic`, the rows named here checked by hand): SFS 7.344 (Uciea),
7.483 (Colemak DH) and 7.541 (ColemaQ) are *High*, 8.744 (Poutea) *Very high*; scissors 0.71 (Hands
Down Neu) and 0.81 (Uciea) *Very high*; redirects 12.1 (Colemak DH) and 13.6 (ColemaQ) *Very high*;
pinky off 8.1 (Journey) and 8.3 (Saiga) *Very high*. So these four keep the next label in the list,
and `engine.test.ts` pins the Doc's rows above. (An SFS of 8.744 is *very high* in the Doc and *high*
here: the table has no bound for it, and none is made up.) SFB is different: no row has one past
1.375, so the Doc names nothing there, and its ruler carries the Doc's sequence on instead. LSB's
bands are not in the Doc's table at all, so they are LayerBench's own and keep the nine names by
position.

## Where the bundled layouts read

The 35 bundled layouts on the Effort ruler, Layouts Doc rules, Library settings (`analyze`; cyanophage
gives Effort no ruler, so the cyanophage-like set rates the same numbers on the same ruler):

| Step | Layouts |
|---|---|
| min (up to 400) | Magic Romak 353 |
| very low | Ben Vallack Piano 412 |
| low | SNTH 443, Aptmak 444, Enthium 445, Bird 452, Engram 453 |
| mid low | Hands Down Promethium 454, Romak 456, Nordrassil 466, Sunlight 480, Hands Down Vibranium 484, Bird 30 487 |
| mid | 14, from Graphite 494 to Hands Down Neu 534, among them Colemak-DH 523 |
| mid high | RSTHD 556, Sturdy 567, Uno 582, Magic Sturdy 595 |
| high | Recurva 623, Colemak 629 |
| very high | Dvorak 764 |
| max | Qwerty 1245 |

That is 7 green, 24 amber and 4 red. The same layouts on the Layouts Doc SFB ruler: min 4 (Magic
Sturdy 0.445, SNTH 0.486, Dusk 0.509, Night 0.521), low 4, mid low 9, mid 8, mid high 7, high 2
(Uno 2.094, Dvorak 2.192) and max 1 (Qwerty 5.412): 8 green, 24 amber, 3 red. On the cyanophage-like
SFB ruler: very low 4, low 13, mid low 10, mid 5, very high 2 (Uno 1.738, Dvorak 1.812), max 1: 17
green, 15 amber, 3 red. A Library with custom layouts has more, the empty ones at *min*.

Where a few well-known layouts read on SFB, with the band each ruler gives the number:

| Layout | Layouts Doc, Library | Layouts Doc, Shift and Space | cyanophage-like, Library |
|---|---|---|---|
| Magic Romak | 1.35 mid high | 2.03 high | 1.12 mid |
| Romak | 1.07 mid | 1.49 mid high | 0.88 mid low |
| Qwerty | 5.41 max | 5.25 max | 4.45 max |
| Dvorak | 2.19 high | 2.17 high | 1.81 very high |
| Colemak, Colemak-DH | 1.13 mid high | 1.09 mid high | 0.93 mid low |
| Graphite | 0.91 mid | 0.86 mid low | 0.74 mid low |
| Sturdy | 0.78 mid low | 0.75 mid low | 0.64 low |
| Hands Down Neu | 0.96 mid | 0.90 mid | 0.80 mid low |
| RSTHD | 0.83 mid low | 0.80 mid low | 0.69 low |
| Engram | 1.31 mid high | 1.25 mid high | 1.08 mid |

("Shift and Space" is Shift modelled and Space counted.) The Doc's own Qwerty is "around 6%" and its
Dvorak 2.5% (§4.1): both on the high side of the ruler, as here.

## What counts, and what the badge claims

- **Layer taps are SFBs.** A layer tap followed by a key on the same finger counts in the SFB, as
  `layer_tap_sfb` lists it: Magic Romak's top pair, `→A2'`, a tap of the one-shot key to Alpha 2
  followed by `'` on one finger, is 0.40 of its 1.348. The Doc's SFB has no such pair; the number moves
  with the keymap and not with the ruler.
- **No bands per setting.** No source gives SFB bands for a number counted with Space or Shift, or as
  a share of bigrams, so any would be invented. Hiding the badge when Space or Shift is on would take
  the label from the view a reader looks at, and the engine's band is per rule, not per setting. The
  guide and the glossary say what the bands were measured on instead.
- **A saved rule set carries its own rulers.** A custom rule set holds the bounds it was saved with, and
  edits them in **Rules**; a set made from a preset starts with that preset's rulers.

## Reproducing

The figures are `analyze(layout, stream, options)` from `@layerbench/core`, with
`analysisRun(settings, text)` giving the stream and options for
`forRanking({ ...DEFAULT_SETTINGS, corpus: 'en-general', rules: getPreset('layouts_doc') })`
(`packages/core/src/analysis/settings.ts`), `getPreset('cyanophage')` for the cyanophage-like column,
`caseMode: 'model'` for Shift and `universe: 'with_space'` for Space. A rule's `aggregate`, or the
set's `skip_weights`, is changed on a copy of the rule set to read a number as another share (the
`percent_of_ngrams`, `percent_of_symbols` and `percent_of_keystrokes` columns above). A rule's items
list only its top 12 pairs, so a pair's share is read there and a total from the value.
