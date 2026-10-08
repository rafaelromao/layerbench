# Metric glossary

Definitions follow the [Keyboard Layouts Doc, 3rd edition](https://docs.google.com/document/d/1W0jhfqJI2ueJ2FNseR4YAFpNfsUM-_FlREHbpNGmC2o) — chiefly chapters 4 (SFBs, SFSs, distance), 6 (scissors), 7 (lateral stretches), 8 (trigrams) and 13 (the stat table and its thresholds). Section numbers below are that edition's. Where LayerBench departs from the Doc, or adds something the Doc does not cover (layers), it is called out under **LayerBench notes**.

Every metric below is a *rule*: plain data that a rule set can enable, disable, re-parameterize, copy or remove. The Rules view shows the exact predicate expression of each rule; the presets described at the end change some of them.

**Sources.** Each rule's sources — the section of the Doc, the line of another analyzer, or this glossary where the rule is LayerBench's own — are listed under the rule in the Rules view and under *Sources* on its card in the Analyze view. They come from one table, `packages/core/src/rules/references.ts`, which a test holds to the catalog: a rule without a source fails the build.

## How LayerBench counts

- **Physical key stream.** The corpus is *typed* on the keymap: every symbol is turned into the physical presses that produce it (letter keys, layer taps, one-shot layers, sticky shifts, macros, combos, adaptive and repeat keys). All n-gram metrics are computed over that stream, so layer taps and shift presses take part in bigrams, trigrams and usage the same way letters do.
- **Choices while typing.** Where a character can be typed several ways, the fewest presses win, then the way that leaves no layer key held, then the fewest same-finger bigrams and then skipgrams with the keys before it in the word, then the lower Effort on cyanophage's grid. Where several keys tap the same layer the same way, each word takes the one that gives it the fewest same-finger bigrams, then skipgrams, then the lower Effort. These measures are fixed, never the rule set's, so the same text is typed the same way whatever rules score it.
- **Universes.** The default universe is *no space*: the space key is removed from the stream before n-grams are counted (the Doc's convention). The *with space* universe keeps it. Rule sets pick the universe through the `universe` global; in the app, **Space** sets it, whatever the rule set says.
- **Word boundary.** `cross_word: reset` (default) restarts n-grams at every word boundary, so the last letter of one word and the first of the next never form a bigram. `bridge` lets n-grams cross words.
- **Normalization.** `percent_of_ngrams` (default) divides by the number of n-grams of the same size. For pairs — bigrams and skipgrams — that is the number the *text* has, as if every character took one press, not the number the layout pressed: layer taps, holds and one-shots add pairs no letter rule can match, and would otherwise make a layout that needs them look better than it types. Single keys and trigrams are shares of what was pressed. `percent_of_keystrokes` divides by the text's characters, space only when space is counted (cyanophage style; with `space_per_word_in_keystrokes`, one space per word is added when space is not counted, and the spaces themselves stand for it when it is). For a layout that types every character with one press, both ways give the same number.
- **Case.** By default case is folded (`A` and `a` are the same symbol). **Shift**, in the app, types capitals through the layout's shift key or shifted twin layer, adding the extra presses to the stream.
- **Chords.** Combos (chords) are single events pressed with several fingers. Next to a single key, a chord counts as its worst case: it shares a finger with the key if any of its fingers is the key's. A pair of two chords is left out of the bigram-family rules (`is_chord: false`), since "same finger" has no single answer between two multi-finger presses.
- **Thumbs.** Thumb keys are included in usage and in SFB/SFS (a thumb pressing two different keys is a same-finger bigram). They are excluded where the Doc excludes them: lateral stretches, scissors, redirects and one-hand rolls.
- **Distance.** Key positions are in key units (U). `distance_model` is `euclid` (default), `squared` or `manhattan`; distance across hands is undefined and never counted.
- **Skip weights.** Weighted skipgram rules combine skip 1, 2 and 3 with the `skip_weights` global (default 0.5 / 0.25 / 0.125).
- **Per key.** A rule that sums over keys says what each key adds to its number, on each layer it was pressed on: an n-gram's count is split evenly between its keys (a pair counts half on each), a chord's share between the keys pressed together; a distance counts its distance, Effort each key's own cost, Finger travel the travel to the key, layer taps the key tapped. The parts add up to the number. Spreads (finger, hand, row balance), ratios, runs and words have no part per key.

## Bands

The Doc groups layouts into categories per metric (ch. 13.4). LayerBench stores each band as a list of ascending *upper bounds*; a value falls in the first category whose bound it does not exceed, and a value above the last bound in one more category after it. The labels are **min · very low · low · mid-low · mid · mid-high · high · very high · max**, as many as there are categories: SFB's six bounds make seven, so its worst band, above 1.375, is *high*; alternation's nine make ten, and above 47.0 is a second *max*. Each band declares whether lower or higher values are better, which drives the green / amber / red badges.

| Metric | Direction | Upper bounds (%) |
|---|---|---|
| Alternation | higher is better | 23.9 · 26.8 · 29.7 · 32.6 · 35.4 · 38.3 · 41.2 · 44.1 · 47.0 |
| Rolls | higher is better | 37.8 · 39.7 · 41.5 · 43.3 · 45.2 · 47.0 · 48.8 · 50.6 · 52.5 |
| In:out roll ratio | higher is better | 0.8 · 1.2 · 1.7 · 2.1 · 2.6 · 3.0 · 3.5 · 3.9 · 4.4 (ratio) |
| SFB | lower is better | 0.525 · 0.625 · 0.735 · 0.875 · 1.075 · 1.375 |
| SFS | lower is better | 5.3 · 5.7 · 6.1 · 6.5 · 6.9 · 7.3 |
| Full scissors | lower is better | 0.1 · 0.15 · 0.25 · 0.35 · 0.45 · 0.55 · 0.7 |
| Redirects | lower is better | 2.8 · 3.6 · 4.5 · 5.4 · 6.2 · 7.0 · 9.0 |
| Pinky off home | lower is better | 1.8 · 2.7 · 3.5 · 4.3 · 5.2 · 5.9 · 6.8 |
| LSB | lower is better | 0.5 · 1.0 · 1.5 · 2.0 · 2.5 · 3.0 · 4.0 |
| Hand balance | lower is better | 2 · 5 · 8 points of \|left − right\| → even · leans · heavy · very heavy |

Bounds are editable per rule in the Rules view ("Bands (upper bounds)").

## Bigrams

Two consecutive presses. Normalized as a percentage of bigrams unless the rule set says otherwise.

| Id | Name | Definition |
|---|---|---|
| `sfb` | Same finger bigrams | Two consecutive keys pressed by the same finger; repeats of the same key are excluded. Doc §4.1. |
| `sfb_distance` | SFB distance | Σ frequency × distance of same finger bigrams, in percent-weighted key units. Shows how far the finger has to travel, not only how often. |
| `sfb_2u` | SFB ≥ 2 rows | Same finger bigrams that jump over the home row (row delta ≥ 2). |
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
| `alternation` | Alternation | The hand changes on every key (`aba`). |
| `alt_sfs` | Alternation with SFS | Alternating trigram whose outer keys share a finger without being the same key. |
| `roll_in` | Inward rolls | Two keys on one hand moving toward the index finger (different fingers), plus one key on the other hand, in either order (`aab` / `abb`). |
| `roll_out` | Outward rolls | Same, moving toward the pinky. |
| `rolls` | Rolls (in + out) | Union of inward and outward rolls. |
| `in_out_ratio` | In:out roll ratio | Inward rolls divided by outward rolls. |
| `onehand_in` | One-hand inward (3rolls) | All three keys on one hand, monotonic inward, no thumbs. |
| `onehand_out` | One-hand outward (3rolls) | All three keys on one hand, monotonic outward, no thumbs. |
| `redirect` | Redirects | One-handed trigram that changes direction, no thumbs. |
| `weak_redirect` | Weak redirects | Redirects that involve neither index finger nor thumb (the hardest kind). |
| `same_hand_runs` | Same-hand run length | Mean length of consecutive presses on one hand; the breakdown shows the histogram. |
| `same_hand_strings` | Same-hand strings | Words or strings typed on one hand for four or more keys. |

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
| `effort` | Effort | cyanophage's Effort: `577 × Σ effort ÷ keystrokes`, with each key's effort read from cyanophage's grid by position — top row `5 3 2 1 2 7 │ 7 2 1 2 3 5`, home `5 1 0 0 0 5 │ 5 0 0 0 1 5`, bottom `7 3 2 2 1 8 │ 8 1 2 2 3 7`, from the left outer pinky column to the right one — and thumbs free. The keystrokes are the text's characters, space included, as cyanophage counts them: a layer key is charged its place on the grid, nothing on a thumb, but is not a keystroke, so it cannot lower the average. Spaces cost nothing. The grid is the rule's `params.effort`, changed in the rule set's JSON. Lower is better; with SFB, one of the two numbers layouts are sorted by. Each key is credited with its cost times its presses, so thumbs and the free home keys add nothing. |
| `hard_words` | Hard words | Words ranked by effort per character, including the extra layer and shift presses they need. Minimum length 4, minimum count 2. |

## Layers (LayerBench-specific)

These rules measure the cost of multi-layer alphas. Most read simulation statistics rather than n-gram tables.

| Id | Name | Definition |
|---|---|---|
| `layer_distribution` | Keystrokes per layer | Share of presses resolved on each layer. |
| `layer_taps_per_100` | Layer taps per 100 symbols | Taps on one-shot, toggle and switch layer keys per 100 corpus symbols. A key held for a layer, an auto-layer key and a macro that turns a layer on after its text are not counted. Bands 1 · 2 · 4 · 6 · 8 · 10 · 15. |
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
| Layouts Doc | Definitions and bands above. Thumbs included, space excluded, no composite score. |
| cyanophage-like | LSB = inner-column key with a middle-finger key (any rows); scissors = adjacent fingers two rows apart (no height preference); redirects require three different fingers; pair rules, skipgrams included, normalized over keystrokes plus one space per word. |
| Keysolve-like | Ring–middle two-row jumps always count as full scissors and one-row jumps as half scissors, on top of the Doc definition. |

## Rule vocabulary

Rules are `where` expressions over an n-gram (`all`, `any`, `none` combinators). Predicates, optionally scoped to positions in the n-gram with `at: [i, j]`:

- Of each key, which every key selected must match (the `any_` and `includes_` forms need only one): `hand`, `finger`, `includes_finger`, `finger_name`, `includes_finger_name`, `row`, `col`, `is_home`, `is_thumb` / `any_thumb`, `is_inner` / `any_inner`, `key_kind` / `any_key_kind` (`alpha`, `layer_tap`, `shift`, `space`, `repeat`, `adaptive`, `combo`, `hold`), `layer` / `any_layer`, `is_chord`.
- Of each two keys in a row: `same_hand`, `same_finger`, `same_key`, `adjacent_fingers`, `rank_delta` (the difference in finger rank, `eq`/`min`), `row_delta` (`abs`, `abs_min`), `col_delta`, `x_distance` and `y_distance` (`min`, in U, on one hand), `distance` (by the rule set's distance model), `direction` (`inward` / `outward`), `finger_name_pair`, `finger_height_preference: violated`.
- Of the whole n-gram: `hand_pattern` (`"aba"`, `"aab"`, `"aaa"`…), `monotone`, `changes_direction`, `distinct_fingers`, `min_run`.

Numeric thresholds may reference rule-set globals as `"$global.name"`.

A press's `key_kind` is the kind of key it reaches: past a tap-hold to its tap, past a morph to the arm the modifiers or layers choose, past a tap dance to the tap it ran, and past a layer-tap that is tapped. So an adaptive key on the tap of a tap-hold is `adaptive`, as its legend on the board says, a tap-hold whose tap repeats is `repeat`, and an alt repeat is `adaptive` whichever branch it takes. A key held down that types nothing is `hold`, and a press that types a space is `space`.

Aggregates: `percent_of_ngrams`, `percent_of_keystrokes`, `count`, `per100`, `sum_distance`, `mean_distance`, `per_finger`, `per_hand`, `per_layer`, `per_row`, `per_col`, `weighted_sum`, `ratio`, `histogram`, `top_strings`.

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
