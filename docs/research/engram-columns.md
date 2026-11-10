# Engram on ten columns

The bundled Engram is its author's layout on the ten columns a 34-key split has. Its source has
eleven. Every key of the ten is on the finger the author's board gives it, and the two keys of the
eleventh, `z` and `q`, are on thumbs. Measured with the engine's `analyze` on English news
(`en-general`), 100,000 letters, fold, no space, the Layouts Doc rules.

## In short

- **Ten columns, every key on its author's finger.** The source has eleven columns, and the bundled
  rows are the ten left after leaving out `z` and `q`, the two keys of the eleventh column, past the
  right pinky, which a 34-key split has no key for. They are on the two inner thumbs, as Hands Down
  Neu and Sunlight put the keys of their eleventh column too.
- **SFB is 1.307, a share of the letters typed**, against the Keyboard Layouts Doc's 1.242 (3rd ed.,
  §15.7.5), and 1.642 as a share of bigrams. The Doc does not say what its SFB is a share of; as a
  share of letters the bundled layouts that can be compared read within 0.2 of it (Colemak-DH 1.133
  against 1.177, Gallium 0.777 against 0.644, Graphite 0.905 against 0.707), so the 0.065 here is within
  what the comparison allows.
- **The top SFB pairs are `ak` 0.122, `au` 0.118, `ua` 0.115, `r.` 0.081 and `hr` 0.074** (percent of
  letters).

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

| finger | author's board | bundled layout |
| --- | --- | --- |
| left pinky | b c g | b c g |
| left ring | y i x | y i x |
| left middle | o e j | o e j |
| left index | u a k, `' , -` | u a k, `' , -` |
| right index | l h r, `" . ?` | l h r, `" . ?` |
| right middle | d t m | d t m |
| right ring | w s f | w s f |
| right pinky | v n p, z q | v n p |

`"` `-` `?` are on the inner columns, where the author has them. Space is on the outer left thumb, `q`
on the left inner thumb and `z` on the right inner one.

## Numbers

Layouts Doc rules, English news, first 100,000 letters, fold, no space. The preset reads SFB as a
share of the letters typed (99,953 of them are typed); its pair rules otherwise read shares of
bigrams (79,529 in this text, 0.796 of the letters) and skipgrams (59,935), so scissors are also
given as a share of letters, as the Doc counts them.

| | the Doc | bundled Engram |
| --- | --- | --- |
| SFB, share of letters | 1.242 | **1.307** |
| SFB, share of bigrams | | 1.642 |
| SFS, skip 1, share of skipgrams | 6.294 | 7.19 |
| Full scissors, share of letters | 0.30 | 0.35 |
| Alternation | 41.1 | 41.0 |
| Rolls | 41.5 | 42.4 |
| Redirects | 4.2 | 4.3 |
| Pinky off | 6.3 | 6.8 |
| In:out roll ratio | 2.3 | 1.9 |
| Hand use, left – right | 49 – 51 | 48 – 52 |
| Effort (the Doc has none) | | 453.5 |

- **Alternation and redirects read as the Doc does**, within 0.1, and rolls within 0.9.
- **The others are not reconciled.** The Doc measures on its own corpus with its own analyzer, and
  only SFB and the pair metrics' denominator were looked at. The SFS here is not the Doc's number:
  the Doc's analyzer counts skips of one to nine keys apart, each weighted half as much as the one
  before, and the preset counts skip 1 alone (`docs/METRICS.md`). Pinky off reads 0.5 above the Doc's,
  the in:out ratio 0.4 below, scissors 0.05 above, and hand use is 48.3 – 51.7 against 49 – 51.
- **On the author's own board, the app's `ansi` preset with the base layer alone, SFB is 1.650
  (1.313 of letters); on the 34-key split it is 1.642 (1.307).** Moving `z` and `q` onto thumbs moves
  SFB by 0.006 of the letters.
- **Effort 453.5** is the third lowest of the 21 Standard and Thumb Alpha layouts, after SNTH's 443.4
  and Aptmak's 444.5.

## The choices

The layout needs no key to be chosen: `z` and `q` are the two keys of the eleventh column. Which of
them is on which inner thumb is a convention and does not move SFB or Effort.

| variant | SFB | share of letters | Effort | hand balance |
| --- | --- | --- | --- | --- |
| `q` on the left inner thumb, `z` on the right (bundled) | 1.642 | 1.307 | 453.5 | 3.31 |
| `z` on the left inner thumb, `q` on the right | 1.642 | 1.307 | 453.5 | 3.33 |

- **Which of `z` and `q` is first.** `q` is the more frequent in the English, Portuguese, Spanish and
  French news (110 against 102 `z` in 100,000 letters of English, 770 against 361 in Portuguese), `z`
  in the Italian and German (978 against 437; 1,123 against 21). The bundled layout puts `q` on the
  left inner thumb, the order Hands Down Neu (`z`, `j`) and Sunlight (`r`, `j`) give their thumb
  letters: left inner, then right inner.

## What else follows

- **Engram is Thumb Alpha, not Standard**, as every layout with a thumb letter is: the Library
  groups it with them, and `categories.test.ts` says so.
- **`languages.json`** (`pnpm languages`) lists Engram for English alone: it types none of the accented
  letters Portuguese, Spanish, French, Italian or German need.
