# Metric glossary

Definitions follow the [Keyboard Layouts Doc, 3rd edition](https://docs.google.com/document/d/1W0jhfqJI2ueJ2FNseR4YAFpNfsUM-_FlREHbpNGmC2o) — chiefly chapters 4 (SFBs, SFSs, distance), 6 (scissors), 7 (lateral stretches), 8 (trigrams) and 13 (the stat table and its thresholds). Section numbers below are that edition's. Where LayerBench departs from the Doc, or adds something the Doc does not cover (layers), it is called out under **LayerBench notes**.

Every metric below is a *rule*: plain data that a rule set can enable, disable, re-parameterize, copy or remove. The Rules view shows the exact predicate expression of each rule; the presets described at the end change some of them.

**Sources.** Each rule's sources — the section of the Doc, the line of another analyzer, or this glossary where the rule is LayerBench's own — are listed under the rule in the Rules view and under *Sources* on its card in the Analyze view. They come from one table, `packages/core/src/rules/references.ts`, which a test holds to the catalog: a rule without a source fails the build.

## How LayerBench counts

- **Physical key stream.** The corpus is *typed* on the keymap: every symbol is turned into the physical presses that produce it (letter keys, layer taps, one-shot layers, sticky shifts, macros, combos, adaptive and repeat keys). All n-gram metrics are computed over that stream, so layer taps and shift presses take part in bigrams, trigrams and usage the same way letters do.
- **Choices while typing.** A combo marked for typing is the way to type what it makes, wherever it works: it is not weighed against the other ways, which follow where it cannot work, and a combo that is a command is never pressed. A dead key on a combo makes no letter of its own, so the letters it accents are weighed like any other way. Where a character can be typed several other ways, the fewest presses win, then the way that leaves no layer key held, then the fewest same-finger bigrams and then skipgrams with the keys before it in the word, then the lower Effort on cyanophage's grid. Where several keys tap the same layer the same way, each word takes the one that gives it the fewest same-finger bigrams, then skipgrams, then the lower Effort. These measures are fixed, never the rule set's, so the same text is typed the same way whatever rules score it.
- **Universes.** The default universe is *no space*: the space key is removed from the stream before n-grams are counted (the Doc's convention). The *with space* universe keeps it. Rule sets pick the universe through the `universe` global; in the app, **Space** sets it in each view that analyzes, whatever the rule set says, and **Rules** does not offer it.
- **Word boundary.** `cross_word: reset` (default) restarts n-grams at every word boundary, so the last letter of one word and the first of the next never form a bigram. `bridge` lets n-grams cross words.
- **A macro that types a space.** A macro, or any press, that types marks and then a space, `, ` or `. `, is one press that types the word's last mark and its space: it is the word's last press, counted as the mark's own key would be, in both universes (its effort, its finger, the pairs it makes with the letters before it, the words table), and its space ends the word: `words` counts it (and so `space_per_word_in_keystrokes`), the next letter starts a new word, and the space is one of the text's characters only with space, as every space is. With space counted it also pairs with the next word's first letter, as the space bar does; without, the words on either side pair only when pairs cross words. It is not a space-bar press: Effort charges its key, `macro_usage` counts it, `extra_keystrokes` sees one press for one symbol, and on a thumb it is a thumb press that types a mark, so the trigram rules do not count it as the space they let a thumb type. It is pressed where the text has its mark before a space when that takes no more presses than the mark and then the space bar, as any way of typing is chosen by its presses first; where no space follows, the mark is typed another way. A macro is matched only where its one space is the last thing it types, after marks alone, digits and letters not among them: one that types a word and a space, `and `, is not pressed, and its letters are typed one by one.
- **Normalization.** Each rule's `aggregate` says what its percentage is a share of. `percent_of_ngrams` (default) divides by the number of n-grams of the same size. For pairs — bigrams and skipgrams — that is the number the *text* has, as if every character took one press, not the number the layout pressed: layer taps, holds and one-shots add pairs no letter rule can match, and would otherwise make a layout that needs them look better than it types. Single keys and trigrams are shares of what was pressed. `percent_of_keystrokes` divides by the text's characters, space only when space is counted (cyanophage style, and what the cyanophage-like preset gives every pair rule; with `space_per_word_in_keystrokes`, one space per word is added when space is not counted, and the spaces themselves stand for it when it is; with `untyped_in_keystrokes`, the characters the layout cannot type are keystrokes too, as cyanophage counts every character of a word whether his layout has it or not). For a layout that types every character with one press, both ways give the same number. `percent_of_symbols` divides by the text's symbols: its characters without the space (its letters, and the little punctuation the text class keeps), the same whether space is counted or not and whether capitals are typed through Shift or folded. Genkey, the Doc's analyzer, divides SFB by the characters on the layout's own keys, which is nearly the same number; this is what the Layouts Doc preset's SFB and `sfb_2u` are shares of. Counting the space bar or modelling Shift changes the presses it counts, and never what the count is a share of, so the number does not move because the denominator did.
- **Case.** By default case is folded (`A` and `a` are the same symbol). **Shift**, in the app, types capitals with Shift, through the cheapest key that gives it, held or one-shot, or a shifted twin layer, adding the extra presses to the stream.
- **Chords.** Combos (chords) are single events pressed with several fingers. In Effort a chord costs its costliest key in full and every other key at half its own effort (`CHORD_EXTRA_SHARE`), so two keys together cost between one key and two: the Layouts Doc and the analyzers it draws on do not model combos, the Keystroke-Level Model counts every key of a chord, and keys pressed together overlap in time, so this is a modelling choice, not a measurement, and one number to change. Next to a single key, a chord counts as its worst case: it shares a finger with the key if any of its fingers is the key's. A pair of two chords is left out of the bigram-family rules (`is_chord: false`), since "same finger" has no single answer between two multi-finger presses.
- **Thumbs.** Thumb keys are included in usage and in SFB/SFS (a thumb pressing two different keys is a same-finger bigram). They are excluded where the Doc excludes them: lateral stretches, scissors, redirects and one-hand rolls. LayerBench also keeps them out of rolls and alternation: a trigram with a thumb press in it — a one-shot tap, a held layer, a thumb letter, anything but a space — is never a roll or an alternation, but it stays in the total, so a layer tap takes the place of a trigram that could have been one. Counted like a finger, a tap between two letters would make them look like a roll or a change of hands, and a layout would score better for every tap it needs. In Effort a thumb press costs 1, where cyanophage charges nothing, for the same reason. With space counted, a Repeat key and a space bar on one thumb make same-finger bigrams of their own: a doubled letter typed by Repeat, then the space, lists as `⟳␣`, whatever the letter: a press of the Repeat key, an adaptive key's default included, is named `⟳`, as the board draws it, and not by the letter it repeated, while an adaptive key's other branches keep what they typed (`h␣`, the alt repeat's branch after `a`). The app names the keys in full in the tooltip of an item, on a card, and listed under a key's numbers.
- **Distance.** Key positions are in key units (U). `distance_model` is `euclid` (default), `squared` or `manhattan`; distance across hands is undefined and never counted.
- **Skip weights.** Weighted skipgram rules combine skip 1, 2 and 3 with the `skip_weights` global (default 0.5 / 0.25 / 0.125).
- **Per key.** A rule that sums over keys says what each key adds to its number, on each layer it was pressed on: an n-gram's count is split evenly between its keys (a pair counts half on each), a chord's share between the keys pressed together; a distance counts its distance, Effort each key's own cost (a chord's keys at the shares above), Finger travel the travel to the key, layer taps the key tapped. The parts add up to the number. Spreads (finger, hand, row balance), ratios, runs and words have no part per key.
- **What a layer key was pressed for.** A pair that ends on a press made to bring a layer on, rather than to type, lists the keys pressed right after it, and so does a closer look at such a key: a layer key held, a one-shot, toggle, to-layer or auto-layer, whether on a key, on a tap-hold's hold or on a combo. A key that types and then turns a layer on, such as a macro, typed.

## Bands

The Doc groups layouts into categories per metric (ch. 13.4). LayerBench stores each band as a list of ascending *upper bounds* on the rule, so the ruler is part of the rule set; a value falls in the first category whose bound it does not exceed, and a value above the last bound in one more category after it. The labels are **min · very low · low · mid-low · mid · mid-high · high · very high · max**, as many as there are categories. Each band declares whether lower or higher values are better, and the colour is the category's place on the ruler: with nine categories the first three are green, the next three amber and the last three red (the other way round where higher is better). Alternation's nine bounds make ten categories, so above 47.0 is a second *max*. **SFB's ruler goes past the Doc's table.** The Doc gives SFB six bounds, min to mid high, and dashes under high, very high and max, and none of its layout rows has an SFB past 1.375 (Engram's 1.242 is the highest). LayerBench keeps the first five and carries the Doc's sequence on, whose steps grow 0.10 · 0.11 · 0.14 · 0.20 · 0.30 and then 0.45 · 0.66 · 0.94: 1.825 · 2.485 · 3.425, each the start of its name (*high* above 1.825, *very high* above 2.485, *max* above 3.425). *Mid high* therefore runs to 1.825, past the Doc's 1.375, and every SFB in the Doc's own tables keeps its category. **The cyanophage-like rule set has its own SFB ruler.** Cyanophage rates nothing; the only colour his pages give SFB is a finger's bar, red = 128 + 6000 × share clamped to 255, full at 2.117% of the text. Its ruler is nine equal steps up to that, 0.235 apiece, *max* from 1.881 on, which reads a finger's ramp as a layout's total: LayerBench's assumption, not his. SFS, scissors, redirects and pinky off have dashes in the Doc's table too (SFS stops at six thresholds, the others at seven), but the Doc's own layout rows name values past them (an SFS of 7.483 is *high* and 8.744 *very high*, scissors of 0.71 and redirects of 12.1 *very high*, pinky off of 8.1 *very high*, without printing where one category ends), so they take the next label in the list. A custom rule set saved earlier keeps the bands it was saved with, and so the names it had. LSB's bands are LayerBench's own, not in the Doc's table, so past its last bound it takes the next label in the list. The guide's [rulers](guide/analyzing.md#the-rulers) draw both rule sets' SFB and Effort step by step, and the badge of either opens them.

| Metric | Direction | Upper bounds (%) |
|---|---|---|
| Alternation | higher is better | 23.9 · 26.8 · 29.7 · 32.6 · 35.4 · 38.3 · 41.2 · 44.1 · 47.0 |
| Rolls | higher is better | 37.8 · 39.7 · 41.5 · 43.3 · 45.2 · 47.0 · 48.8 · 50.6 · 52.5 |
| In:out roll ratio | higher is better | 0.8 · 1.2 · 1.7 · 2.1 · 2.6 · 3.0 · 3.5 · 3.9 · 4.4 (ratio) |
| SFB | lower is better | 0.525 · 0.625 · 0.735 · 0.875 · 1.075 · 1.825 · 2.485 · 3.425; cyanophage-like: 0.235 · 0.47 · 0.706 · 0.941 · 1.176 · 1.411 · 1.646 · 1.881 |
| SFS | lower is better | 5.3 · 5.7 · 6.1 · 6.5 · 6.9 · 7.3 |
| Full scissors | lower is better | 0.1 · 0.15 · 0.25 · 0.35 · 0.45 · 0.55 · 0.7 |
| Redirects | lower is better | 2.8 · 3.6 · 4.5 · 5.4 · 6.2 · 7.0 · 9.0 |
| Pinky off home | lower is better | 1.8 · 2.7 · 3.5 · 4.3 · 5.2 · 5.9 · 6.8 |
| LSB | lower is better | 0.5 · 1.0 · 1.5 · 2.0 · 2.5 · 3.0 · 4.0 |
| Hand balance | lower is better | 5 · 11 points of \|left − right\|, the Doc's 52-48 and 55-45 splits as it prints them, in whole percents → even · leans · heavy, three categories, the last open-ended; [research/hand-balance-bands.md](research/hand-balance-bands.md) |
| Effort | lower is better | 400 · 426 · 454 · 489 · 540 · 617 · 732 · 900 (effort) |

**What the SFB bands were measured on.** The Doc took its SFB from the Genkey analyzer on the MonkeyRacer corpus (§13.3). Genkey lowercases the text, never counts the space, and divides by the characters on the layout's keys, in practice the letters typed; the Doc says stats are shared "disregarding space" (§16.4). The Layouts Doc preset's SFB is a share of the same kind, of the characters typed (`percent_of_symbols`), so with **Shift** and **Space** off it is close to the Doc's number: Colemak-DH reads 1.13 on the English news sample, where the Doc has 1.177, *mid high*, and Engram 1.31 against 1.242 (another text, so a check and not a calibration). The cyanophage-like preset divides by keystrokes with a space per word, which reads about 0.83 times the share of letters. With **Space** counted the thumb pairs, such as Repeat then space, are added to what is counted (under the default `cross_word: reset`; letting pairs cross words, space breaks some the other way), and with **Shift** modelled the Shift presses join the stream, which could make pairs and breaks others; each capital takes the Shift that makes the fewest, so Magic Romak falls a little (1.35 to 1.30 on 100,000 symbols of the English news sample). Colemak-DH has no key that gives Shift: it types no capital there, and falls a little too (1.13 to 1.09). The Doc counted neither, and the letters they are a share of do not change. The badge names the band of the number the view shows, whichever it is. **SFS is not the Doc's number.** Genkey counts skips of one to nine keys in between, each half as much as the one before, where the Layouts Doc preset counts skip 1 alone and divides by the text's skipgrams; dividing skip 1 by the letters would read 0.6 times as much, far under the SFS bands, so SFS keeps its own denominator. The measurements are in [docs/research/sfb-bands.md](research/sfb-bands.md).

Effort's bands are LayerBench's own, on the Doc's nine steps: *min* up to 400 and *max* above 900, and between them the progression of the Doc's SFB bounds (0.525 · 0.625 · 0.735 · 0.875 · 1.075 · 1.375 · 1.825 · 2.485, steps of 0.10 · 0.11 · 0.14 · 0.20 · 0.30 · 0.45 · 0.66, each larger than the one before, by a tenth at first and about half from the fourth) at the same relative places, 255.1 Effort to the unit of SFB, rounded to whole numbers: 400 · 426 · 454 · 489 · 540 · 617 · 732 · 900, steps of 26 · 28 · 35 · 51 · 77 · 115 · 168. Equal steps, 71.4 apart from 400 to 900, would put 31 of the 35 bundled layouts below *mid*. On the English news sample, 100,000 symbols, the bundled layouts run from Magic Romak's 353 (*min*) to Qwerty's 1245 (*max*): Romak's 456 is *mid low*, Colemak-DH's 523 *mid*, Colemak's 629 *high*, Dvorak's 764 *very high*. The cyanophage-like rule set takes the same ruler: cyanophage gives Effort none. A custom rule set keeps the bounds it was saved with, none included, until they are changed in **Rules**.

Bounds are editable per rule in the Rules view ("Bands (upper bounds)").

## Bigrams

Two consecutive presses. Normalized as a percentage of bigrams unless the rule's `aggregate` says otherwise (SFB's and `sfb_2u`'s do: the letters typed, under the Layouts Doc preset; `sfb_distance` and the rest stay shares of pairs).

| Id | Name | Definition |
|---|---|---|
| `sfb` | Same finger bigrams | Two consecutive keys pressed by the same finger; repeats of the same key are excluded. Doc §4.1. |
| `sfb_distance` | SFB distance | Σ frequency × distance of same finger bigrams, in percent-weighted key units. Shows how far the finger has to travel, not only how often. |
| `sfb_2u` | SFB ≥ 2 rows | Same finger bigrams that jump over the home row (row delta ≥ 2). A part of SFB, counted over the same letters, so the two cards read in one unit. |
| `repeats` | Repeated keys | The same physical key pressed twice in a row. Not an SFB in the Doc's sense, listed for completeness. |
| `lsb` | Lateral stretch bigrams | Same hand, no thumbs: adjacent fingers whose keys are ≥ 2U apart horizontally (`lsb_adjacent_u`), or semi-adjacent fingers ≥ 3.5U apart (`lsb_semi_adjacent_u`). Doc §7.2. |
| `fsb` | Full scissor bigrams | Same hand, different fingers, two rows apart, with the finger that prefers to sit higher placed lower (height preference: middle > ring > pinky > index). Adjacent fingers count 1, non-adjacent 0.5. Doc §6.2, §6.5. |
| `hsb` | Half scissor bigrams | As full scissors but one row apart. |
| `thumb_bigrams` | Thumb bigrams | Consecutive presses on one hand where at least one key is a thumb key. |
| `thumb_double` | Thumb double taps | The same thumb key twice in a row, which is harder than a repeat on other fingers. |

## Skipgrams

Two presses with one (or more) presses in between. Doc §4.5 (SFS), §6.6 and §6.8 (scissor skipgrams), §7.3 (LSS).

| Id | Name | Definition |
|---|---|---|
| `sfs` | Same finger skipgrams | Same finger with exactly one key in between (skip 1). |
| `sfs_weighted` | SFS (skip 1–3, weighted) | Same finger skipgrams over 1, 2 and 3 intermediate keys combined with the skip weights. |
| `finger_speed` | Finger movement (SFS distance) | Distance-weighted same finger skipgrams over skips 1–3, the finger-speed component used by Genkey and Oxeylyzer. |
| `lss` | Lateral stretch skipgrams | LSB definition applied to skip-1 pairs. |
| `fss` | Full scissor skipgrams | Full scissor definition applied to skip-1 pairs. |
| `hss` | Half scissor skipgrams | Half scissor definition applied to skip-1 pairs. |

## Trigrams

Three consecutive presses; hand patterns are written with letters (`aba` = hand changes twice, `aab` = two keys on one hand then the other). Doc §8.1.

| Id | Name | Definition |
|---|---|---|
| `alternation` | Alternation | The hand changes on every key (`aba`), no thumb pressed (see *Thumbs*). |
| `alt_sfs` | Alternation with SFS | Alternating trigram whose outer keys share a finger without being the same key. |
| `roll_in` | Inward rolls | Two keys on one hand moving toward the index finger (different fingers), plus one key on the other hand, in either order (`aab` / `abb`), no thumb pressed. |
| `roll_out` | Outward rolls | Same, moving toward the pinky. |
| `rolls` | Rolls (in + out) | Union of inward and outward rolls. |
| `in_out_ratio` | In:out roll ratio | Inward rolls divided by outward rolls. |
| `onehand_in` | One-hand inward (3rolls) | All three keys on one hand, monotonic inward, no thumbs. |
| `onehand_out` | One-hand outward (3rolls) | All three keys on one hand, monotonic outward, no thumbs. |
| `redirect` | Redirects | One-handed trigram that changes direction, no thumbs. |
| `weak_redirect` | Weak redirects | Redirects that involve neither index finger nor thumb (the hardest kind). |
| `same_hand_runs` | Same-hand run length | Mean length of consecutive presses on one hand; the breakdown shows the histogram. |
| `same_hand_strings` | Same-hand strings | Words or strings typed on one hand for four or more keys; a press of the Repeat key is spelled `⟳`. |

## Usage

| Id | Name | Definition |
|---|---|---|
| `finger_usage` | Finger usage | Share of keystrokes per finger. The headline value is the spread (max − min); per-finger values are in the breakdown. Doc §4.8. |
| `hand_balance` | Hand balance | Share of keystrokes per hand; the value is \|left − right\| in percentage points. |
| `row_usage` | Row usage | Share of keystrokes per row (top, home, bottom, thumb). |
| `column_usage` | Column usage | Share of keystrokes per column. |
| `pinky_off` | Pinky off home | Keystrokes on top- or bottom-row pinky keys. Doc §13.2. |
| `home_row` | Home row usage | Keystrokes on the home row, thumbs excluded. |
| `center_column` | Inner column usage | Keystrokes on the inner (index-stretch) columns. |
| `finger_travel` | Finger travel | Cumulative Euclidean travel from each finger's previous key, in U per keystroke (continuous model: fingers do not return home between presses). Each key is credited with the travel its finger made to press it. |

## Effort

| Id | Name | Definition |
|---|---|---|
| `effort` | Effort | cyanophage's Effort: `577 × Σ effort ÷ keystrokes`, with each key's effort read from cyanophage's grid by position — top row `5 3 2 1 2 7 │ 7 2 1 2 3 5`, home `5 1 0 0 0 5 │ 5 0 0 0 1 5`, bottom `7 3 2 2 1 8 │ 8 1 2 2 3 7`, from the left outer pinky column to the right one. A thumb press costs 1, a LayerBench departure: cyanophage leaves thumbs free, which made a layout's one-shot taps, held layers and thumb letters cost nothing. The keystrokes are the text's characters, space included, as cyanophage counts them: a layer key is charged its place, 1 on a thumb, but is not a keystroke, so it cannot lower the average. A character the layout cannot type costs nothing and, in the cyanophage-like set (`untyped_in_keystrokes`), is a keystroke, as in his; in the Layouts Doc set it is left out. Spaces cost nothing, whichever key types them. The grid is the rule's `params.effort`, changed in the rule set's JSON. Lower is better; with SFB, one of the two numbers layouts are sorted by. Bands 400 · 426 · 454 · 489 · 540 · 617 · 732 · 900, from *min* to *max* (see [Bands](#bands)). Each key is credited with its cost times its presses, so the free home keys add nothing. The simulator still chooses how to type on cyanophage's own grid, so what is typed does not depend on what a thumb costs. |
| `hard_words` | Hard words | Words ranked by effort per character, including the extra layer and shift presses they need. Minimum length 4, minimum count 2. |

## Layers (LayerBench-specific)

These rules measure the cost of multi-layer alphas. Most read simulation statistics rather than n-gram tables.

| Id | Name | Definition |
|---|---|---|
| `layer_distribution` | Keystrokes per layer | Share of presses resolved on each layer. |
| `layer_taps_per_100` | Layer taps per 100 symbols | Taps on one-shot, toggle and switch layer keys per 100 corpus symbols. A key held for a layer, an auto-layer key, a combo and a macro that turns a layer on after its text are not counted. Bands 1 · 2 · 4 · 6 · 8 · 10 · 15. |
| `layer_tap_sfb` | Layer tap → same finger | A layer tap followed by another key on the same finger, typically two thumb taps. |
| `one_shots_per_word` | One-shot activations per word | Mean number of one-shot layer activations per word. |
| `wasted_one_shots` | Wasted one-shots | Percentage of one-shot activations consumed by a key that resolved on another layer (transparent fall-through), by a modifier, by another layer key, or by a key that does nothing. Bands 1 · 2 · 5 · 10 · 20. |
| `macro_usage` | Macro presses | Share of all presses that are macro presses. |
| `adaptive_hit_rate` | Adaptive key hit rate | How often an adaptive key produced one of its trigger outputs rather than its default. |
| `combo_usage` | Combo presses | Share of all presses that are combos. |
| `extra_keystrokes` | Extra keystrokes per symbol | Physical presses per corpus symbol, minus one; space bar presses are left out, as spaces are not symbols. Layer taps, holds and shifts raise it; a macro or a combo that types several symbols at once lowers it. Bands 0.02 · 0.04 · 0.06 · 0.08 · 0.10 · 0.15. |

## Composite score

Off by default, and no shipped preset turns it on: in **Rules**, **Composite score** does, and each rule's score weight says how much it counts. When a rule set enables it, the score is the weighted mean of band *goodness* (0 = worst band, 1 = best band) over the rules that carry a weight and a band, scaled to 0–100. Rules without bands never contribute, and the number is only comparable across layouts analyzed with the same rule set.

## Presets

| Preset | What changes |
|---|---|
| Layouts Doc | Definitions and bands above. Thumbs included, space excluded unless Space is on, no composite score. SFB is a share of the characters typed, the way the Doc's analyzer counts it, with Space counted or not; SFS is a share of the text's skipgrams (see Bands). |
| cyanophage-like | LSB = inner-column key with a middle-finger key (any rows); scissors = keys in adjacent columns two rows apart, typed by two fingers of one hand (no height preference; an index finger's stretch column next to the middle finger's is two columns away, so not a scissor); redirects, weak ones included, require three different fingers; pair rules, skipgrams included, normalized over keystrokes plus one space per word, the characters the layout cannot type counted as keystrokes (`untyped_in_keystrokes`), in Effort's divisor too; the e2e `apps/web/e2e/cyanophage.spec.ts` holds Effort, SFB, its two-row part, LSB, skipgrams (`sfs`) and scissors to his playground's numbers ([docs/research/cyanophage-e2e.md](research/cyanophage-e2e.md)); SFB rated on the ramp his finger bars are coloured by (see Bands). |

## Rule vocabulary

Rules are `where` expressions over an n-gram (`all`, `any`, `none` combinators). Predicates, optionally scoped to positions in the n-gram with `at: [i, j]`:

- Of each key, which every key selected must match (the `any_` and `includes_` forms need only one): `hand`, `finger`, `includes_finger`, `finger_name`, `includes_finger_name`, `row`, `col`, `is_home`, `is_thumb` / `any_thumb`, `is_inner` / `any_inner`, `key_kind` / `any_key_kind` (`alpha`, `layer_tap`, `shift`, `space`, `repeat`, `adaptive`, `combo`, `hold`), `layer` / `any_layer`, `is_chord`.
- Of each two keys in a row: `same_hand`, `same_finger`, `same_key`, `adjacent_fingers`, `rank_delta` (the difference in finger rank, `eq`/`min`), `row_delta` (`abs`, `abs_min`), `col_delta`, `x_distance` and `y_distance` (`min`, in U, on one hand), `distance` (by the rule set's distance model), `direction` (`inward` / `outward`), `finger_name_pair`, `finger_height_preference: violated`.
- Of the whole n-gram: `hand_pattern` (`"aba"`, `"aab"`, `"aaa"`…), `monotone`, `changes_direction`, `distinct_fingers`.

Numeric thresholds may reference rule-set globals as `"$global.name"`.

A press's `key_kind` is what the key it reaches counts as: past a tap-hold to its tap, past a morph to the part the modifiers or layers choose, past a tap dance to the tap it ran, and past a layer-tap that is tapped. So an adaptive key on the tap of a tap-hold is `adaptive`, as its legend on the board says, a tap-hold whose tap repeats is `repeat`, and an alt repeat is `adaptive` whichever branch it takes. A key held down that types nothing is `hold`, and a press that types a space is `space`.

Aggregates: `percent_of_ngrams`, `percent_of_keystrokes`, `percent_of_symbols`, `count`, `per100`, `sum_distance`, `mean_distance`, `per_finger`, `per_hand`, `per_layer`, `per_row`, `per_col`, `weighted_sum`, `ratio`, `histogram`, `top_strings`.

## Notes on the definitions

- **Lateral stretches.** `lsb` and `lss` compare a horizontal distance against a rule-set global,
  `"$global.lsb_adjacent_u"`. Globals are resolved wherever they appear in a rule, including inside a
  numeric condition.
- **Travel and Effort heat maps.** `finger_travel` and `effort` credit each key its own part of the
  total, and the `travel` and `effort` heat maps draw those parts.
- **Comparison.** Which side of a comparison wins is decided by a fixed list of metrics where
  higher is better (alternation, rolls, in- and out-rolls, one-hand rolls in and out, the in:out
  ratio, home row usage and the adaptive key hit rate). Every other metric, a composed one included,
  is read as lower is better, whatever its bands say.
