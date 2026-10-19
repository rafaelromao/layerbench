# Accents layer: a new arrangement

Research for the Accents default layer (`ACCENTS` and `ACCENTS_NO_BOTTOM` in
`packages/core/src/layouts/templates.ts`). The goals, in order:

1. The essential keys stay on the 24-key core, so every board types every letter.
2. The most used keys sit on the cheapest positions.
3. Similar keys sit in groups that are easy to memorize.
4. Same-finger bigrams (SFBs) are spread fairly, so most layouts aren't penalized. Every layout has the
   same Accents layer, or its left-right mirror.
5. The symbol no layout can type gets a key.

## Method

Everything is measured with the engine. `analyze` runs headless on the default analysis settings: the
cyanophage rule set, fold, letters, 100,000 symbols and no space, on each of the six bundled texts
(`en`, `pt-br`, `es`, `fr`, `it`, `de` `-general`). Substituting main's own `ACCENTS` into every layout
gives the same Effort, SFB and Accents SFB as the unmodified layouts, to the last digit.

- **Uses per key.** Presses on each Accents key, summed over the six texts, typed on Qwerty, as
  PR #36 counted them.
- **Cost.** The Effort rule's cost of each position (`defaultEffort`). On a 3×5 board, per hand:

  |        | pinky | ring | middle | index | inner |
  |--------|-------|------|--------|-------|-------|
  | top    | 3     | 2    | 1      | 2     | 7     |
  | home   | 1     | 0    | 0      | 0     | 5     |
  | bottom | 3     | 2    | 2      | 1     | 8     |

  The 24-key core is the ring, middle and index columns plus the pinky's home key: 20 finger keys.
  **Weighted cost** is Σ uses × position cost.
- **Accents SFBs.** The `sfb` rule's pairs (with `top_items` raised so none is cut) in which either
  press is on Accents, as a percent of all bigrams. One finger pressing an Accents key next to the
  letter before or after it. On the LHR+LHM combo layouts this includes the combo itself followed by a
  key on the left ring or middle finger.
  - *mix*: the mean over the six texts, the same for every layout.
  - *own*: the mean over the layout's own languages. Every bundled layout but Romak and Magic Romak
    declares English alone, where Accents is almost only `qu`, so *own* hides the differences.
- **Search.** For a given layout, the presses next to an Accents key don't depend on where the key
  is. So each layout's Accents SFBs add up key by key, from one engine run per layout and text. That
  model reproduces the engine's Accents SFB count exactly on main's grid. A simulated-annealing search
  over placements used it, with the core rule as a hard constraint and the mnemonic rules as
  penalties. Every number below comes from the engine run on the finished grids, in both
  orientations, on all 35 bundled layouts.
- **Headline change.** The Effort and SFB the Library shows, per layout, against main. Given as the
  mean over the six texts, and on English, the Library's default text.

Two things only the search could show:

- **The combo fingers matter most.** Seven layouts (Bird, Caksoylar, T-34, Magic Sturdy, Uno,
  Nordrassil and Finch), plus Ben Vallack Piano, reach Accents with LHR+LHM. Any key on the left ring
  or middle column is then a same-finger pair with the combo, every time it's used. On main, `á` and
  `à` sit on LHM and LHR, which is why those layouts are the worst (0.47–0.94%). Keeping the used keys
  off those two columns does more for fairness than anything else.
- **The rest depends on the vowels.** On the thumb-reached layouts, the SFB is the Accents key and the
  letter after it (`qu`→vowel, `ã`→`o`, `é`→consonant). Most bundled layouts type their vowels with the
  right hand. Dvorak, Engram, Enthium, Nordrassil and Uno type them with the left.

## The symbol no layout types: `ı`

Over the six bundled texts, every bundled layout leaves exactly one character untyped: **`ı`**
(U+0131, Turkish dotless i), from Turkish names in the English news ("Sakallı", "Bahçıvan").

| text | in the 100k-symbol sample | in the whole sample file |
|---|---|---|
| en-general | 1 | 2 |
| pt-br, es, fr, it, de | 0 | 0 |

It's a letter of its own: no dead key makes it. So it counts as essential and goes on the core, as a
`kp`. Once it's on Accents, every layout types it (checked with the engine's coverage; the analysis's
missing characters are then empty on all six texts). Finch's 7 untyped `q` in English are a separate,
older issue.

On the 18-key board every Accents key is taken, so `ı` takes `ª`'s thumb key there, and `ª` moves to
Extras' free left outer thumb (L0, unused on that layer).

## Uses per key (six texts, summed)

| key | uses | key | uses | key | uses |
|---|---|---|---|---|---|
| é | 3345 | ç | 635 | ô | 93 |
| qu | 3114 | ä | 511 | ì | 46 |
| ó | 1026 | ê | 303 | ò | 39 |
| á | 905 | ö | 277 | î | 28 |
| ã | 851 | ú | 238 | â | 27 |
| à | 748 | ñ | 174 | ¨ | 20 |
| í | 747 | ß | 129 | ^ | 16 |
| ü | 671 | õ | 114 | œ | 9 |
| è | 661 | ù | 97 | ı | 1 |

`´ \` ~ æ` are never pressed on a full board: each accented letter has its own key. They matter on
boards without the outer keys, where the dead keys type what the missing keys would.

**Thirty keys, thirty-one candidates.** A 3×5 board has 30 positions, and `ı` makes 31 keys. Every
candidate drops `â` (27 uses), the least used, which `^` then `a` still types. The core holds 20
finger keys. Eleven of them go to the essentials: the five dead keys and `ç ñ ß œ æ ı`.

## Candidates

The grids are drawn as the board: left hand pinky→inner, then right hand inner→pinky. `↔` marks a
mirrored layout in the tables.

### A — frequency first

```
ê  ı  ß  æ  ô  |  ò  ´  ü  ¨  ä
ç  ã  í  ó  õ  |  ù  á  qu é  à
ú  `  œ  è  î  |  ì  ñ  ~  ^  ö
```

**Rule:** each key is on the cheapest key its use earns, with the essentials on the core; among keys
of equal cost, the SFB search decides. No grouping to speak of. A′, a hand-made variant with the
three a's on the left home row and each dead key beside a letter it makes, costs the same but has
more SFBs (in the tables).

### B — left hand makes letters, right hand types vowels (recommended)

```
ú  ´  `  ¨  î  |  ù  à  è  ı  ä
ß  ^  ~  qu ô  |  õ  á  é  í  ó
ê  æ  œ  ç  ò  |  ì  ã  ñ  ü  ö
```

Mirror:

```
ä  ı  è  à  ù  |  î  ¨  `  ´  ú
ó  í  é  á  õ  |  ô  qu ~  ^  ß
ö  ü  ñ  ã  ì  |  ò  ç  œ  æ  ê
```

**Rule:** the left hand makes letters: the dead keys under the two fingers that press the combo
(`´ \`` above, `^ ~` on home), the ligatures `æ œ` below them, `¨ qu ç` down the index and `ß` on the
pinky. The right hand types the accented vowels: `á é í ó` along its home row from the index, each
grave or dot-variant above its acute (`à è ı`), and the a's down the index column (`à á ã`).

This grouping falls out of the core rule. The left core holds exactly the ten keys that make
letters, and the right core holds the eight most used vowels plus `ñ` and `ı`. The keys on the
combo fingers are never pressed on a full board, so the combo layouts lose their SFBs. The leftover
letters (`ú î ô ê ò`, `ù õ ì`) are on the outer keys.

### C — the same split, laid out for SFBs

```
ú  `  œ  ¨  ô  |  î  ñ  ó  ı  ä
ç  ´  ^  qu ù  |  õ  ã  á  é  í
ê  ~  æ  ß  ì  |  ò  à  è  ü  ö
```

**Rule:** B's split (left makes letters, right types vowels), with each side arranged by the SFB
search instead of by groups.

### D — SFB-fair first

```
ú  ~  æ  ´  ô  |  î  ¨  á  ñ  ä
í  ^  œ  qu ù  |  õ  ã  ü  é  ó
ê  ı  `  è  ì  |  ò  ç  à  ß  ö
```

**Rule:** none. Laid out for the lowest and most even Accents SFBs, with the mean plus twice the max
weighted against cost.

## Results

| | weighted cost | vs main | Accents SFB, one orientation (mean / max) | by SFB (mean / max, mirrored) | by rule (mean / max, mirrored) | ΔEffort mix (mean, range) | ΔSFB mix (mean, range) | ΔEffort English (mean) |
|---|---|---|---|---|---|---|---|---|
| main | 11755 | — | 0.392 / 0.935 | — | — | — | — | — |
| A′ | 9660 | −17.8% | 0.215 / 0.737 | 0.205 / 0.737, 4 | 0.221 / 0.737, 4 | −1.52 (−4.89 … +1.02) | −0.13 (−0.39 … +0.15) | −0.45 |
| A | 9668 | −17.8% | 0.153 / 0.463 | 0.146 / 0.463, 10 | 0.166 / 0.766, 4 | −1.46 (−4.88 … +1.02) | −0.17 (−0.42 … +0.00) | −0.45 |
| B | 13125 | +11.7% | 0.087 / 0.263 | 0.075 / 0.205, 4 | 0.080 / 0.230, 4 | +1.05 (−2.13 … +3.64) | −0.21 (−0.54 … +0.00) | −0.44 |
| C | 12917 | +9.9% | 0.067 / 0.275 | 0.052 / 0.171, 6 | 0.057 / 0.236, 4 | +0.88 (−2.30 … +3.47) | −0.23 (−0.55 … +0.00) | −0.44 |
| D | 12687 | +7.9% | 0.073 / 0.265 | 0.061 / 0.132, 7 | 0.068 / 0.265, 4 | +0.69 (−2.51 … +3.26) | −0.22 (−0.55 … +0.00) | −0.45 |

Notes on the summary:

- **Weighted cost** is against main's 11,755, `â` included there.
- **One orientation** means every layout gets the grid as drawn.
- **By SFB** means each layout takes whichever orientation has fewer Accents SFBs on the mix.
- **By rule** means a layout is mirrored when its base layer types most of its vowel frequency with
  the left hand and Accents is reached by a thumb: Qwerty, Dvorak, Engram and Enthium.
- **ΔEffort** and **ΔSFB** are the Library's headline numbers against main, using the by-SFB
  orientation.
- **English Effort** drops by about 0.44 on every layout and every candidate, because `qu` moves from
  the middle finger's top key to a home key.

### Accents SFBs per layout (mix, each candidate by SFB orientation)

| layout | access | vowels right | main | A′ | A | B | C | D |
|---|---|---|---|---|---|---|---|---|
| magic-romak | thumb | 1.00 | 0.000 | 0.000 | 0.000 | 0.000 | 0.001 ↔ | 0.002 ↔ |
| romak | thumb | 1.00 | 0.167 | 0.122 | 0.082 | 0.073 | 0.031 | 0.052 |
| qwerty | thumb | 0.45 | 0.279 | 0.200 | 0.205 | 0.061 | 0.029 ↔ | 0.035 ↔ |
| dvorak | thumb | 0.00 | 0.137 | 0.074 ↔ | 0.074 ↔ | 0.037 ↔ | 0.032 ↔ | 0.063 ↔ |
| colemak | thumb | 0.79 | 0.512 | 0.123 | 0.070 | 0.039 | 0.032 | 0.035 |
| colemak-dh | thumb | 0.79 | 0.520 | 0.132 | 0.072 | 0.039 | 0.032 | 0.037 |
| graphite | thumb | 1.00 | 0.160 | 0.092 | 0.088 ↔ | 0.079 | 0.035 | 0.073 |
| gallium | thumb | 1.00 | 0.182 | 0.114 | 0.088 ↔ | 0.075 | 0.033 | 0.077 |
| canary | thumb | 1.00 | 0.503 | 0.110 | 0.069 | 0.052 | 0.034 | 0.039 |
| sturdy | thumb | 1.00 | 0.161 | 0.083 | 0.075 | 0.068 | 0.028 | 0.046 |
| aptv3 | thumb | 1.00 | 0.663 | 0.081 | 0.047 | 0.035 | 0.019 | 0.031 |
| hands-down-neu | thumb | 1.00 | 0.495 | 0.090 | 0.089 | 0.050 | 0.058 | 0.070 |
| night | thumb | 1.00 | 0.195 | 0.108 | 0.093 ↔ | 0.087 | 0.045 | 0.073 |
| dusk | thumb | 1.00 | 0.194 | 0.124 | 0.073 | 0.090 | 0.044 | 0.063 |
| recurva | thumb | 1.00 | 0.685 | 0.111 | 0.063 | 0.040 | 0.029 | 0.043 |
| focal | thumb | 1.00 | 0.121 | 0.060 | 0.060 | 0.076 | 0.037 | 0.057 |
| nerps | thumb | 1.00 | 0.453 | 0.093 | 0.113 | 0.068 | 0.044 | 0.068 |
| engram | thumb | 0.00 | 0.190 | 0.090 ↔ | 0.086 ↔ | 0.072 ↔ | 0.054 ↔ | 0.076 ↔ |
| sunlight | thumb | 1.00 | 0.482 | 0.077 | 0.062 ↔ | 0.147 ↔ | 0.072 ↔ | 0.069 ↔ |
| snth | thumb | 1.00 | 0.165 | 0.097 | 0.079 ↔ | 0.066 | 0.024 | 0.054 |
| aptmak | thumb | 1.00 | 0.178 | 0.111 | 0.035 | 0.043 | 0.022 | 0.025 |
| bird | combo | 1.00 | 0.893 | 0.630 | 0.414 | 0.148 | 0.118 | 0.119 |
| bird-30 | thumb | 1.00 | 0.481 | 0.082 | 0.060 | 0.051 | 0.028 | 0.032 |
| hands-down-gold | thumb | 1.00 | 0.488 | 0.080 | 0.073 | 0.040 | 0.047 | 0.058 |
| hands-down-promethium | thumb | 1.00 | 0.488 | 0.102 | 0.085 ↔ | 0.049 | 0.055 | 0.074 ↔ |
| hands-down-vibranium | thumb | 1.00 | 0.515 | 0.097 | 0.092 ↔ | 0.077 | 0.083 | 0.076 ↔ |
| rsthd | thumb | 0.67 | 0.180 | 0.106 | 0.032 | 0.046 | 0.018 | 0.016 |
| t-34 | combo | 1.00 | 0.472 | 0.498 ↔ | 0.397 | 0.064 | 0.021 | 0.026 |
| magic-sturdy | combo | 1.00 | 0.599 | 0.551 | 0.417 | 0.054 | 0.047 | 0.067 |
| enthium | thumb | 0.00 | 0.132 | 0.072 ↔ | 0.083 ↔ | 0.106 ↔ | 0.073 ↔ | 0.077 |
| nordrassil | combo | 0.00 | 0.640 | 0.722 | 0.463 | 0.146 | 0.106 | 0.085 |
| finch | combo | 1.00 | 0.494 | 0.645 | 0.429 | 0.205 | 0.171 | 0.132 |
| caksoylar | combo | 0.79 | 0.935 | 0.690 | 0.439 | 0.136 | 0.119 | 0.123 |
| uno | combo | 0.00 | 0.517 | 0.737 | 0.435 | 0.110 | 0.123 | 0.080 |
| ben-vallack-piano | combo | 0.82 | 0.450 | 0.078 | 0.078 | 0.078 | 0.078 | 0.078 |

### Headline change per layout (mix, by-SFB orientation)

| layout | A′ ΔEffort / ΔSFB | A ΔEffort / ΔSFB | B ΔEffort / ΔSFB | C ΔEffort / ΔSFB | D ΔEffort / ΔSFB | main Effort / SFB |
|---|---|---|---|---|---|---|
| magic-romak | −0.1 / +0.000 | −0.1 / +0.000 | −0.1 / +0.000 | −0.1 / +0.001 | −0.0 / +0.002 | 364.6 / 1.34 |
| romak | −1.6 / −0.031 | −1.6 / −0.058 | +1.1 / −0.064 | +0.9 / −0.092 | +0.7 / −0.078 | 440.1 / 1.53 |
| qwerty | −1.6 / −0.053 | −1.6 / −0.049 | +1.1 / −0.145 | +1.0 / −0.167 | +0.8 / −0.163 | 1091.3 / 5.61 |
| dvorak | −1.6 / −0.043 | −1.6 / −0.044 | +1.1 / −0.068 | +1.0 / −0.072 | +0.8 / −0.051 | 750.7 / 1.77 |
| colemak | −1.6 / −0.261 | −1.6 / −0.297 | +1.1 / −0.318 | +1.0 / −0.322 | +0.8 / −0.320 | 579.2 / 1.64 |
| colemak-dh | −1.6 / −0.261 | −1.6 / −0.301 | +1.1 / −0.323 | +1.0 / −0.327 | +0.8 / −0.324 | 527.6 / 1.64 |
| graphite | −1.6 / −0.047 | −1.6 / −0.049 | +1.1 / −0.057 | +0.9 / −0.086 | +0.7 / −0.060 | 489.7 / 1.12 |
| gallium | −1.6 / −0.046 | −1.6 / −0.063 | +1.1 / −0.074 | +0.9 / −0.102 | +0.7 / −0.072 | 539.0 / 1.08 |
| canary | −1.6 / −0.264 | −1.6 / −0.291 | +1.1 / −0.303 | +1.0 / −0.315 | +0.8 / −0.311 | 511.1 / 1.11 |
| sturdy | −1.6 / −0.052 | −1.6 / −0.058 | +1.1 / −0.063 | +0.9 / −0.090 | +0.7 / −0.077 | 518.4 / 1.02 |
| aptv3 | −1.6 / −0.390 | −1.6 / −0.413 | +1.1 / −0.421 | +0.9 / −0.432 | +0.7 / −0.424 | 506.0 / 1.57 |
| hands-down-neu | −1.7 / −0.273 | −1.7 / −0.273 | +1.1 / −0.299 | +0.9 / −0.294 | +0.7 / −0.286 | 503.2 / 1.40 |
| night | −1.6 / −0.059 | −1.6 / −0.069 | +1.1 / −0.075 | +0.9 / −0.103 | +0.7 / −0.083 | 533.0 / 1.02 |
| dusk | −1.6 / −0.048 | −1.6 / −0.083 | +1.1 / −0.072 | +0.9 / −0.103 | +0.7 / −0.090 | 484.7 / 1.09 |
| recurva | −1.6 / −0.384 | −1.6 / −0.417 | +1.1 / −0.433 | +0.9 / −0.440 | +0.7 / −0.431 | 604.1 / 1.33 |
| focal | −1.6 / −0.042 | −1.6 / −0.041 | +1.1 / −0.031 | +0.9 / −0.057 | +0.7 / −0.043 | 510.5 / 1.00 |
| nerps | −1.6 / −0.241 | −1.6 / −0.229 | +1.1 / −0.259 | +1.0 / −0.275 | +0.8 / −0.259 | 559.5 / 1.40 |
| engram | −1.6 / −0.068 | −1.6 / −0.071 | +1.1 / −0.080 | +0.9 / −0.092 | +0.7 / −0.077 | 572.5 / 2.94 |
| sunlight | −1.6 / −0.272 | −1.5 / −0.280 | +1.2 / −0.224 | +1.0 / −0.275 | +0.8 / −0.276 | 464.9 / 1.56 |
| snth | −1.6 / −0.046 | −1.6 / −0.058 | +1.1 / −0.068 | +0.9 / −0.096 | +0.7 / −0.075 | 464.8 / 1.07 |
| aptmak | −1.6 / −0.046 | −1.6 / −0.097 | +1.1 / −0.092 | +0.9 / −0.106 | +0.7 / −0.104 | 466.0 / 1.21 |
| bird | −2.0 / −0.193 | −1.7 / −0.338 | +0.1 / −0.517 | −0.2 / −0.537 | −0.5 / −0.536 | 456.1 / 2.04 |
| bird-30 | −1.6 / −0.268 | −1.6 / −0.283 | +1.1 / −0.288 | +1.0 / −0.304 | +0.8 / −0.301 | 517.3 / 1.34 |
| hands-down-gold | −1.6 / −0.274 | −1.6 / −0.279 | +1.1 / −0.301 | +0.9 / −0.296 | +0.7 / −0.289 | 459.2 / 1.17 |
| hands-down-promethium | −1.6 / −0.259 | −1.6 / −0.269 | +1.1 / −0.294 | +0.9 / −0.291 | +0.7 / −0.277 | 447.8 / 1.29 |
| hands-down-vibranium | −1.6 / −0.281 | −1.6 / −0.284 | +1.1 / −0.295 | +0.9 / −0.290 | +0.7 / −0.295 | 458.5 / 1.24 |
| rsthd | −1.6 / −0.050 | −1.6 / −0.100 | +1.1 / −0.091 | +0.9 / −0.109 | +0.7 / −0.111 | 604.3 / 1.27 |
| t-34 | +0.9 / +0.022 | +0.9 / −0.051 | +3.6 / −0.274 | +3.5 / −0.303 | +3.3 / −0.300 | 560.1 / 1.39 |
| magic-sturdy | −4.9 / −0.031 | −4.9 / −0.120 | −2.1 / −0.364 | −2.3 / −0.369 | −2.5 / −0.355 | 533.2 / 1.63 |
| enthium | −1.6 / −0.041 | −1.6 / −0.033 | +1.1 / −0.019 | +0.9 / −0.040 | +0.7 / −0.037 | 427.9 / 1.19 |
| nordrassil | −1.6 / +0.058 | −1.6 / −0.116 | +1.1 / −0.331 | +0.9 / −0.358 | +0.7 / −0.371 | 451.0 / 1.70 |
| finch | +0.7 / +0.101 | +0.8 / −0.045 | +2.9 / −0.195 | +2.3 / −0.219 | +2.5 / −0.244 | 507.6 / 1.48 |
| caksoylar | −2.0 / −0.165 | −1.7 / −0.334 | +0.2 / −0.537 | −0.1 / −0.549 | −0.3 / −0.546 | 533.4 / 2.24 |
| uno | −2.3 / +0.146 | −1.6 / −0.055 | +1.1 / −0.273 | +0.9 / −0.263 | +0.7 / −0.293 | 569.3 / 2.15 |
| ben-vallack-piano | +1.0 / −0.252 | +1.0 / −0.252 | +1.0 / −0.252 | +1.0 / −0.252 | +1.0 / −0.252 | 402.9 / 1.97 |

### On each layout's own languages

| | Accents SFB on each layout's own languages (mean / max) |
|---|---|
| main | 0.034 / 0.126 (romak, dusk) |
| A′ | 0.005 / 0.071 (romak, qwerty) |
| A | 0.004 / 0.082 (romak, qwerty) |
| B | 0.001 / 0.026 (romak, sunlight) |
| C | 0.001 / 0.019 (romak, canary) |
| D | 0.001 / 0.019 (romak, magic-sturdy) |

## U: rows by accent, columns by vowel (proposed in review)

```
æ  œ  qu ß  `  |  ù  à  è  ò  ì
ñ  ö  ü  ä  ´  |  ú  á  é  ó  í
¨  õ  ç  ã  ~  |  ^  â  ê  ô  î
```

**Rule:** on the right, each row is an accent (grave, acute, circumflex) and each column a vowel (u,
a, e, o, i), with that row's dead key at its inner end. On the left, the German letters are on home,
the tilde letters on the bottom, and the ligatures with `qu` and `ß` on top.

| | weighted cost | Accents SFB, one orientation (mean / max) | by SFB (mean / max) | ΔEffort mix | ΔSFB mix (mean, worst) | ΔEffort English |
|---|---|---|---|---|---|---|
| B | 13125 | 0.087 / 0.263 | 0.075 / 0.205 | +1.05 | −0.21, ±0 | −0.44 |
| U | 11993 | 0.288 / 1.679 | 0.236 / 1.200 | +0.06 | −0.07, +0.71 | −0.02 |
| U2 | 17854 | 0.110 / 0.348 | 0.095 / 0.348 | +4.53 | −0.19, ±0 | −0.44 |

- **It breaks the core rule.** `` ` ´ ~ ^ `` sit on the inner column and `¨ æ` on the pinky's top
  and bottom. On the boards that lack those keys, the language coverage loses letters: Bird and
  Caksoylar can't write French `ë ï ù ÿ` or Italian `ù`, and Finch also loses Italian `ì`. It also
  has no key for `ı`.
- **The combo layouts lose most.** `qu`, `ö`, `ü`, `õ` and `ç` sit on the left ring and middle
  columns, the combo's fingers. Nordrassil's Accents SFB is 1.68%, and its SFB rises 0.71 against
  main. Mirroring doesn't help, because the right hand's vowels then land on the same fingers.
- **U2 keeps U's right hand and respects the core.** `^` takes `â`'s place and `` ` `` takes `ò`'s
  (each dead key then types the letter it replaced), and `ò` moves to the inner bottom key. The left
  core can then hold only the keys that make letters plus `qu`, so the German and tilde letters go
  to the outer keys. That costs 52% more than main.

  ```
  ü  œ  æ  ß  ö  |  ù  à  è  `  ì
  ñ  ¨  ´  qu ã  |  ú  á  é  ó  í
  ä  ı  ~  ç  õ  |  ò  ^  ê  ô  î
  ```

## The board with no bottom row

Ben Vallack Piano's 1222+2 board has 14 finger keys and 4 thumbs, and no room for macros. Its Accents
holds only what no other layer has: the dead keys, the letters of their own, and the symbols Extras
can't fit. Two choices were measured:

- **Following the full grid** (each essential where the candidate puts it, if the board has that
  key): Effort +5.5 to +14.1. On this board the dead keys type every accent (`´` 6,262 times), and the
  full grids put them on the combo fingers.
- **By use, off the combo fingers** (used by every candidate in the tables above):

  ```
     §  ¡  œ  |  ß  ñ  ¿
  ^  ı  æ  ~  |  ´  `  ¨  ç
        £  °  |  º  €
  ```

  The most used dead keys go on the right home keys and the unused keys on the combo fingers. Effort
  402.9 → 403.9, SFB 1.97 → 1.72, Accents SFB 0.45 → 0.08.

## Mirroring

Mirroring helps much less than expected once the used keys are off the combo fingers. For B, the
mean goes 0.087 → 0.075 (by SFB) or 0.080 (by rule), and the max 0.263 → 0.205 or 0.230. The layouts
it helps are the left-vowel thumb layouts (Dvorak, Engram, Enthium) and Sunlight.

A combo layout must never be mirrored. That would put the right hand's vowels on the combo fingers:
Nordrassil and Uno have left-hand vowels, but each gets worse mirrored.

If mirroring is adopted, a layout needs an `accents: 'mirrored'` choice that `withDefaultLayers`
reads. For a new layout, the default can follow the rule above: mirror when the base layer's vowels
are on the left and Accents is reached by a thumb. Every bundled layout can store the engine's pick.

## Recommendation

**B**, in one orientation for every layout.

- It's the only candidate with a rule you can say in a sentence and see on the board. It falls out
  of the 24-key core rule itself.
- Accents SFBs fall from main's mean 0.392% / max 0.935% to 0.087% / 0.263%. The combo layouts drop
  the most, for example Caksoylar 0.935 → 0.136 and Bird 0.893 → 0.148.
- The Library's SFB improves or stays level on every layout.
- Effort rises 1.05 on average over the six texts (at most +3.6, on T-34). In English it falls 0.44
  on every layout. This is the price of the mnemonic: B costs 11.7% more than main by weighted cost,
  where A costs 17.8% less.
- Mirroring by rule would take B's worst case from 0.263 to 0.230. That gain may not be worth a
  layout-format field.
- Ben Vallack Piano gets the by-use 18-key arrangement, with `ı` on it and `ª` moving to Extras.

A is the pick if Effort matters most. It still halves main's Accents SFBs, but the combo layouts keep
0.41–0.46%. D is the pick if fairness is all that matters (max 0.132 by SFB). It has no rule to
memorize.

### Decisions this asks for

- **`â` leaves the layer.** It's the least used letter; `^` then `a` still types it.
- **`qu` returns to a home key.** That ends PR #36's exception, which traded `qu` with `ê` to keep
  the home rows for accented letters. In B, `qu` sits on the left index's home key, among the keys
  that make letters, and no accented letter loses a home key to it.
- **Mirroring or not**, and if so, by rule or by each layout's measured SFBs.
- **On the 18-key board**, follow the full grid or arrange by use.

## Second round: 30 keys, a thumb combo, Extras, and `ı` on Symbols

After review, the rules changed:

- **The 30 main keys, not the 24-key core.** The dead keys may leave the core. Accents' 30 keys
  hold the 30 most-used keys, `â` among them.
- **Extras for the keys a board lacks.** On Bird, Caksoylar, Finch and Magic Romak, each Accents
  key whose position the board doesn't have goes on Extras (on while Numbers and Symbols are both
  held). It lands on the free key nearest its Accents position, on the same hand first, and then on
  a thumb not holding Numbers or Symbols. Bird, Caksoylar and Finch already have Extras.
- **No LHR+LHM combo.** The special layouts' thumbs all type something, so Accents takes a thumb
  combo instead: the two outer thumbs, L1+R1, where the board has them, and the inner pair on Finch.
  The outer pair keeps clear of holding both inner thumbs for Extras. Two thumbs pressed together
  never form a same-finger pair with a finger key.
- **`ı` on Symbols,** on the right inner top key above `¿` and `¡`. A board without that key gets it
  on Extras.

Every number below is the engine's, with all four changes applied. `main+thumbs` is main's grid with
only the thumb combo and `ı`, so the access change can be told apart from the grid change.

**The thumb combo costs Effort.** The Effort rule charges every thumb press, so a two-thumb chord
costs 2 per accent. LHR+LHM on home keys cost 0, and a Standard layout's one-shot costs 1. On the
special layouts that's +19 to +24 Effort on the six-language mix, whatever the grid. In exchange their
SFB drops 0.3–0.8, on all but Uno (+0.11). The ΔEffort column below includes that rise, and the
special layouts are the top of every range.

### Candidates

**U — your grid.** On the right, a row per accent (grave, acute, circumflex, with `^` where `û` would
be) and a column per vowel (u a e o i). On the left, the German letters on home, the tilde letters
with `ç` on the bottom, and the ligatures with `qu` and `ß` on top. `` ` ``, `´` and `~` sit at the
inner end of the rows next to their letters.

```
æ  œ  qu ß  `  |  ù  à  è  ò  ì
ñ  ö  ü  ä  ´  |  ú  á  é  ó  í
¨  õ  ç  ã  ~  |  ^  â  ê  ô  î
```

**U\* — U's rule, the search's order within the rows.** The right hand is unchanged. On the left, the
top row reads `` ` ß qu œ æ `` and the home row `ö ä ü ñ ´`.

```
`  ß  qu œ  æ  |  ù  à  è  ò  ì
ö  ä  ü  ñ  ´  |  ú  á  é  ó  í
¨  õ  ç  ã  ~  |  ^  â  ê  ô  î
```

**A — frequency first.** No grouping.

```
ì  â  à  ß  ´  |  æ  ù  ü  ñ  î
ê  ó  ã  qu œ  |  ^  á  é  í  ä
ò  õ  ö  è  ~  |  `  ç  ú  ô  ¨
```

**C — SFB-fair first.** No grouping.

```
^  õ  ç  ¨  æ  |  ´  ù  ü  ö  ô
ä  qu á  ã  œ  |  â  í  ó  é  è
î  ì  ò  ñ  `  |  ~  à  ú  ê  ß
```

Weighted cost (Σ uses × position cost): main 11,755; U 11,993; U\* 12,096; A 6,351; C 6,646. Main's
number is high because the first round's core rule held the five dead keys and `ç ñ ß œ æ` on the
core.

### Results

| | Accents SFB, one orientation (mean / max) | by SFB (mean / max, mirrored) | by vowel hand (mean / max, mirrored) | ΔEffort mix vs main (mean, range) | ΔSFB mix vs main (mean, range) | ΔEffort English | letters lost |
|---|---|---|---|---|---|---|---|
| main | 0.392 / 0.935 | — | — | ±0.00 (±0.0 … ±0.0) | ±0.00 (±0.0 … ±0.0) | ±0.00 | none |
| main+thumbs | 0.305 / 0.685 | — | — | +5.01 (+0.0 … +23.9) | −0.12 (−0.8 … +0.1) | +0.20 | none |
| U | 0.106 / 0.581 | 0.052 / 0.109, 6 | 0.055 / 0.218, 6 | +5.07 (−0.0 … +24.0) | −0.29 (−1.0 … +0.0) | +0.18 | none |
| U* | 0.098 / 0.580 | 0.044 / 0.078, 5 | 0.047 / 0.175, 6 | +5.17 (+0.0 … +24.3) | −0.29 (−1.0 … +0.0) | +0.17 | none |
| A | 0.080 / 0.303 | 0.057 / 0.091, 5 | 0.061 / 0.178, 6 | +1.03 (−4.4 … +20.0) | −0.28 (−1.0 … +0.1) | −0.25 | none |
| C | 0.041 / 0.238 | 0.025 / 0.078, 5 | 0.026 / 0.078, 6 | +1.21 (−4.2 … +20.0) | −0.31 (−1.0 … +0.0) | −0.26 | none |

Notes on the summary:

- **By SFB** means each layout takes whichever orientation has fewer Accents SFBs.
- **By vowel hand** mirrors a layout when its base layer types under half of its vowel frequency with
  the right hand, which takes in Qwerty (45%).
- **Letters lost** is the language-coverage check on every layout for pt-BR, es, fr, it and de. With
  Extras, none is lost.

For U\* and C, choosing by SFB mirrors exactly the five layouts that type all their vowels with the
left hand: Dvorak, Engram, Enthium, Nordrassil and Uno. So the fixed rule "mirror when the base layer
types no vowel with the right hand" gives the engine's choice, at mean 0.044 / max 0.078 for U\*.

#### Accents SFBs per layout (mix, by-SFB orientation)

| layout | vowels right | main | main+thumbs | U | U* | A | C |
|---|---|---|---|---|---|---|---|
| magic-romak | 1.00 | 0.000 | 0.000 | 0.000 ↔ | 0.001 | 0.000 ↔ | 0.000 |
| romak | 1.00 | 0.167 | 0.167 | 0.058 | 0.054 | 0.051 | 0.027 |
| qwerty | 0.45 | 0.279 | 0.279 | 0.109 | 0.075 | 0.091 | 0.036 |
| dvorak | 0.00 | 0.137 | 0.137 | 0.058 ↔ | 0.048 ↔ | 0.069 ↔ | 0.029 ↔ |
| colemak | 0.79 | 0.512 | 0.512 | 0.074 | 0.063 | 0.055 | 0.023 |
| colemak-dh | 0.79 | 0.520 | 0.520 | 0.070 | 0.059 | 0.057 | 0.023 |
| graphite | 1.00 | 0.160 | 0.161 | 0.036 | 0.027 | 0.065 | 0.022 |
| gallium | 1.00 | 0.182 | 0.182 | 0.032 | 0.022 | 0.058 | 0.021 |
| canary | 1.00 | 0.503 | 0.503 | 0.042 | 0.031 | 0.043 | 0.026 |
| sturdy | 1.00 | 0.161 | 0.161 | 0.059 | 0.051 | 0.044 | 0.020 |
| aptv3 | 1.00 | 0.663 | 0.663 | 0.066 | 0.061 | 0.060 | 0.022 |
| hands-down-neu | 1.00 | 0.495 | 0.495 | 0.043 | 0.035 | 0.076 | 0.021 |
| night | 1.00 | 0.195 | 0.195 | 0.035 | 0.030 | 0.040 | 0.025 |
| dusk | 1.00 | 0.194 | 0.194 | 0.039 | 0.036 | 0.027 | 0.019 |
| recurva | 1.00 | 0.685 | 0.685 | 0.055 | 0.052 | 0.063 | 0.025 |
| focal | 1.00 | 0.121 | 0.121 | 0.052 | 0.043 | 0.060 | 0.016 |
| nerps | 1.00 | 0.453 | 0.453 | 0.049 | 0.043 | 0.066 | 0.026 |
| engram | 0.00 | 0.190 | 0.190 | 0.074 ↔ | 0.039 ↔ | 0.079 ↔ | 0.017 ↔ |
| sunlight | 1.00 | 0.482 | 0.482 | 0.047 | 0.043 | 0.072 | 0.025 |
| snth | 1.00 | 0.165 | 0.165 | 0.030 | 0.026 | 0.036 | 0.019 |
| aptmak | 1.00 | 0.178 | 0.178 | 0.065 | 0.063 | 0.039 | 0.025 |
| bird | 1.00 | 0.893 | 0.487 | 0.046 | 0.037 | 0.047 | 0.028 |
| bird-30 | 1.00 | 0.481 | 0.481 | 0.047 | 0.038 | 0.051 | 0.029 |
| hands-down-gold | 1.00 | 0.488 | 0.488 | 0.042 | 0.033 | 0.069 | 0.021 |
| hands-down-promethium | 1.00 | 0.488 | 0.488 | 0.035 | 0.031 | 0.069 | 0.024 |
| hands-down-vibranium | 1.00 | 0.515 | 0.515 | 0.037 | 0.027 | 0.079 | 0.022 |
| rsthd | 0.67 | 0.180 | 0.180 | 0.067 | 0.059 | 0.044 | 0.021 |
| t-34 | 1.00 | 0.472 | 0.091 | 0.053 | 0.045 | 0.029 | 0.016 |
| magic-sturdy | 1.00 | 0.599 | 0.217 | 0.063 | 0.055 | 0.070 | 0.026 |
| enthium | 0.00 | 0.132 | 0.132 | 0.036 ↔ | 0.032 ↔ | 0.036 ↔ | 0.025 ↔ |
| nordrassil | 0.00 | 0.640 | 0.257 | 0.060 ↔ | 0.053 ↔ | 0.083 ↔ | 0.033 ↔ |
| finch | 1.00 | 0.494 | 0.089 | 0.052 | 0.045 | 0.058 | 0.038 |
| caksoylar | 0.79 | 0.935 | 0.529 | 0.074 | 0.063 | 0.058 | 0.028 |
| uno | 0.00 | 0.517 | 0.135 | 0.041 ↔ | 0.038 ↔ | 0.085 | 0.028 ↔ |
| ben-vallack-piano | 0.82 | 0.450 | 0.151 | 0.078 | 0.078 | 0.078 | 0.078 |

#### Headline change per layout against main (mix, by-SFB orientation)

| layout | main+thumbs ΔEffort / ΔSFB | U ΔEffort / ΔSFB | U* ΔEffort / ΔSFB | A ΔEffort / ΔSFB | C ΔEffort / ΔSFB | main Effort / SFB |
|---|---|---|---|---|---|---|
| magic-romak | +0.0 / +0.00 | −0.0 / +0.00 | +0.0 / +0.00 | −0.0 / +0.00 | −0.0 / −0.02 | 364.6 / 1.34 |
| romak | +0.0 / ±0.00 | +0.1 / −0.07 | +0.2 / −0.08 | −4.4 / −0.08 | −4.1 / −0.09 | 440.1 / 1.53 |
| qwerty | +0.0 / ±0.00 | +0.1 / −0.11 | +0.2 / −0.14 | −4.4 / −0.13 | −4.1 / −0.16 | 1091.3 / 5.61 |
| dvorak | +0.0 / ±0.00 | +0.1 / −0.05 | +0.2 / −0.06 | −4.4 / −0.05 | −4.1 / −0.07 | 750.7 / 1.77 |
| colemak | +0.0 / ±0.00 | +0.1 / −0.29 | +0.2 / −0.30 | −4.4 / −0.31 | −4.1 / −0.33 | 579.2 / 1.64 |
| colemak-dh | +0.0 / ±0.00 | +0.1 / −0.30 | +0.2 / −0.31 | −4.4 / −0.31 | −4.1 / −0.33 | 527.6 / 1.64 |
| graphite | +0.0 / +0.00 | +0.1 / −0.08 | +0.2 / −0.09 | −4.4 / −0.07 | −4.1 / −0.09 | 489.7 / 1.12 |
| gallium | +0.0 / ±0.00 | +0.1 / −0.10 | +0.2 / −0.11 | −4.4 / −0.08 | −4.1 / −0.11 | 539.0 / 1.08 |
| canary | +0.0 / ±0.00 | +0.1 / −0.31 | +0.2 / −0.32 | −4.4 / −0.31 | −4.1 / −0.32 | 511.1 / 1.11 |
| sturdy | +0.0 / ±0.00 | +0.1 / −0.07 | +0.2 / −0.07 | −4.4 / −0.08 | −4.1 / −0.10 | 518.4 / 1.02 |
| aptv3 | +0.0 / +0.00 | +0.1 / −0.40 | +0.2 / −0.40 | −4.4 / −0.40 | −4.1 / −0.43 | 506.0 / 1.57 |
| hands-down-neu | +0.0 / +0.00 | +0.2 / −0.30 | +0.2 / −0.31 | −4.1 / −0.28 | −4.2 / −0.32 | 503.2 / 1.40 |
| night | +0.0 / ±0.00 | +0.1 / −0.11 | +0.2 / −0.11 | −4.4 / −0.11 | −4.1 / −0.12 | 533.0 / 1.02 |
| dusk | +0.0 / +0.00 | +0.1 / −0.11 | +0.2 / −0.11 | −4.4 / −0.11 | −4.1 / −0.12 | 484.7 / 1.09 |
| recurva | +0.0 / ±0.00 | +0.1 / −0.42 | +0.2 / −0.42 | −4.4 / −0.42 | −4.1 / −0.44 | 604.1 / 1.33 |
| focal | +0.0 / ±0.00 | +0.1 / −0.05 | +0.2 / −0.05 | −4.4 / −0.04 | −4.1 / −0.07 | 510.5 / 1.00 |
| nerps | +0.0 / ±0.00 | +0.1 / −0.27 | +0.2 / −0.27 | −4.4 / −0.26 | −4.1 / −0.29 | 559.5 / 1.40 |
| engram | +0.0 / +0.00 | +0.2 / −0.08 | +0.3 / −0.10 | −4.3 / −0.08 | −4.1 / −0.12 | 572.5 / 2.94 |
| sunlight | +0.0 / ±0.00 | +0.1 / −0.29 | +0.2 / −0.29 | −4.4 / −0.28 | −4.2 / −0.31 | 464.9 / 1.56 |
| snth | +0.0 / ±0.00 | +0.1 / −0.09 | +0.2 / −0.09 | −4.4 / −0.09 | −4.1 / −0.10 | 464.8 / 1.07 |
| aptmak | +0.0 / −0.00 | +0.1 / −0.08 | +0.2 / −0.08 | −4.4 / −0.09 | −4.1 / −0.10 | 466.0 / 1.21 |
| bird | +23.9 / −0.65 | +23.9 / −0.96 | +24.2 / −0.96 | +19.8 / −0.96 | +19.8 / −0.97 | 456.1 / 2.04 |
| bird-30 | +0.0 / ±0.00 | +0.1 / −0.29 | +0.2 / −0.30 | −4.4 / −0.29 | −4.1 / −0.30 | 517.3 / 1.34 |
| hands-down-gold | +0.0 / +0.00 | +0.1 / −0.30 | +0.2 / −0.31 | −4.4 / −0.28 | −4.1 / −0.31 | 459.2 / 1.17 |
| hands-down-promethium | +0.0 / +0.00 | +0.1 / −0.30 | +0.2 / −0.31 | −4.4 / −0.28 | −4.1 / −0.31 | 447.8 / 1.29 |
| hands-down-vibranium | +0.0 / +0.00 | +0.1 / −0.32 | +0.2 / −0.33 | −4.4 / −0.29 | −4.1 / −0.33 | 458.5 / 1.24 |
| rsthd | +0.0 / ±0.00 | +0.1 / −0.08 | +0.2 / −0.08 | −4.4 / −0.09 | −4.1 / −0.11 | 604.3 / 1.27 |
| t-34 | +18.9 / −0.56 | +19.0 / −0.58 | +19.1 / −0.59 | +17.0 / −0.60 | +17.3 / −0.61 | 560.1 / 1.39 |
| magic-sturdy | +23.9 / −0.76 | +20.8 / −0.86 | +20.9 / −0.86 | +16.3 / −0.85 | +16.5 / −0.88 | 533.2 / 1.63 |
| enthium | +0.0 / ±0.00 | +0.1 / −0.06 | +0.2 / −0.07 | −4.4 / −0.07 | −4.1 / −0.07 | 427.9 / 1.19 |
| nordrassil | +23.9 / −0.31 | +24.0 / −0.44 | +24.1 / −0.45 | +19.5 / −0.43 | +19.8 / −0.46 | 451.0 / 1.70 |
| finch | +18.9 / −0.62 | +19.3 / −0.64 | +19.7 / −0.65 | +18.2 / −0.64 | +17.7 / −0.66 | 507.6 / 1.48 |
| caksoylar | +23.9 / −0.66 | +24.0 / −0.97 | +24.3 / −0.97 | +20.0 / −0.98 | +20.0 / −1.00 | 533.4 / 2.24 |
| uno | +22.9 / +0.11 | +22.9 / +0.04 | +23.0 / +0.04 | +18.4 / +0.07 | +18.7 / +0.04 | 569.3 / 2.15 |
| ben-vallack-piano | +18.9 / −0.59 | +20.0 / −0.65 | +20.0 / −0.65 | +20.0 / −0.65 | +20.0 / −0.65 | 402.9 / 1.97 |

### Second-round recommendation

**U\***, or U as you drew it, with **the Accents layer mirrored on layouts that type their vowels
with the left hand**.

- With the combo off the fingers, your grid is as fair as the searched ones: mean 0.044% / max 0.078%,
  against main's 0.392% / 0.935%. It has the strongest mnemonic of any candidate.
- Against `main+thumbs`, its Effort is level (mean +0.16, range −3.0 … +1.0).
- A and C each cost about 4 Effort less per layout on the mix, at a similar or lower SFB (C: 0.025 /
  0.078). The price is that their grids have nothing to memorize.
- Without mirroring, U\*'s worst layouts are the left-vowel ones (0.58%). Mirroring is worth it here,
  unlike in the first round, so it needs the layout-format choice described under Mirroring.

## Implemented: U\*

U\* was chosen, mirrored on the layouts that type their vowels with the left hand.

- **Mirroring is derived, not stored.** `vowelsOnLeft` counts the base layer's `a e i o u` per
  hand, and `defaultLayers(geometry, { mirrorAccents })` mirrors Accents, and the Accents keys it
  puts on Extras with it. Bundled layouts, layout documents and new layouts all get it when the
  default layers are added, so the layout format needs no new field. The five mirrored layouts are
  Dvorak, Engram, Enthium, Nordrassil and Uno. Qwerty is not mirrored: by letter count it types
  more vowels with the right hand.
- **The combo** is `accentsComboKeys(geometry)`: L1+R1, or L0+R0 on a board with one thumb a hand.
  A row-stagger board keeps LHR+LHM, having one space bar for both thumbs.
- **On the 18-key board,** Accents' keys stay where they were, since its dead keys no longer share
  fingers with the combo. Like every Accents layer, it's mirrored when the vowels are on the left,
  which Ben Vallack Piano's aren't. `ı` goes on Symbols' right outer thumb.
- **On the bundled fixtures,** Effort on Portuguese rises 13.1 on Qwerty and Romak, where `ã` and
  `ç` leave cheaper keys, while Qwerty's SFB there falls 0.7. English doesn't move.
