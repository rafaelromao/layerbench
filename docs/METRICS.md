# Metric glossary

Definitions follow the Keyboard Layouts Doc (3rd ed.), chapters 6–13. Where LayoutMaster departs from the Doc, or adds something the Doc does not cover (layers), it is called out under **LayoutMaster notes**.

Every metric below is a *rule*: plain data that a rule set can enable, disable, re-parameterize, copy or remove. The Rules view shows the exact predicate expression of each rule; the presets described at the end change some of them.

## How LayoutMaster counts

- **Physical key stream.** The corpus is *typed* on the keymap: every symbol is turned into the physical presses that produce it (letter keys, layer taps, one-shot layers, sticky shifts, macros, combos, adaptive and repeat keys). All n-gram metrics are computed over that stream, so layer taps and shift presses take part in bigrams, trigrams and usage the same way letters do.
- **Universes.** The default universe is *no space*: the space key is removed from the stream before n-grams are counted (the Doc's convention). The *with space* universe keeps it. Rule sets pick the universe through the `universe` global.
- **Word boundary.** `cross_word: reset` (default) restarts n-grams at every word boundary, so the last letter of one word and the first of the next never form a bigram. `bridge` lets n-grams cross words.
- **Normalization.** `percent_of_ngrams` (default) divides by the number of n-grams of the same size. `percent_of_keystrokes` divides by the number of physical presses (cyanophage style; with `space_per_word_in_keystrokes` one space per word is added to the denominator).
- **Case.** By default case is folded (`A` and `a` are the same symbol). *Model shift* types capitals through the layout's shift key or shifted twin layer, adding the extra presses to the stream.
- **Chords.** Combos (chords) are single events pressed with several fingers. Bigram-family rules exclude them (`is_chord: false`) because "same finger" is undefined for a chord.
- **Thumbs.** Thumb keys are included in usage and in SFB/SFS (a thumb pressing two different keys is a same-finger bigram). They are excluded where the Doc excludes them: lateral stretches, scissors, redirects and one-hand rolls.
- **Distance.** Key positions are in key units (U). `distance_model` is `euclid` (default), `squared` or `manhattan`; distance across hands is undefined and never counted.
- **Skip weights.** Weighted skipgram rules combine skip 1, 2 and 3 with the `skip_weights` global (default 0.5 / 0.25 / 0.125).

## Bands

The Doc groups layouts into categories per metric (ch. 13.4). LayoutMaster stores each band as a list of ascending *upper bounds*; a value falls in the first category whose bound it does not exceed. Nine-category scales use the labels **min · very low · low · mid-low · mid · mid-high · high · very high · max**; shorter scales use the first labels of that list. Each band declares whether lower or higher values are better, which drives the green / amber / red badges.

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
| `sfb` | Same finger bigrams | Two consecutive keys pressed by the same finger; repeats of the same key are excluded. Doc ch. 6. |
| `sfb_distance` | SFB distance | Σ frequency × distance of same finger bigrams, in percent-weighted key units. Shows how far the finger has to travel, not only how often. |
| `sfb_2u` | SFB ≥ 2 rows | Same finger bigrams that jump over the home row (row delta ≥ 2). |
| `repeats` | Repeated keys | The same physical key pressed twice in a row. Not an SFB in the Doc's sense, listed for completeness. |
| `lsb` | Lateral stretch bigrams | Same hand, no thumbs: adjacent fingers whose keys are ≥ 2U apart horizontally (`lsb_adjacent_u`), or semi-adjacent fingers ≥ 3.5U apart (`lsb_semi_adjacent_u`). Doc ch. 8. |
| `fsb` | Full scissor bigrams | Same hand, different fingers, two rows apart, with the finger that prefers to sit higher placed lower (height preference: middle > ring > pinky > index). Adjacent fingers count 1, non-adjacent 0.5. Doc ch. 9. |
| `hsb` | Half scissor bigrams | As full scissors but one row apart. |
| `thumb_bigrams` | Thumb bigrams | Consecutive presses on one hand where at least one key is a thumb key. |
| `thumb_double` | Thumb double taps | The same thumb key twice in a row, which is harder than a repeat on other fingers. |
| `layer_tap_sfb` | Layer tap → same finger | A layer tap followed by another key on the same finger, typically two thumb taps. **LayoutMaster-specific.** |

## Skipgrams

Two presses with one (or more) presses in between. Doc ch. 7.

| Id | Name | Definition |
|---|---|---|
| `sfs` | Same finger skipgrams | Same finger with exactly one key in between (skip 1). |
| `sfs_weighted` | SFS (skip 1–3, weighted) | Same finger skipgrams over 1, 2 and 3 intermediate keys combined with the skip weights. |
| `finger_speed` | Finger movement (SFS distance) | Distance-weighted same finger skipgrams over skips 1–3, the finger-speed component used by Genkey and Oxeylyzer. |
| `lss` | Lateral stretch skipgrams | LSB definition applied to skip-1 pairs. |
| `fss` | Full scissor skipgrams | Full scissor definition applied to skip-1 pairs. |
| `hss` | Half scissor skipgrams | Half scissor definition applied to skip-1 pairs. |

## Trigrams

Three consecutive presses; hand patterns are written with letters (`aba` = hand changes twice, `aab` = two keys on one hand then the other). Doc ch. 10–11.

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
| `finger_usage` | Finger usage | Share of keystrokes per finger. The headline value is the spread (max − min); per-finger values are in the breakdown. Doc ch. 12. |
| `hand_balance` | Hand balance | Share of keystrokes per hand; the value is \|left − right\| in percentage points. |
| `row_usage` | Row usage | Share of keystrokes per row (top, home, bottom, thumb). |
| `column_usage` | Column usage | Share of keystrokes per column. |
| `pinky_off` | Pinky off home | Keystrokes on top- or bottom-row pinky keys. Doc ch. 12. |
| `home_row` | Home row usage | Keystrokes on the home row, thumbs excluded. |
| `center_column` | Inner column usage | Keystrokes on the inner (index-stretch) columns. |
| `finger_travel` | Finger travel | Cumulative Euclidean travel from each finger's previous key, in U per keystroke (continuous model: fingers do not return home between presses). |

## Effort

| Id | Name | Definition |
|---|---|---|
| `effort` | Effort | Mean per-key effort per 100 keystrokes using the layout's effort grid. Default grid: home-row middle/ring/index 0, home-row pinky 1, top and bottom rows 1–3 by finger, inner and outer-pinky columns 5 on the home row and 7 elsewhere, thumbs 1. Editable in the layout. |
| `hard_words` | Hard words | Words ranked by effort per character, including the extra layer and shift presses they need. Minimum length 4, minimum count 2. |

## Layers (LayoutMaster-specific)

These rules measure the cost of multi-layer alphas. They read simulation statistics rather than n-gram tables.

| Id | Name | Definition |
|---|---|---|
| `layer_distribution` | Keystrokes per layer | Share of presses resolved on each layer. |
| `layer_taps_per_100` | Layer taps per 100 symbols | Presses whose only purpose is to reach a layer (momentary, one-shot, toggle, layer-arming macros) per 100 corpus symbols. Bands 1 · 2 · 4 · 6 · 8 · 10 · 15. |
| `one_shots_per_word` | One-shot activations per word | Mean number of one-shot layer activations per word. |
| `wasted_one_shots` | Wasted one-shots | Percentage of one-shot activations consumed by a key that resolved on another layer (transparent fall-through) or by a modifier. Bands 1 · 2 · 5 · 10 · 20. |
| `macro_usage` | Macro presses | Percentage of symbols produced by macros. |
| `adaptive_hit_rate` | Adaptive key hit rate | How often an adaptive (magic) key produced one of its trigger outputs rather than its default. |
| `combo_usage` | Combo presses | Percentage of symbols produced by combos. |
| `extra_keystrokes` | Extra keystrokes per symbol | Physical presses per corpus symbol minus one: layer taps, shifts, repeats and macro overhead. Bands 0.02 · 0.04 · 0.06 · 0.08 · 0.10 · 0.15. |

## Composite score

Off by default. When a rule set enables it, the score is the weighted mean of band *goodness* (0 = worst band, 1 = best band) over the rules that carry a weight and a band, scaled to 0–100. Rules without bands never contribute, and the number is only comparable across layouts analyzed with the same rule set. The Romak author preset ships weights (SFB 3, SFS / scissors / LSB / redirects / pinky off / layer taps / wasted one-shots / extra keystrokes 1, alternation / rolls / hand balance 0.5).

## Presets

| Preset | What changes |
|---|---|
| Layouts Doc | Definitions and bands above. Thumbs included, space excluded, no composite score. |
| cyanophage-like | LSB = inner-column key with a middle-finger key (any rows); scissors = adjacent fingers two rows apart (no height preference); redirects require three different fingers; bigram rules normalized over keystrokes plus one space per word. |
| Keysolve-like | Ring–middle two-row jumps always count as full scissors and one-row jumps as half scissors, on top of the Doc definition. |
| Romak author | Doc rules with the layer family weighted and the composite score enabled. |

## Rule vocabulary

Rules are `where` expressions over an n-gram (`all`, `any`, `none` combinators). Predicates, optionally scoped to positions in the n-gram with `at: [i, j]`:

`same_hand`, `same_finger`, `same_key`, `adjacent_fingers`, `rank_delta` (finger distance in columns, `eq`/`min`), `row_delta` (`abs`, `abs_min`), `x_distance` (`min`, in U), `direction` (`inward` / `outward`), `monotone`, `changes_direction`, `hand_pattern` (`"aba"`, `"aab"`, `"aaa"`…), `finger_name`, `includes_finger_name`, `finger_name_pair`, `row`, `key_kind` (`alpha`, `layer_tap`, `shift`, `space`, `repeat`, `magic`, `combo`, `hold`), `is_inner` / `any_inner`, `is_thumb` / `any_thumb`, `is_chord`, `finger_height_preference: violated`. Numeric thresholds may reference rule-set globals as `"$global.name"`.

Aggregates: `percent_of_ngrams`, `percent_of_keystrokes`, `count`, `per100`, `sum_distance`, `mean_distance`, `per_finger`, `per_hand`, `per_layer`, `per_row`, `per_col`, `weighted_sum`, `ratio`, `histogram`, `top_strings`.

## Differences from the Elixir implementation

This engine reproduces the reference implementation on `main` to within 1e-6 on every metric, pinned
by the reports in `packages/core/golden/`. Three behaviors are deliberately not reproduced, because
they are defects rather than definitions; `packages/core/golden/DEVIATIONS.md` has the detail.

- **Lateral stretches now have values.** `lsb` and `lss` compare a distance against a rule-set
  global. The reference substitutes such a reference only when the whole value is a string, and here
  it sits inside the numeric condition, so the comparison was a number against literal text and
  never matched. Both rules reported `0` in every report.
- **The `travel` heat map reads its rule.** The Analyze view looked the rule up by the heat mode's
  own name, while the catalog calls it `finger_travel`, so the map silently fell back to usage.
- **Comparison ranks by the metric's direction.** The reference decided which side won by whether a
  metric carried bands, which crowned the higher value for unbanded metrics such as SFB distance.
