# Accents layer: its arrangement

Research for the Accents default layer (`ACCENTS` and `ACCENTS_NO_BOTTOM` in
`packages/core/src/layouts/templates.ts`). A layout made with **New layout** can start with Numbers,
Symbols and Accents (`withNewLayoutDefaults`). Bundled layouts are their authors' designs and carry
none of the default layers, so everything below is measured on bundled letter arrangements given the
defaults the way **New layout** gives them.

Accents is one-shot, reached by a chord on the base layer (`accentsCombo`). It has 30 keys on a board
that has them. The right hand types the accented vowels, a row per accent (grave on top, acute on
home, circumflex below) and a column per vowel (`u a e o i`, from the inner column out), with the
circumflex's dead key where `û` would be. The left hand has German's letters on its home row, the
tilde's letters with `ç` below, and the ligatures with `qu` and `ß` on top, each row's dead key at
its end. The grid, as the board draws it (left hand pinky→inner, then right hand inner→pinky):

```
`  ß  qu œ  æ  |  ù  à  è  ò  ì
ö  ä  ü  ñ  ´  |  ú  á  é  ó  í
¨  õ  ç  ã  ~  |  ^  â  ê  ô  î
```

The goals, in order:

1. The accented letters the texts use most, and `qu`, each have a key of their own: one press, where
   an accent and its letter take two. The dead keys write the rest (`û`, `ë`, `ï`, `ÿ` among them).
2. Similar keys sit in groups that are easy to memorize.
3. Same-finger bigrams (SFBs) are few and spread fairly, so most layouts are not penalized.
4. A board without some of the 30 positions still types every letter of the six languages.
5. The letter no accent makes, `ı`, has a key.

## Method

Everything is measured with the engine. `analyze` runs headless on the Library's analysis settings:
the Layouts Doc rules, fold, letters, 100,000 symbols and no space, on each of the six bundled texts
(`en`, `pt-br`, `es`, `fr`, `it`, `de` `-general`).

- **Layouts.** The 13 Standard layouts: Qwerty, Dvorak, Colemak, Colemak-DH, Graphite, Gallium,
  Canary, Sturdy, APTv3, Recurva, Focal, Nerps and Bird 30. Their letters are on the 30 finger keys
  of the 34-key split (`3x5+2`) and no letter is on a thumb, so the defaults leave every letter where
  it is. Each is given the defaults as `withNewLayoutDefaults` gives them, with Accents mirrored by
  `vowelsOnLeft` where the layout asks for it; where a grid, an orientation or a chord is compared,
  it is set directly and the rest is the same. A layout with a letter on a thumb loses it to the
  defaults' thumbs, so those layouts are left out, but for Engram in the one place noted.
- **Uses per key.** Presses on each Accents key, summed over the six texts, typed on Qwerty with the
  defaults.
- **Cost.** The Effort rule's cost of each position (`defaultEffort`). On a 3×5 board, per hand:

  |        | pinky | ring | middle | index | inner |
  |--------|-------|------|--------|-------|-------|
  | top    | 3     | 2    | 1      | 2     | 7     |
  | home   | 1     | 0    | 0      | 0     | 5     |
  | bottom | 3     | 2    | 2      | 1     | 8     |

  A thumb press costs 1. In a chord the costliest key counts in full and each other key at half its
  own cost, so two thumbs cost 1.5. **Weighted cost** is Σ uses × position cost over Accents' keys,
  the chord not included.
- **Accents SFBs.** The `sfb` rule's pairs (with `top_items` raised so none is cut) in which either
  press is on Accents, as a percent of the letters typed, the unit the Layouts Doc preset's SFB is
  given in. One finger pressing an Accents key next to the letter before or after it. Next to a
  single key a chord counts as sharing a finger with it if any key of the chord does.
  - *mix*: the mean over the six texts, the same for every layout.
- **Headline.** The Effort and SFB the Library shows for a layout, as the mean over the six texts and
  on English, the Library's default text.

Accents' keys press next to the letters of the layout under it, so its SFBs depend on the layout and
are measured per layout.

## The letter no accent makes: `ı`

Of the characters in the six bundled texts, one is typed by no accent and no ordinary key: **`ı`**
(U+0131, Turkish dotless i), from Turkish names in the English news ("Sakallı", "Bahçıvan").

| text | in the 100k-symbol sample | in the whole sample file |
|---|---|---|
| en-general | 1 | 2 |
| pt-br, es, fr, it, de | 0 | 0 |

It is a letter of its own: no dead key makes it. So the defaults give it a key, on Symbols' right
inner top key, above `¿` and `¡`; a board without that key has it on Extras, and the board with no
bottom row on a thumb of Symbols. With the defaults, every language's required, optional and
punctuation characters are typed on every board (`layoutLanguageCoverage`, pinned for every board by
`templates.test.ts`), and the analysis's missing characters are empty on all six texts for the 13
layouts.

## Uses per key (six texts, summed)

| key | uses | key | uses | key | uses |
|---|---|---|---|---|---|
| é | 3268 | ü | 670 | ù | 97 |
| qu | 3012 | è | 660 | ô | 83 |
| ó | 1002 | ä | 511 | â | 72 |
| á | 875 | ê | 311 | ì | 46 |
| ã | 795 | ö | 277 | ò | 39 |
| à | 739 | ú | 258 | î | 28 |
| í | 734 | ñ | 174 | ¨ | 20 |
| ç | 728 | õ | 162 | ^ | 16 |
| | | ß | 129 | œ | 9 |

`´ \` ~ æ` are never pressed on a full board: each accented letter has its own key. They matter on
boards without the outer keys, where the dead keys type what the missing keys would. `ı` is on
Symbols: 1 use.

## The access

Accents is reached by two keys pressed together, one-shot: the thumbs L1 and R1, the outer pair of the
34-key split, or L0 and R0 on a board with one thumb a hand. Two thumbs pressed together never form a
same-finger pair with a finger key, so no key of Accents shares a finger with the chord, wherever it
sits. A board with one space bar for both thumbs (`ansi`, `iso`) has no two thumbs to chord: it takes
the left ring and middle fingers' home keys, LHR+LHM.

The alternative, measured on the same 13 layouts and U\*'s grid with the chord on LHR+LHM:

| chord | Accents SFB, mix (mean / max) | Library SFB, mix (mean) | Effort, mix (mean) |
|---|---|---|---|
| thumbs, L1+R1 | 0.041 / 0.062 | 1.73 | 599.7 |
| LHR+LHM | 1.003 / 1.030 | 3.22 | 581.9 |

- **The combo fingers are the cost.** Every key on the left ring or middle column is a same-finger
  pair with the chord each time it is used (`ß`, `qu`, `ä`, `ü`, `õ` and `ç` in this grid), and so is
  every letter pressed on those two fingers before the chord: the Library's SFB rises by more than
  the Accents SFB does. On English, where Accents is almost only `qu`, the Accents SFB is 0.000 with
  thumbs and 0.098 with LHR+LHM.
- **The thumbs cost Effort, the home keys none.** Two thumbs cost 1.5 per use and LHR+LHM on home keys
  cost 0, so the thumb chord adds 17.8 to Effort on every layout (the mix), and takes 0.99 to 1.72
  off the Library's SFB.
- **On a row-stagger board that is what the defaults have.** Qwerty given the defaults on `ansi` or
  `iso` reads an Accents SFB of 1.030 on the mix (2.190 on Portuguese), against 0.062 on the 34-key split,
  and an Effort 2.9 lower (1106.9 against 1109.9). The grid there is U\* unchanged, not one arranged for
  the combo fingers. Mirroring still helps there: Dvorak's letters on `ansi` read an Accents SFB of
  1.394 as drawn and 0.939 mirrored.

## Candidates

Each is a 30-key grid with the same symbols, each key a macro, a letter or a dead key as in
`ACCENTS`. They are drawn as the board is: left hand pinky→inner, then right hand inner→pinky.

**U\* — rows by accent, columns by vowel (the grid above).** On the right, each row is an accent
(grave, acute, circumflex) and each column a vowel, with `^` where `û` would be. On the left, the
German letters are on home, the tilde letters with `ç` on the bottom, and the ligatures with `qu` and
`ß` on top, with the dead keys beside their rows: `´` and `~` at the inner end of home and bottom,
`` ` `` and `¨` on the pinky of top and bottom.

**U — the same rule, the left top row `æ œ qu ß` `` ` `` and the home row `ñ ö ü ä ´`.**

```
æ  œ  qu ß  `  |  ù  à  è  ò  ì
ñ  ö  ü  ä  ´  |  ú  á  é  ó  í
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

A and C came from a simulated-annealing search over placements, for the lowest and the most even
Accents SFBs. The search is not kept in the repository, and what is measured here is the grids as
drawn.

### Results

Measured with the thumb chord, each layout in the orientation its vowels ask for (the *by vowel
hand* columns).

| | weighted cost | Accents SFB, one orientation (mean / max) | by vowel hand (mean / max) | ΔEffort mix vs U\* | ΔSFB mix vs U\* (mean, range) | ΔEffort English vs U\* |
|---|---|---|---|---|---|---|
| U\* | 12,329 | 0.070 / 0.426 | 0.041 / 0.062 | ±0.00 | ±0.000 | ±0.00 |
| U | 12,226 | 0.078 / 0.426 | 0.049 / 0.090 | −0.09 | +0.009 (+0.002 … +0.028) | ±0.00 |
| A | 6,647 | 0.054 / 0.145 | 0.048 / 0.071 | −4.54 | +0.007 (−0.013 … +0.030) | −0.48 |
| C | 7,075 | 0.030 / 0.123 | 0.022 / 0.035 | −4.19 | −0.018 (−0.031 … −0.003) | −0.49 |

Notes on the summary:

- **One orientation** means every layout gets the grid as drawn. **By vowel hand** mirrors the grid on
  the layouts that type their vowels with the left hand (see Mirroring).
- **ΔEffort** and **ΔSFB** are the Library's headline numbers, the mean over the six texts, against
  U\*. Effort differs by the same amount on every layout, as it depends only on the keys of Accents.
- **English Effort** is 0.5 lower with A and C: their `qu` sits on a home key, U\*'s on a top-row key.
  Against the same letters without Accents, U\* and U lower English Effort by 0.3 and A and C by 0.8,
  and English SFB does not move.
- **U\* and U** differ by 0.09 Effort. U\*'s left rows are ordered by the search: lower Accents SFBs
  (0.041 against 0.049 on the mean, 0.062 against 0.090 on the max), for 103 more weighted cost.
- **A and C** are about 4.2 to 4.5 Effort cheaper on the mix, at a similar or lower SFB. C has the
  lowest and the most even Accents SFBs. Their grids have nothing to memorize.

Accents SFBs of U\* per text, the mean and the worst layout (mean over the 13 layouts, as the board
draws them for each):

| text | mean | worst |
|---|---|---|
| en | 0.000 | 0.001 (Qwerty) |
| pt | 0.057 | 0.100 (Sturdy) |
| es | 0.065 | 0.162 (Qwerty) |
| fr | 0.046 | 0.075 (Dvorak) |
| it | 0.009 | 0.026 (Sturdy) |
| de | 0.067 | 0.132 (Dvorak) |

## Mirroring

What follows an accented vowel is most often a consonant, and a layout's consonants are mostly under
the hand its vowels are not. A layout that types its vowels with the left hand gets Accents
mirrored, key for key, the keys it puts on Extras with it.

`vowelsOnLeft` counts the base layer's `a e i o u` keys per hand, a thumb tap among them. Mirroring
is derived from the base layer when the defaults are added, so the layout format has no field for it.
U\* per layout, Accents SFB on the mix:

| layout | vowel keys left / right | Accents | as shipped | as drawn | mirrored |
|---|---|---|---|---|---|
| Qwerty | 2 / 3 | as drawn | 0.062 | 0.062 | 0.133 |
| Dvorak | 5 / 0 | mirrored | 0.039 | 0.426 | 0.039 |
| Colemak | 1 / 4 | as drawn | 0.054 | 0.054 | 0.423 |
| Colemak-DH | 1 / 4 | as drawn | 0.053 | 0.053 | 0.427 |
| Graphite | 0 / 5 | as drawn | 0.022 | 0.022 | 0.254 |
| Gallium | 0 / 5 | as drawn | 0.019 | 0.019 | 0.271 |
| Canary | 0 / 5 | as drawn | 0.032 | 0.032 | 0.416 |
| Sturdy | 0 / 5 | as drawn | 0.047 | 0.047 | 0.242 |
| APTv3 | 0 / 5 | as drawn | 0.053 | 0.053 | 0.419 |
| Recurva | 0 / 5 | as drawn | 0.045 | 0.045 | 0.397 |
| Focal | 0 / 5 | as drawn | 0.034 | 0.034 | 0.237 |
| Nerps | 0 / 5 | as drawn | 0.037 | 0.037 | 0.465 |
| Bird 30 | 0 / 5 | as drawn | 0.030 | 0.030 | 0.439 |
| Engram (its `q` and `z` replaced by the defaults' thumbs) | 5 / 0 | mirrored | 0.034 | 0.462 | 0.034 |

- **The key count picks the orientation the SFBs pick.** On each layout the orientation `vowelsOnLeft`
  chooses is the one with fewer Accents SFBs, so Dvorak and Engram are mirrored and no other of the
  14 is. Qwerty is not mirrored: it types more vowel keys with the right hand.
- **Mirroring is worth it where it applies, and costs everywhere else.** Without it, U\*'s worst
  layouts are the left-vowel ones (0.426 on Dvorak, 0.462 on Engram); with it they read 0.039 and
  0.034. Every layout mirrored would read 0.320 on the mean.

## The boards

Where the 30 keys of Accents land on each board of the editor:

| board | finger keys | on Accents' finger keys | on Accents' thumbs | on Extras |
|---|---|---|---|---|
| `3x5+2`, `3x5+3`, `3x6+3`, `ansi`, `iso` | 30 to 36 | 30 | 0 | 0 |
| `23332+2`, `23332+1` | 26 | 26 | 0 | 4 |
| `13332+2`, `13332+1` | 24 | 24 | 0 | 6 |
| `13331+2` | 22 | 22 | 0 | 8 |
| `1333+2` | 20 | 20 | 2 | 8 |
| `1222+2` (no bottom row) | 14 | 10 keys, the arrangement below | | |

A key whose position the board does not have goes on Extras (on while Numbers and Symbols are both
held), on the free key nearest its Accents position, the same hand first and then the same row. What
Extras has no room for goes on a free thumb of Accents, its own hand's first: Accents is one-shot and
leaves the thumbs free.

### The board with no bottom row

The `1222+2` board, Ben Vallack Piano's, has 14 finger keys, 4 thumbs and no room for macros.
Accents there holds only what no other layer has: the dead keys, the letters of their own, and the
symbols Extras cannot fit:

```
      ·  œ  ·  |  ·  ·  ·
ß  ^  ~  `  |  ´  ¨  ç  ñ        thumb: æ
```

(`ACCENTS_NO_BOTTOM`; the free keys `·` and the thumbs carry the symbols that have no key on the other
layers.) On this board the dead keys type every accent. On the fixture of 14 letters
(`lgdhuoisrtneac`) the acute dead key is pressed 6,137 times over the six texts, against 510 to 1,581
for each of the others (the grave's count includes the plain backtick). So the most used dead key is
on a right home key, the cheapest, and `ß` and `ñ` are on the home pinkies. The Accents
SFB there is 0.142 on the mix, 0.762 on German. Following U\*'s positions was not measured: the board
has 14 of its 30 positions.

## Decisions

Accents is arranged as **U\***, in the orientation its layout's vowels ask for:

- It has the strongest mnemonic of the candidates, and a rule that can be said in a sentence and
  seen on the board: a row per accent, a column per vowel.
- With the chord off the fingers its Accents SFBs are 0.041 on the mean and 0.062 on the worst layout
  (mix), against C's 0.022 and 0.035 and A's 0.048 and 0.071; its Effort is within 0.09 of U's.
- A and C cost about 4.2 to 4.5 Effort less per layout on the mix, at a similar or lower SFB. The
  price is that their grids have nothing to memorize.
- **The 30 keys** are the 19 accented letters the texts use most, `â` among them, `qu`, the letters
  no accent makes (`ß ç ñ œ æ`) and the five dead keys; `ı` is on Symbols.
- **`qu` is on a top-row key** with `ß`, among the keys of the left hand that make letters. On a home
  key, as in A and C, English Effort would be 0.5 lower.
- **The chord is two thumbs**, and the left ring and middle home keys on a board with one space bar.
  The thumbs cost 17.8 Effort on every layout and take 1.0 to 1.7 off the Library's SFB; on a
  row-stagger board Accents SFBs stay at 1.03.
- **Mirroring is derived, not stored**, from the base layer's vowel keys.
- **On the 14-key board,** Accents has the dead keys and the letters of their own, arranged by use.
