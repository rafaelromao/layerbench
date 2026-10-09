import { CYANOPHAGE_EFFORT_SCALE, THUMB_EFFORT } from './effort.js';
import type { Bands, Direction, Family, Predicate, Rule } from './types.js';

/** Band bounds from the Layouts Doc ch. 13.4 (upper bounds of the Min…Max categories). */
export const BANDS: Record<string, Bands> = {
  alt: {
    direction: 'higher_is_better',
    bounds: [23.9, 26.8, 29.7, 32.6, 35.4, 38.3, 41.2, 44.1, 47.0],
  },
  roll: {
    direction: 'higher_is_better',
    bounds: [37.8, 39.7, 41.5, 43.3, 45.2, 47.0, 48.8, 50.6, 52.5],
  },
  in_out: { direction: 'higher_is_better', bounds: [0.8, 1.2, 1.7, 2.1, 2.6, 3.0, 3.5, 3.9, 4.4] },
  sfb: { direction: 'lower_is_better', bounds: [0.525, 0.625, 0.735, 0.875, 1.075, 1.375] },
  sfs: { direction: 'lower_is_better', bounds: [5.3, 5.7, 6.1, 6.5, 6.9, 7.3] },
  scissors: { direction: 'lower_is_better', bounds: [0.1, 0.15, 0.25, 0.35, 0.45, 0.55, 0.7] },
  redir: { direction: 'lower_is_better', bounds: [2.8, 3.6, 4.5, 5.4, 6.2, 7.0, 9.0] },
  pinky_off: { direction: 'lower_is_better', bounds: [1.8, 2.7, 3.5, 4.3, 5.2, 5.9, 6.8] },
  lsb: { direction: 'lower_is_better', bounds: [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0] },
  hand: {
    direction: 'lower_is_better',
    bounds: [2.0, 5.0, 8.0],
    labels: ['even', 'leans', 'heavy', 'very_heavy'],
  },
};

const NO_THUMBS: Predicate = { any_thumb: false };
/**
 * No key of a trigram pressed by a thumb, unless it types a space. A one-shot tap, a held layer or
 * a thumb letter between two keys is a press the hand must make, not a roll or a change of hands;
 * the trigram still counts in the total, so a tap takes the place of a good one.
 */
const NO_THUMB_PRESS: Predicate = {
  none: [0, 1, 2].map(
    (i): Predicate => ({
      all: [{ is_thumb: true, at: [i] }, { none: [{ key_kind: 'space', at: [i] }] }],
    }),
  ),
};
const NO_CHORDS: Predicate = { is_chord: false };
const HEIGHT_PREF = { middle: 3, ring: 2, pinky: 1, index: 0 } as const;
const SCISSOR_WEIGHT = { adjacent_fingers: 1.0, non_adjacent_fingers: 0.5 };

function rule(id: string, label: string, family: Family, attrs: Partial<Rule>): Rule {
  return {
    id,
    label,
    family,
    enabled: true,
    source: 'ngram',
    score: { weight: 0 },
    ...attrs,
  };
}

/** Same finger, different key, no chords. */
export function sfbWhere(): Predicate {
  return { all: [{ same_finger: true }, { same_key: false }, NO_CHORDS] };
}

/** Adjacent fingers stretched horizontally, or semi-adjacent fingers stretched further. */
export function lsbWhere(): Predicate {
  return {
    all: [
      { same_hand: true },
      NO_THUMBS,
      NO_CHORDS,
      {
        any: [
          { all: [{ rank_delta: { eq: 1 } }, { x_distance: { min: '$global.lsb_adjacent_u' } }] },
          {
            all: [
              { rank_delta: { eq: 2 } },
              { x_distance: { min: '$global.lsb_semi_adjacent_u' } },
            ],
          },
        ],
      },
    ],
  };
}

/** Rows apart with the finger that prefers being higher sitting lower. */
export function scissorWhere(rows: number): Predicate {
  return {
    all: [
      { same_hand: true },
      { same_finger: false },
      NO_THUMBS,
      NO_CHORDS,
      { row_delta: { abs: rows } },
      { finger_height_preference: 'violated' },
    ],
  };
}

/** A two-key roll on one hand plus a key on the other, in either order, no thumb pressed. */
export function rollWhere(direction: Direction): Predicate {
  return {
    all: [
      NO_THUMB_PRESS,
      {
        any: [
          {
            all: [
              { hand_pattern: 'aab' },
              { direction, at: [0, 1] },
              { same_finger: false, at: [0, 1] },
            ],
          },
          {
            all: [
              { hand_pattern: 'abb' },
              { direction, at: [1, 2] },
              { same_finger: false, at: [1, 2] },
            ],
          },
        ],
      },
    ],
  };
}

/** The hand changes on every key, no thumb pressed. */
export function alternationWhere(): Predicate {
  return { all: [{ hand_pattern: 'aba' }, NO_THUMB_PRESS] };
}

export function redirectWhere(): Predicate {
  return { all: [{ hand_pattern: 'aaa' }, { changes_direction: true }, NO_THUMBS] };
}

export function bigramRules(): Rule[] {
  return [
    rule('sfb', 'Same finger bigrams', 'bigram', {
      description: 'Two consecutive keys pressed by the same finger (repeats excluded).',
      ngram: { n: 2, skip: 0 },
      where: sfbWhere(),
      aggregate: 'percent_of_ngrams',
      bands: BANDS.sfb,
      score: { weight: 3.0 },
    }),
    rule('sfb_distance', 'SFB distance', 'bigram', {
      description: 'Σ frequency × distance of same finger bigrams (percent-weighted key units).',
      ngram: { n: 2, skip: 0 },
      where: sfbWhere(),
      aggregate: 'sum_distance',
    }),
    rule('sfb_2u', 'SFB ≥ 2 rows', 'bigram', {
      description: 'Same finger bigrams jumping over the home row.',
      ngram: { n: 2, skip: 0 },
      where: { all: [sfbWhere(), { row_delta: { abs_min: 2 } }] },
      aggregate: 'percent_of_ngrams',
    }),
    rule('repeats', 'Repeated keys', 'bigram', {
      description: 'The same key pressed twice in a row.',
      ngram: { n: 2, skip: 0 },
      where: { same_key: true },
      aggregate: 'percent_of_ngrams',
    }),
    rule('lsb', 'Lateral stretch bigrams', 'bigram', {
      description:
        'Adjacent fingers ≥ 2U apart horizontally, or semi-adjacent fingers ≥ 3.5U apart.',
      ngram: { n: 2, skip: 0 },
      where: lsbWhere(),
      aggregate: 'percent_of_ngrams',
      bands: BANDS.lsb,
      score: { weight: 1.0 },
    }),
    rule('fsb', 'Full scissor bigrams', 'bigram', {
      description:
        'Two rows apart with the finger that prefers being higher below the other (adjacent fingers weigh 1, others 0.5).',
      ngram: { n: 2, skip: 0 },
      params: { finger_height_preference: HEIGHT_PREF },
      where: scissorWhere(2),
      weight: SCISSOR_WEIGHT,
      aggregate: 'percent_of_ngrams',
      bands: BANDS.scissors,
      score: { weight: 1.0 },
    }),
    rule('hsb', 'Half scissor bigrams', 'bigram', {
      description: 'One row apart with the finger that prefers being higher below the other.',
      ngram: { n: 2, skip: 0 },
      params: { finger_height_preference: HEIGHT_PREF },
      where: scissorWhere(1),
      weight: SCISSOR_WEIGHT,
      aggregate: 'percent_of_ngrams',
    }),
    rule('thumb_bigrams', 'Thumb bigrams', 'bigram', {
      description: 'Consecutive presses on the same hand where at least one key is a thumb key.',
      ngram: { n: 2, skip: 0 },
      where: { all: [{ same_hand: true }, { any_thumb: true }, { same_key: false }] },
      aggregate: 'percent_of_ngrams',
    }),
    rule('thumb_double', 'Thumb double taps', 'bigram', {
      description: 'The same thumb key pressed twice in a row (harder than on other fingers).',
      ngram: { n: 2, skip: 0 },
      where: { all: [{ same_key: true }, { is_thumb: true }] },
      aggregate: 'percent_of_ngrams',
    }),
    rule('layer_tap_sfb', 'Layer tap → same finger', 'layer', {
      description: 'A layer tap followed by another key on the same finger (e.g. two thumb taps).',
      ngram: { n: 2, skip: 0 },
      where: { all: [{ same_finger: true }, { key_kind: { in: ['layer_tap'] }, at: [0] }] },
      aggregate: 'percent_of_ngrams',
    }),
  ];
}

export function skipgramRules(): Rule[] {
  return [
    rule('sfs', 'Same finger skipgrams', 'skipgram', {
      description: 'Same finger with one key in between.',
      ngram: { n: 2, skip: 1 },
      where: sfbWhere(),
      aggregate: 'percent_of_ngrams',
      bands: BANDS.sfs,
      score: { weight: 1.0 },
    }),
    rule('sfs_weighted', 'SFS (skip 1–3, weighted)', 'skipgram', {
      description: 'Same finger skipgrams over 1–3 keys weighted 0.5 / 0.25 / 0.125.',
      ngram: { n: 2, skip: [1, 2, 3] },
      where: sfbWhere(),
      aggregate: 'percent_of_ngrams',
    }),
    rule('finger_speed', 'Finger movement (SFS distance)', 'skipgram', {
      description:
        'Distance-weighted same finger skipgrams (Genkey/Oxeylyzer style finger speed component).',
      ngram: { n: 2, skip: [1, 2, 3] },
      where: sfbWhere(),
      aggregate: 'sum_distance',
    }),
    rule('lss', 'Lateral stretch skipgrams', 'skipgram', {
      ngram: { n: 2, skip: 1 },
      where: lsbWhere(),
      aggregate: 'percent_of_ngrams',
    }),
    rule('fss', 'Full scissor skipgrams', 'skipgram', {
      ngram: { n: 2, skip: 1 },
      params: { finger_height_preference: HEIGHT_PREF },
      where: scissorWhere(2),
      weight: SCISSOR_WEIGHT,
      aggregate: 'percent_of_ngrams',
    }),
    rule('hss', 'Half scissor skipgrams', 'skipgram', {
      ngram: { n: 2, skip: 1 },
      params: { finger_height_preference: HEIGHT_PREF },
      where: scissorWhere(1),
      weight: SCISSOR_WEIGHT,
      aggregate: 'percent_of_ngrams',
    }),
  ];
}

export function trigramRules(): Rule[] {
  return [
    rule('alternation', 'Alternation', 'trigram', {
      description: 'Hand changes on every key (L R L / R L R), no thumb pressed.',
      ngram: { n: 3 },
      where: alternationWhere(),
      aggregate: 'percent_of_ngrams',
      bands: BANDS.alt,
      score: { weight: 0.5 },
    }),
    rule('alt_sfs', 'Alternation with SFS', 'trigram', {
      description: 'Alternating trigram whose outer keys share a finger.',
      ngram: { n: 3 },
      where: {
        all: [
          { hand_pattern: 'aba' },
          NO_THUMB_PRESS,
          { same_finger: true, at: [0, 2] },
          { same_key: false, at: [0, 2] },
        ],
      },
      aggregate: 'percent_of_ngrams',
    }),
    rule('roll_in', 'Inward rolls', 'trigram', {
      description:
        'Two keys on one hand moving toward the index, then the other hand (or vice versa), no thumb pressed.',
      ngram: { n: 3 },
      where: rollWhere('inward'),
      aggregate: 'percent_of_ngrams',
    }),
    rule('roll_out', 'Outward rolls', 'trigram', {
      ngram: { n: 3 },
      where: rollWhere('outward'),
      aggregate: 'percent_of_ngrams',
    }),
    rule('rolls', 'Rolls (in + out)', 'trigram', {
      description: 'Two-key rolls on one hand plus a key on the other hand, no thumb pressed.',
      ngram: { n: 3 },
      where: { any: [rollWhere('inward'), rollWhere('outward')] },
      aggregate: 'percent_of_ngrams',
      bands: BANDS.roll,
      score: { weight: 0.5 },
    }),
    rule('in_out_ratio', 'In:out roll ratio', 'trigram', {
      description: 'Inward rolls divided by outward rolls.',
      source: 'ngram',
      aggregate: 'ratio',
      aggregate_opts: { numerator: 'roll_in', denominator: 'roll_out' },
      bands: BANDS.in_out,
    }),
    rule('onehand_in', 'One-hand inward (3rolls)', 'trigram', {
      ngram: { n: 3 },
      where: { all: [{ hand_pattern: 'aaa' }, { direction: 'inward' }, NO_THUMBS] },
      aggregate: 'percent_of_ngrams',
    }),
    rule('onehand_out', 'One-hand outward (3rolls)', 'trigram', {
      ngram: { n: 3 },
      where: { all: [{ hand_pattern: 'aaa' }, { direction: 'outward' }, NO_THUMBS] },
      aggregate: 'percent_of_ngrams',
    }),
    rule('redirect', 'Redirects', 'trigram', {
      description: 'One-handed trigram that changes direction.',
      ngram: { n: 3 },
      where: redirectWhere(),
      aggregate: 'percent_of_ngrams',
      bands: BANDS.redir,
      score: { weight: 1.0 },
    }),
    rule('weak_redirect', 'Weak redirects', 'trigram', {
      description: 'Redirects that do not involve an index finger.',
      ngram: { n: 3 },
      where: {
        all: [redirectWhere(), { none: [{ includes_finger_name: { in: ['index', 'thumb'] } }] }],
      },
      aggregate: 'percent_of_ngrams',
    }),
  ];
}

export function usageRules(): Rule[] {
  return [
    rule('finger_usage', 'Finger usage', 'usage', {
      description: 'Share of keystrokes per finger.',
      ngram: { n: 1 },
      aggregate: 'per_finger',
    }),
    rule('hand_balance', 'Hand balance', 'usage', {
      description: 'Share of keystrokes per hand (value = |left − right|).',
      ngram: { n: 1 },
      aggregate: 'per_hand',
      bands: BANDS.hand,
    }),
    rule('row_usage', 'Row usage', 'usage', {
      ngram: { n: 1 },
      aggregate: 'per_row',
      breakdown_by: 'row',
    }),
    rule('column_usage', 'Column usage', 'usage', {
      ngram: { n: 1 },
      aggregate: 'per_col',
      breakdown_by: 'col',
    }),
    rule('pinky_off', 'Pinky off home', 'usage', {
      description: 'Keystrokes on top/bottom-row pinky keys.',
      ngram: { n: 1 },
      where: { all: [{ finger_name: { in: ['pinky'] } }, { row: { in: [0, 2] } }] },
      aggregate: 'percent_of_ngrams',
      bands: BANDS.pinky_off,
      score: { weight: 0.5 },
    }),
    rule('home_row', 'Home row usage', 'usage', {
      ngram: { n: 1 },
      where: { all: [{ row: { in: [1] } }, NO_THUMBS] },
      aggregate: 'percent_of_ngrams',
    }),
    rule('center_column', 'Inner column usage', 'usage', {
      ngram: { n: 1 },
      where: { is_inner: true },
      aggregate: 'percent_of_ngrams',
    }),
    rule('layer_distribution', 'Keystrokes per layer', 'layer', {
      ngram: { n: 1 },
      aggregate: 'per_layer',
      breakdown_by: 'layer',
    }),
    rule('finger_travel', 'Finger travel', 'usage', {
      description: "Cumulative Euclidean travel from each finger's previous key (U per keystroke).",
      source: 'travel',
      travel_mode: 'continuous',
    }),
  ];
}

export function effortRules(): Rule[] {
  return [
    rule('effort', 'Effort', 'effort', {
      description: `cyanophage's Effort: its per-key grid, 577 × effort ÷ keystrokes; a thumb press costs ${THUMB_EFFORT} and a space nothing (the grid is editable).`,
      ngram: { n: 1 },
      aggregate: 'weighted_sum',
      scale: CYANOPHAGE_EFFORT_SCALE,
    }),
    rule('hard_words', 'Hard words', 'effort', {
      description: 'Words ranked by effort per character (includes extra layer/shift presses).',
      source: 'word',
      min_length: 4,
      min_count: 2,
    }),
  ];
}

export function layerRules(): Rule[] {
  return [
    rule('layer_taps_per_100', 'Layer taps per 100 symbols', 'layer', {
      source: 'stat',
      stat: 'layer_taps_per_100',
      unit: 'per100',
      score: { weight: 1.0 },
      bands: { direction: 'lower_is_better', bounds: [1.0, 2.0, 4.0, 6.0, 8.0, 10.0, 15.0] },
    }),
    rule('one_shots_per_word', 'One-shot activations per word', 'layer', {
      source: 'stat',
      stat: 'one_shots_per_word',
      unit: 'ratio',
    }),
    rule('wasted_one_shots', 'Wasted one-shots', 'layer', {
      description:
        'One-shot layers spent on a key that fell through to another layer, a modifier, another layer key or a key that does nothing.',
      source: 'stat',
      stat: 'wasted_one_shots_pct',
      unit: 'percent',
      bands: { direction: 'lower_is_better', bounds: [1.0, 2.0, 5.0, 10.0, 20.0] },
    }),
    rule('macro_usage', 'Macro presses', 'layer', {
      source: 'stat',
      stat: 'macro_pct',
      unit: 'percent',
    }),
    rule('adaptive_hit_rate', 'Adaptive key hit rate', 'layer', {
      description: 'How often an adaptive key produced its trigger output rather than the default.',
      source: 'stat',
      stat: 'adaptive_hit_rate',
      unit: 'percent',
    }),
    rule('combo_usage', 'Combo presses', 'layer', {
      source: 'stat',
      stat: 'combo_pct',
      unit: 'percent',
    }),
    rule('extra_keystrokes', 'Extra keystrokes per symbol', 'layer', {
      description:
        'Presses per symbol typed, minus one, the space bar left out: layer taps, holds and shifts add to it; a macro or combo typing several symbols takes from it.',
      source: 'stat',
      stat: 'extra_keystrokes',
      unit: 'ratio',
      bands: { direction: 'lower_is_better', bounds: [0.02, 0.04, 0.06, 0.08, 0.1, 0.15] },
      score: { weight: 1.0 },
    }),
  ];
}

export function runRules(): Rule[] {
  return [
    rule('same_hand_runs', 'Same-hand run length', 'trigram', {
      description: 'Mean length of same-hand runs; histogram in breakdown.',
      source: 'run',
      run: { by: 'hand' },
      aggregate: 'histogram',
    }),
    rule('same_hand_strings', 'Same-hand strings', 'trigram', {
      description: 'Words/strings typed on one hand for ≥ 4 keys.',
      source: 'run',
      run: { by: 'hand', min_len: 4 },
      aggregate: 'top_strings',
    }),
  ];
}

/** Every built-in rule, in catalog order. */
export function catalogRules(): Rule[] {
  return [
    ...bigramRules(),
    ...skipgramRules(),
    ...trigramRules(),
    ...usageRules(),
    ...effortRules(),
    ...layerRules(),
    ...runRules(),
  ];
}

export function catalogRule(id: string): Rule | undefined {
  return catalogRules().find((r) => r.id === id);
}
