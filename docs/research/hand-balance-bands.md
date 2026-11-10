# Hand balance bands

`BANDS.hand` in `packages/core/src/rules/catalog.ts` is `5 · 11` points of `|left − right|`, labelled
even · leans · heavy. The Keyboard Layouts Doc (3rd edition) sets the splits it is read from, and has
three categories.

## What the Doc says

Ch. 13.4 ends its threshold tables with one sentence on hand balance: it is counted as "even until a
52-48 split", as leaning left or right up to 55-45, and as heavy left or right past that. Those are
shares of the keystrokes per hand, which sum to 100:

- ch. 13.5 talks of "a hand split of around 45-55" and gives Sturdy a 43-57 split;
- the Doc's per-layout tables print a *Hand use* row as a label and the two shares, from "Even 50 – 50"
  to "Heavy right 41 – 59".

So there is no ambiguity about what a split is: 52-48 is not a difference of 52 and 48. The rule's
value is `|left − right|` in points (`per_hand` in `rules/engine.ts`, `METRICS.md`), twice the larger
share's distance from 50. The Doc's 52-48 and 55-45, read as that distance, are 4 and 10.

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

## The bands

| Bounds (`\|left − right\|`) | Labels |
|---|---|
| 5 · 11 (`HAND_EVEN_BOUND`, `HAND_LEANS_BOUND`) | even · leans · heavy |

A value falls in the first category it does not exceed, as for every band.

**There is no *very heavy*.** The Doc names no category above *heavy*. SFB's row stops short of the
Doc's scale (a dash under *high*, *very high* and *max*) and none of its layout rows has an SFB past the
last bound, so SFB's ruler carries the Doc's progression on and names what is past it by its own
steps (`docs/METRICS.md`). Hand balance has no such gap: the sentence gives three categories and calls
everything past 55-45 *heavy*, and the Doc's rows run to a printed 59-41 under that name. So *heavy*
is the Doc's own word for the range above the last bound, and it is the last category, taking any
split, 100-0 included. The colours follow the categories: *even* is green, *leans* amber and *heavy*
red.

## The bundled layouts

Measured with `analyze` on the Library's settings: English news (`en-general`), 100,000 letters, fold,
Space not counted, and the Layouts Doc rules (hand balance is the same on the cyanophage-like rules).
Of the 35 bundled layouts, 14 are *even*, 12 *leans* and 9 *heavy*; Night is the most even
(0.97) and Uno the most unbalanced (18.40).

| Layout | Left–right | \|L − R\| | Band |
|---|---|---|---|
| Night | 49.52–50.48 | 0.97 | even |
| Nerps | 49.38–50.62 | 1.24 | even |
| Bird 30 | 49.03–50.97 | 1.93 | even |
| Graphite | 48.99–51.01 | 2.01 | even |
| Dusk | 48.80–51.20 | 2.40 | even |
| Gallium | 48.70–51.30 | 2.60 | even |
| Focal | 51.37–48.63 | 2.74 | even |
| SNTH | 51.56–48.44 | 3.12 | even |
| Hands Down Vibranium | 51.61–48.39 | 3.22 | even |
| Engram | 48.34–51.66 | 3.31 | even |
| Bird | 47.97–52.03 | 4.06 | even |
| Cem Aksoylar's Colemak-DH | 47.91–52.09 | 4.19 | even |
| Colemak | 47.88–52.12 | 4.24 | even |
| Colemak-DH | 47.88–52.12 | 4.24 | even |
| Hands Down Neu | 52.56–47.44 | 5.13 | leans |
| Hands Down Gold | 52.85–47.15 | 5.70 | leans |
| Recurva | 47.11–52.89 | 5.78 | leans |
| APTv3 | 47.04–52.96 | 5.91 | leans |
| Sunlight | 53.13–46.87 | 6.27 | leans |
| Nordrassil | 46.66–53.34 | 6.68 | leans |
| Enthium | 46.20–53.80 | 7.59 | leans |
| Romak | 46.15–53.85 | 7.71 | leans |
| Hands Down Promethium | 53.89–46.11 | 7.77 | leans |
| T-34 | 45.65–54.34 | 8.69 | leans |
| Dvorak | 44.92–55.08 | 10.15 | leans |
| Sturdy | 44.65–55.35 | 10.71 | leans |
| Canary | 43.84–56.16 | 12.33 | heavy |
| Aptmak | 56.29–43.71 | 12.59 | heavy |
| RSTHD | 56.40–43.60 | 12.80 | heavy |
| Magic Sturdy | 43.28–56.72 | 13.43 | heavy |
| Magic Romak | 43.06–56.94 | 13.88 | heavy |
| Finch | 42.95–57.05 | 14.09 | heavy |
| Qwerty | 57.44–42.56 | 14.88 | heavy |
| Ben Vallack Piano | 40.84–59.16 | 18.33 | heavy |
| Uno | 59.20–40.80 | 18.40 | heavy |

(T-34's two shares sum to 99.99: a press that spans both hands counts for neither.)

The Doc's §13.5 gives Sturdy a 43-57 split, *heavy*; the bundled Sturdy measures 44.65–55.35 here, which
is *leans*. The Doc's numbers come from another text and analyzer: the bands are the Doc's, the
measurements are LayerBench's own, on its own text and rules.

## Limits

- The value is a difference, so the Doc's *leans left* and *leans right* are one band; which hand is
  heavier is on the card, in the two shares, not in its badge.
- A custom rule set carries the bounds and names it was saved with; a set made from a preset starts
  with the preset's.
- The Rules editor keeps a band's names while they reach every category, and gives the standard names
  by position once the categories outnumber the names: a third Hand balance bound makes four
  categories for three names, and they are then named *min*, *very low*, *low*, *mid low*, which say
  nothing of hand balance.
