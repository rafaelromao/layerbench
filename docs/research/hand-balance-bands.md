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
  to "Heavy right 41 – 59", and none of its 87 labelled rows contradicts the sentence: *even* is
  printed 48–52 and nothing outside it, *leans* 53–55 on the heavier side, *heavy* 56 and up (the
  shares are printed rounded, so a few rows sum to 101).

So there is no ambiguity about what a split is: 52-48 is not a difference of 52 and 48. The rule's
value is `|left − right|` in points (`per_hand` in `rules/engine.ts`, `METRICS.md`), so the Doc's two
splits are **4** and **10**. The old bounds were half of that, as if they had been `|left − 50|`.

## What changed

| | Bounds (`\|left − right\|`) | Labels |
|---|---|---|
| Before | 2 · 5 · 8 | even · leans · heavy · very heavy |
| After | 4 · 10 (`HAND_EVEN_BOUND`, `HAND_LEANS_BOUND`) | even · leans · heavy |

A value falls in the first category it does not exceed, as for every band, so 52-48 and 55-45 are
still *even* and *leans*. The Doc prints whole numbers, so it does not say where a 52.4-47.6 split
goes; the bounds are taken exactly as it writes them.

**`very_heavy` is dropped, not renamed.** The Doc names no category above *heavy*, and `very heavy`
was LayerBench's. The metrics whose rows stop at a dash (SFB, SFS, scissors, redirects, pinky off)
leave a range the Doc never named, and what is past it needs a name that does not borrow the next
word of the Doc's nine. Here nothing is left unnamed: *heavy* is the Doc's own word for everything
past 55-45, so it stays the last category and takes any split, 100-0 included. The colours follow the
categories: *even* is green, *leans* amber and *heavy* red, where *leans* was green and *heavy* amber.

## Effect on the bundled layouts

Measured with `analyze` on the Library's settings (English news, 100,000 letters, fold, no space,
cyanophage-like rules; hand balance is the same on the Layouts Doc rules). 28 of the 36 bundled layouts
change band; the values do not move.

| | even | leans | heavy | very heavy |
|---|---|---|---|---|
| Before | 5 | 9 | 6 | 16 |
| After | 11 | 15 | 10 | (none) |

| Layout | Left–right | \|L − R\| | Before | After |
|---|---|---|---|---|
| Nordwind | 49.87–50.13 | 0.26 | even | even |
| Colemak | 48.82–51.18 | 2.37 | leans | even |
| Focal | 51.83–48.17 | 3.66 | leans | even |
| Recurva | 48.05–51.95 | 3.91 | leans | even |
| Cem Aksoylar's Colemak-DH | 47.91–52.09 | 4.19 | leans | leans |
| Hands Down Gold | 52.85–47.15 | 5.70 | heavy | leans |
| Enthium | 46.20–53.80 | 7.59 | heavy | leans |
| Dvorak | 45.93–54.07 | 8.14 | very heavy | leans |
| Romak | 45.85–54.15 | 8.29 | very heavy | leans |
| Sturdy | 45.09–54.91 | 9.81 | very heavy | leans |
| Canary | 44.59–55.41 | 10.82 | very heavy | heavy |
| Magic Romak | 43.06–56.94 | 13.88 | very heavy | heavy |
| Qwerty | 58.07–41.93 | 16.14 | very heavy | heavy |

## What it does not do

The value is a difference, so the Doc's *leans left* and *leans right* are one band; which hand is
heavier is on the card, in the two shares, not in its badge.
