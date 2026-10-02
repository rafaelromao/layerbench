import type { DistanceModel } from '../geometry/distance.js';
import type { Finger, FingerName, Hand } from '../geometry/types.js';
import type { KeyKind } from '../sim/machine.js';

/**
 * Rule sets are data. Keys and enum values are the same snake_case strings the reference
 * implementation writes, so documents are interchangeable between the two engines.
 */

export type RuleSource = 'ngram' | 'run' | 'word' | 'stat' | 'travel';

export type Family = 'bigram' | 'skipgram' | 'trigram' | 'usage' | 'effort' | 'layer' | 'other';

export type Aggregate =
  | 'percent_of_ngrams'
  | 'percent_of_keystrokes'
  | 'count'
  | 'per100'
  | 'sum_distance'
  | 'mean_distance'
  | 'per_finger'
  | 'per_hand'
  | 'per_layer'
  | 'per_row'
  | 'per_col'
  | 'weighted_sum'
  | 'ratio'
  | 'histogram'
  | 'top_strings';

export type Unit = 'percent' | 'ratio' | 'distance' | 'length' | 'per100' | 'effort' | 'count';

export type StatKey =
  | 'layer_taps_per_100'
  | 'one_shots_per_word'
  | 'wasted_one_shots_pct'
  | 'macro_pct'
  | 'adaptive_hit_rate'
  | 'combo_pct'
  | 'extra_keystrokes'
  | 'keystrokes'
  | 'hold_pct'
  | 'repeat_pct';

export type Direction = 'inward' | 'outward' | 'same' | 'none';

/** A number, or a reference to a rule-set global such as `"$global.lsb_adjacent_u"`. */
export type Num = number | string;

/** Numeric matcher. A bare number means equality. */
export type NumCond =
  | Num
  | { abs: Num }
  | { abs_min: Num; abs_max?: Num }
  | { abs_max: Num }
  | { eq: Num }
  | { min?: Num; max?: Num; gt?: Num; lt?: Num };

/** Set membership: a value, a list, or `{ in: [...] }`. */
export type SetCond<T> = T | T[] | { in: T[] };

export interface PredicateLeaf {
  /** Restrict the predicate to these n-gram positions (0-based). */
  at?: number[];
  hand?: SetCond<Hand | 'both'>;
  finger?: SetCond<Finger>;
  includes_finger?: SetCond<Finger>;
  finger_name?: SetCond<FingerName>;
  includes_finger_name?: SetCond<FingerName>;
  finger_name_pair?: FingerName[];
  row?: SetCond<number>;
  col?: SetCond<number>;
  layer?: SetCond<number>;
  any_layer?: SetCond<number>;
  key_kind?: SetCond<KeyKind>;
  any_key_kind?: SetCond<KeyKind>;
  is_thumb?: boolean;
  any_thumb?: boolean;
  is_home?: boolean;
  is_inner?: boolean;
  any_inner?: boolean;
  is_chord?: boolean;
  same_hand?: boolean;
  same_finger?: boolean;
  same_key?: boolean;
  adjacent_fingers?: boolean;
  rank_delta?: NumCond;
  row_delta?: NumCond;
  col_delta?: NumCond;
  x_distance?: NumCond;
  y_distance?: NumCond;
  distance?: NumCond;
  direction?: Direction;
  hand_pattern?: string;
  monotone?: boolean;
  changes_direction?: boolean;
  distinct_fingers?: boolean;
  finger_height_preference?: 'violated';
  min_run?: unknown;
}

export type Predicate =
  | { all: Predicate[] }
  | { any: Predicate[] }
  | { none: Predicate[] }
  | PredicateLeaf;

export interface Bands {
  direction?: 'lower_is_better' | 'higher_is_better';
  bounds: number[];
  labels?: string[];
}

export interface BandResult {
  index: number | null;
  label: string | null;
  quality: 'good' | 'ok' | 'bad' | 'neutral';
  goodness?: number;
}

export interface WeightSpec {
  adjacent_fingers?: number;
  non_adjacent_fingers?: number;
  default?: number;
}

export interface Rule {
  id: string;
  label?: string;
  description?: string;
  family?: Family;
  enabled?: boolean;
  source?: RuleSource;
  ngram?: { n: 1 | 2 | 3; skip?: number | number[] };
  where?: Predicate | null;
  weight?: WeightSpec | null;
  aggregate?: Aggregate;
  aggregate_opts?: {
    numerator?: string;
    denominator?: string;
    per?: 'symbols' | 'keystrokes' | 'words';
  };
  breakdown_by?: 'layer' | 'row' | 'col' | 'key_kind' | 'hand';
  params?: {
    effort?: Record<string, number>;
    finger_height_preference?: Partial<Record<FingerName, number>>;
  };
  scale?: number;
  bands?: Bands | null;
  score?: { weight: number };
  unit?: Unit;
  stat?: StatKey;
  travel_mode?: 'continuous' | 'reset_at_word';
  run?: { by?: 'hand' | 'finger' | 'layer'; min_len?: number };
  min_length?: number;
  min_count?: number;
}

export interface Globals {
  universe: 'no_space' | 'with_space';
  cross_word: 'reset' | 'bridge';
  repeats_count_as_sfb: boolean;
  skip_weights: number[];
  distance_model: DistanceModel;
  normalization: 'percent_of_ngrams' | 'percent_of_keystrokes';
  lsb_adjacent_u: number;
  lsb_semi_adjacent_u: number;
  top_items: number;
  space_per_word_in_keystrokes: boolean;
}

export const DEFAULT_GLOBALS: Globals = {
  universe: 'no_space',
  cross_word: 'reset',
  repeats_count_as_sfb: false,
  skip_weights: [0.5, 0.25, 0.125],
  distance_model: 'euclid',
  normalization: 'percent_of_ngrams',
  lsb_adjacent_u: 2.0,
  lsb_semi_adjacent_u: 3.5,
  top_items: 12,
  space_per_word_in_keystrokes: false,
};

export interface RuleSet {
  id?: string;
  name?: string;
  description?: string;
  globals: Partial<Globals>;
  rules: Rule[];
  score_enabled?: boolean;
}

export interface RuleItem {
  label: string;
  keys: number[];
  percent?: number;
  count?: number;
  distance?: number | null;
}

export interface RuleResult {
  id: string;
  label: string;
  family: Family;
  value: number | null;
  unit: Unit;
  band: BandResult;
  items: RuleItem[];
  per_finger: Partial<Record<Finger, number>>;
  per_key: Record<number, number>;
  /** `per_key` for each layer: what was pressed on that layer, by the layer its key typed from. */
  per_layer_key: Record<number, Record<number, number>>;
  per_hand: Partial<Record<Hand, number>>;
  breakdown: Record<string, number>;
  note: string | null;
  enabled: boolean;
  score_weight: number;
  normalized: null;
}

export interface Score {
  enabled: boolean;
  value: number | null;
}
