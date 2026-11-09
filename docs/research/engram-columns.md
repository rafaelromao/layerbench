# Engram on ten columns

The bundled Engram read SFB 6.25 on the Layouts Doc rules, where the Keyboard Layouts Doc (3rd
ed., §15.7.5) lists Engram at 1.242. The layout had lost a column. Measured on 2026-11-08, on main
at `45b9c3ef`, with the engine's `analyze` on English news (`en-general`), 100,000 letters, fold, no
space, the Layouts Doc rules, before and after the fix.

## In short

- **The bundled layout dropped Engram's right inner column.** Its source has eleven columns, and
  the bundled rows were the ten left after leaving out `"` `.` `?`, so every right-hand key sat one
  column over on the 34-key board. Six letters were on another finger than the author's board gives
  them (`d` `t` `w` `s` `v` `n`), and `th`, on keys of one finger, was 3.10% of the bigrams.
- **Now every key of the ten columns is on the finger its author gives it, and `z` and `q` are on
  thumbs.** They are the two keys of the eleventh column, past the right pinky, which a 34-key
  split has no key for: where Nerps, Hands Down Neu and Sunlight put the keys of their eleventh
  column too.
- **SFB lands in the Doc's range.** 1.559 as the preset reads it (a share of bigrams), 1.241 as a
  share of letters, against the Doc's 1.242. The Doc does not say what its SFB is a share of; as a
  share of letters the bundled layouts that can be compared read within 0.15 of it (Colemak-DH
  1.173 against 1.177, Gallium 0.761 against 0.644, Graphite 0.858 against 0.707), so the 0.001
  here is partly luck. The old 4.976 was four times the Doc's.

## Sources

- The author's repository, [binarybottle/engram-2021](https://github.com/binarybottle/engram-2021):
  `engram.json` is the keyboard (a row-stagger board, the two inner columns holding `' "`, `, .` and
  `- ?`, and `z` and `q` as keys 25 and 26 past the right pinky), and the README's steps say the
  same: 24 letters in 8 columns, "separated by two middle columns reserved for punctuation", with
  `z` and `q` "outside the 24-key columns in the upper right".
- The Layouts Doc: the same three rows (`b y o u ' " l d w v z`, `c i e a , . h t s n q`,
  `g x j k - ? r m f p`) in the four places it shows Engram, its statistics row in §15.7.5, and
  "Engram had BCG & VNP pinkies" in ch. 7.6, the fingers of the table below.

## The fingers

The app's row-stagger preset (`ansi`) is the author's board, and the Doc's rows fit it with no key
over: `z` and `q` on its two outer-column keys, the inner columns on the index fingers. On the
34-key split (`3x5+2`) each hand has an inner column and four finger columns, so ten:

| finger | author's board | bundled before | now |
| --- | --- | --- | --- |
| left pinky | b c g | b c g | b c g |
| left ring | y i x | y i x | y i x |
| left middle | o e j | o e j | o e j |
| left index | u a k, `' , -` | u a k, `' , /` | u a k, `' , -` |
| right index | l h r, `" . ?` | l d h t r, `;` | l h r, `" . ?` |
| right middle | d t m | w s m | d t m |
| right ring | w s f | v n f | w s f |
| right pinky | v n p, z q | z q p | v n p |

`"` `-` `?` are not on the base layer, as no bundled layout that takes the default layers keeps
more than `' , . ;` there: their keys are empty, and the symbols are on Symbols and Extras. `z` is
on L1 and `q` on R0, the main thumbs, and Repeat, which L1 would have tapped, is on the key `?` left.

## Numbers

Layouts Doc rules, English news, first 100,000 letters, fold, no space. The preset divides SFB and
SFS by bigrams, which are 0.796 of the letters, so each is also given as a share of letters.

| | the Doc | before | now |
| --- | --- | --- | --- |
| SFB, as the preset reads it | | 6.251 | 1.559 |
| SFB, share of letters | 1.242 | 4.976 | **1.241** |
| SFS, share of letters | 6.294 | 7.72 | 5.63 |
| Full scissors, share of letters | 0.30 | 0.35 | 0.35 |
| Alternation | 41.1 | 38.7 | 40.7 |
| Rolls | 41.5 | 32.7 | 41.8 |
| Redirects | 4.2 | 3.8 | 4.2 |
| Pinky off | 6.3 | 5.5 | 6.7 |
| In:out roll ratio | 2.3 | 1.8 | 1.9 |
| Hand use, left – right | 49 – 51 | 50 – 50 | 48 – 52 |
| Effort (the Doc has none) | | 592.4 | 443.4 |

- **Rolls, alternation and redirects now read as the Doc does**, within 0.4. The old rolls were 9
  points short.
- **The others were not reconciled.** The Doc measures on its own corpus with its own analyzer, and
  only SFB and the pair metrics' denominator were looked at. SFS, pinky off and the in:out ratio are
  nearer the Doc than before and scissors the same; hand use is further (the Doc's 49 – 51 is not
  what these letters give), the old 50 – 50 being the wrong columns happening to balance.
- **The top SFB pairs were `th` 3.10, `rt` 0.40, `tr` 0.37, `ld` 0.24, `rd` 0.22; now `ak` 0.15,
  `au` 0.15, `r.` 0.10, `hr` 0.09, `ua` 0.09** (percent of bigrams).
- **On the author's own board, the app's `ansi` preset with the base layer alone, SFB is 1.650
  (1.313 of letters); here 1.559 (1.241).** Most of the gap is the Accents layer's `qu` macro:
  with it taken out the layout reads 1.616 (1.286). `qua…` is typed as the macro and `a`, so `ua`
  after it is not an SFB (115 `ua` pairs without the macro, 70 with it).
- **Effort 592.4 to 443.4**: the third lowest of the 23 Standard and Thumb Alpha layouts, after
  Aptmak's 439.9 and SNTH's 440.2.

## The choices

The fix needs no key to be chosen: `z` and `q` are the two keys of the eleventh column. Two details
are left to a convention and do not move SFB, so they are cheap to turn over.

| variant | SFB | share of letters | hand balance |
| --- | --- | --- | --- |
| `q` on R0, `z` on L1, Repeat on `?` (chosen) | 1.559 | 1.241 | 4.4 |
| `z` on R0, `q` on L1 | 1.559 | 1.241 | 4.6 |
| Repeat on `"` | 1.559 | 1.241 | 4.6 |
| Repeat on `-` | 1.560 | 1.242 | 4.6 |

The last two rows have `z` on R0.

- **Which of `z` and `q` is on R0.** `q` is the more frequent in the English, Portuguese, Spanish and
  French news (110 against 102 `z` in 100,000 letters of English, 770 against 361 in Portuguese),
  `z` in the Italian and German (978 against 437; 1,123 against 21). Hands Down Neu and Sunlight
  put their first thumb letter on R0.
- **Which key Repeat takes.** With two thumb letters Repeat needs a base-layer key. Hands Down Neu
  has it on the top inner key, Sunlight on the bottom one; Engram's author counts the keys below
  the home row among the comfortable ones for the index finger. Its position does not move SFB. The
  analysis presses it once in 100,000 letters, against 2,126 for the thumb Repeat the old layout
  had: it types a doubled letter the cheapest way, and a Repeat on a finger key costs more than
  tapping the letter's key again.

## What else moves

- **Engram is Thumb Alpha, not Standard**, as every layout with a thumb letter is: the Library
  groups it with them, and `categories.test.ts` says so.
- **`languages.json`** (`pnpm languages`): Engram is in the better half by Effort for English,
  Portuguese, Spanish, Italian and German, and one layout leaves each list for it: Gallium (en),
  Sturdy (pt), APTv3 (es), Focal (it) and Hands Down Neu (de). Nothing about those layouts changed.
- **The goldens**: Engram's document, the `languages` of the five layouts above, and no report.
  `docs/research/accents-layer.md` measured
  Engram on the old rows, as a snapshot of its day, and is left as it was.
