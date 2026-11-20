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
and the Layouts Doc rules. Hand balance counts the finger keys' presses alone, no thumb press and no
space (`FINGER_PRESSES` in `catalog.ts`; `docs/METRICS.md`, *Thumbs*), so it is the same on the
cyanophage-like rules and with Space on or off. Of the 35 bundled layouts, 22 are *even*, 9 *leans*
and 4 *heavy*; Sunlight is the most even (0.25) and Uno the most unbalanced (17.76).

Until 2026-11-19 the rule counted every press, a thumb's included, and with Space on the space bar
too: 14 were *even*, 13 *leans* and 8 *heavy* with Space off, and 21 *heavy* with it on, the space
bar putting about one press in six on one thumb. A letter or a one-shot key on a thumb then decided
the band: Ben Vallack Piano read 18.33 and RSTHD 12.80, both *heavy*, where their fingers split 4.84
and 1.25. The other way, Night read 0.97 with the `r` on its left thumb evening out fingers that
lean right, 46-54, and now reads 7.67, *leans*.

| Layout | Left–right | \|L − R\| | Band |
|---|---|---|---|
| Sunlight | 50.13–49.87 | 0.25 | even |
| Aptmak | 50.52–49.48 | 1.05 | even |
| Nerps | 49.38–50.62 | 1.24 | even |
| RSTHD | 50.62–49.38 | 1.25 | even |
| Enthium | 49.28–50.72 | 1.45 | even |
| Hands Down Promethium | 50.84–49.16 | 1.67 | even |
| Bird 30 | 49.03–50.97 | 1.93 | even |
| Graphite | 48.99–51.01 | 2.01 | even |
| T-34 | 51.03–48.96 | 2.08 | even |
| Finch | 48.75–51.25 | 2.50 | even |
| Gallium | 48.70–51.30 | 2.60 | even |
| Focal | 51.37–48.63 | 2.74 | even |
| Bird | 48.48–51.52 | 3.03 | even |
| Hands Down Vibranium | 48.41–51.59 | 3.18 | even |
| SNTH | 48.34–51.66 | 3.31 | even |
| Engram | 48.34–51.66 | 3.33 | even |
| Hands Down Gold | 48.33–51.67 | 3.34 | even |
| Nordrassil | 51.71–48.29 | 3.41 | even |
| Cem Aksoylar's Colemak-DH | 48.04–51.96 | 3.92 | even |
| Colemak | 47.88–52.12 | 4.24 | even |
| Colemak-DH | 47.88–52.12 | 4.24 | even |
| Ben Vallack Piano | 47.58–52.42 | 4.84 | even |
| Hands Down Neu | 52.62–47.38 | 5.24 | leans |
| Recurva | 47.11–52.89 | 5.78 | leans |
| APTv3 | 47.04–52.96 | 5.91 | leans |
| Night | 46.17–53.83 | 7.67 | leans |
| Dusk | 45.40–54.60 | 9.19 | leans |
| Dvorak | 44.92–55.08 | 10.15 | leans |
| Romak | 44.84–55.16 | 10.32 | leans |
| Sturdy | 44.65–55.35 | 10.71 | leans |
| Magic Romak | 44.60–55.40 | 10.80 | leans |
| Magic Sturdy | 44.26–55.74 | 11.48 | heavy |
| Canary | 43.84–56.16 | 12.33 | heavy |
| Qwerty | 57.44–42.56 | 14.88 | heavy |
| Uno | 58.88–41.12 | 17.76 | heavy |

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
