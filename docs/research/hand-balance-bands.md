# Hand balance bands

`BANDS.hand` in `packages/core/src/rules/catalog.ts` was `2 · 5 · 8`, labelled even · leans · heavy ·
very heavy. The Keyboard Layouts Doc (3rd edition) sets other bounds, and has three categories, not
four.

## What the Doc says

Ch. 13.4 ends its threshold tables with one sentence on hand balance: it is counted as "even until a
52-48 split", as leaning left or right up to 55-45, and as heavy left or right past that. Those are
shares of the keystrokes per hand, which sum to 100:

- ch. 13.5 talks of "a hand split of around 45-55" and gives Sturdy a 43-57 split;
- the Doc's per-layout tables print a *Hand use* row as a label and the two shares, from "Even 50 – 50"
  to "Heavy right 41 – 59".

So there is no ambiguity about what a split is: 52-48 is not a difference of 52 and 48. The rule's
value is `|left − right|` in points (`per_hand` in `rules/engine.ts`, `METRICS.md`), twice the larger
share's distance from 50. The old bounds, 2 and 5, were those two splits read as that distance, where
the value is the difference of the two shares, and the 8 and the name past it are LayerBench's.

## Where a category ends

The Doc prints whole percents, so "52-48" does not say where a 52.4-47.6 split goes. Its own rows
do. Tabulating the 87 rows labelled in its tables by the larger share they print:

| Larger share printed | 50 | 51 | 52 | 53 | 54 | 55 | 56 | 57 | 58 | 59 |
|---|---|---|---|---|---|---|---|---|---|---|
| Even | 3 | 9 | 23 | | | | | | | |
| Leans | | | | 14 | 9 | 10 | | | | |
| Heavy | | | | | | | 7 | 5 | 6 | 1 |

Every 52 is even, every 55 leans and every 56 is heavy. A cut at exactly 52.0 and 55.0 would send about
half of the rows printed as 52 or 55 to the category above, since a printed 52 is anything from 51.5
to 52.5. So the Doc files a layout under the whole-percent split it prints, and a category runs to the
half point above its share: 52.5-47.5 and 55.5-44.5, a difference of **5** and **11** points. (A few
rows print 101 in all, 46–55, 47–54 and 45–56, which cutting the shares never gives, and only a few,
where rounding every share up would give it nearly everywhere. So the shares read as rounded, not cut,
and to the nearest: an inference from those rows, not something the Doc says, and the one the half
point rests on. Rounded to the nearest, a category ends at the half point above a share; cut, it
would end at the next whole one. The decision itself rests on the rows above.) The sentence
read as exact bounds, 4 and 10, is the other reading; it would call a layout the Doc prints as
"Even 52 – 48" leaning about as often as not.

At exactly 52.5-47.5 or 55.5-44.5 the Doc's rounding would go up and a value of 5 or 11 is not past
its bound here; the difference is a split no sample of text lands on.

## What changed

| | Bounds (`\|left − right\|`) | Labels |
|---|---|---|
| Before | 2 · 5 · 8 | even · leans · heavy · very heavy |
| After | 5 · 11 (`HAND_EVEN_BOUND`, `HAND_LEANS_BOUND`) | even · leans · heavy |

A value falls in the first category it does not exceed, as for every band.

**`very_heavy` is dropped, not renamed.** The Doc names no category above *heavy*, and `very heavy`
was LayerBench's. SFB's row stops short of the Doc's scale and none of its layout rows has an SFB past
the last bound, so what is past it is named for where the Doc stops (`above_mid_high`). Hand balance has
no such gap: the sentence gives three categories and calls everything past 55-45 *heavy*, and the Doc's
rows run to a printed 59-41 under that name. So *heavy* is the Doc's own word for the range above the
last bound, and it stays the last category, taking any split, 100-0 included. The colours follow the
categories: *even* is green, *leans* amber and *heavy* red, where *leans* was green and *heavy* amber.

## Effect on the bundled layouts

Measured with `analyze` on the Library's settings (English news, 100,000 letters, fold, no space,
cyanophage-like rules; hand balance is the same on the Layouts Doc rules). 32 of the 35 bundled layouts
change band; the values do not move.

| | even | leans | heavy | very heavy |
|---|---|---|---|---|
| Before | 3 | 10 | 6 | 16 |
| After | 13 | 13 | 9 | (none) |

A selection of 12 of the 35:

| Layout | Left–right | \|L − R\| | Before | After |
|---|---|---|---|---|
| Colemak | 48.82–51.18 | 2.37 | leans | even |
| Recurva | 48.05–51.95 | 3.91 | leans | even |
| Cem Aksoylar's Colemak-DH | 47.91–52.09 | 4.19 | leans | even |
| Bird | 47.65–52.23 | 4.58 | leans | even |
| Hands Down Neu | 52.56–47.44 | 5.12 | heavy | leans |
| Enthium | 46.20–53.80 | 7.59 | heavy | leans |
| Dvorak | 45.93–54.07 | 8.14 | very heavy | leans |
| Sturdy | 45.09–54.91 | 9.81 | very heavy | leans |
| Canary | 44.59–55.41 | 10.82 | very heavy | leans |
| Night | 43.82–56.18 | 12.36 | very heavy | heavy |
| Magic Romak | 43.06–56.94 | 13.88 | very heavy | heavy |
| Qwerty | 58.07–41.93 | 16.14 | very heavy | heavy |

(Bird's two shares sum to 99.88: a press that spans both hands counts for neither.)

The Doc's §13.5 gives Sturdy a 43-57 split, *heavy*; the bundled Sturdy measures 45.09–54.91 here, which
is *leans*. The Doc's numbers come from another text and analyzer: the bands are the Doc's, the
measurements are LayerBench's own, on its own text and rules.

## What it does not do

- The value is a difference, so the Doc's *leans left* and *leans right* are one band; which hand is
  heavier is on the card, in the two shares, not in its badge.
- A custom rule set saved before this keeps the bounds and the four names it was saved with. The
  presets take the new ones.
- The Rules editor keeps a band's names while they reach every category, and gives the standard names
  by position once the categories outnumber the names: a third Hand balance bound makes four
  categories for three names, and they are then named *min*, *very low*, *low*, *mid low*, which say
  nothing of hand balance.
