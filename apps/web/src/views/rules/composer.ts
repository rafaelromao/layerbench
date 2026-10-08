import type { Aggregate, Family, FingerName, Globals, Predicate, Rule } from '@layerbench/core';
import { slug } from '@layerbench/core';

/** How a predicate's value is entered. */
export type WidgetKind =
  | 'bool'
  | 'int'
  | 'float'
  | 'direction'
  | 'text'
  | 'finger'
  | 'row'
  | 'kind'
  | 'flag';

export interface PredicateType {
  value: string;
  label: string;
  widget: WidgetKind;
}

/** The predicate vocabulary the composer offers, with the wording the metric glossary uses. */
export const PREDICATE_TYPES: PredicateType[] = [
  { value: 'same_hand', label: 'same hand', widget: 'bool' },
  { value: 'same_finger', label: 'same finger', widget: 'bool' },
  { value: 'same_key', label: 'same key', widget: 'bool' },
  { value: 'adjacent_fingers', label: 'adjacent fingers', widget: 'bool' },
  { value: 'any_thumb', label: 'involves thumb', widget: 'bool' },
  { value: 'is_inner', label: 'inner column (all keys)', widget: 'bool' },
  { value: 'any_inner', label: 'involves inner column', widget: 'bool' },
  { value: 'monotone', label: 'same direction (3-key)', widget: 'bool' },
  { value: 'changes_direction', label: 'changes direction (3-key)', widget: 'bool' },
  { value: 'row_delta_abs', label: 'rows apart (=)', widget: 'int' },
  { value: 'row_delta_abs_min', label: 'rows apart (≥)', widget: 'int' },
  { value: 'rank_delta', label: 'finger rank distance (=)', widget: 'int' },
  { value: 'x_distance_min', label: 'horizontal distance ≥ U', widget: 'float' },
  { value: 'direction', label: 'direction (inward/outward)', widget: 'direction' },
  { value: 'hand_pattern', label: 'hand pattern (aba, aab, aaa…)', widget: 'text' },
  { value: 'finger_name', label: 'finger (all keys)', widget: 'finger' },
  { value: 'includes_finger_name', label: 'involves finger', widget: 'finger' },
  { value: 'row', label: 'row (all keys)', widget: 'row' },
  { value: 'key_kind', label: 'key kind (all keys)', widget: 'kind' },
  { value: 'finger_height_preference', label: 'finger height preference violated', widget: 'flag' },
];

export const FINGER_NAMES = ['pinky', 'ring', 'middle', 'index', 'thumb'] as const;
export const ROWS = [
  { value: '0', label: '0 = top' },
  { value: '1', label: '1 = home' },
  { value: '2', label: '2 = bottom' },
  { value: '3', label: '3 = thumb' },
];
export const KEY_KINDS = [
  'alpha',
  'layer_tap',
  'shift',
  'space',
  'repeat',
  'adaptive',
  'combo',
  'hold',
] as const;

export const COMPOSER_AGGREGATES: Aggregate[] = [
  'percent_of_ngrams',
  'percent_of_keystrokes',
  'count',
  'sum_distance',
  'mean_distance',
  'per_finger',
  'per_hand',
];

export const FAMILIES: Family[] = [
  'bigram',
  'skipgram',
  'trigram',
  'usage',
  'effort',
  'layer',
  'other',
];

export interface ComposerPredicate {
  type: string;
  value: string;
}

export interface ComposerState {
  id: string;
  label: string;
  family: Family;
  n: '1' | '2' | '3';
  skip: '0' | '1' | '2' | '3' | '1-3';
  aggregate: Aggregate;
  combinator: 'all' | 'any' | 'none';
  predicates: ComposerPredicate[];
  weight: string;
}

export const NEW_COMPOSER: ComposerState = {
  id: '',
  label: '',
  family: 'bigram',
  n: '2',
  skip: '0',
  aggregate: 'percent_of_ngrams',
  combinator: 'all',
  predicates: [{ type: 'same_hand', value: 'true' }],
  weight: '0',
};

function parseNumber(text: string, fallback: number): number {
  const n = Number.parseFloat(text);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * One composer row as a predicate. A value that will not parse drops the row rather than producing
 * a rule that silently matches nothing.
 */
export function predicateLeaf(p: ComposerPredicate): Predicate | null {
  const int = Number.parseInt(p.value, 10);
  switch (p.type) {
    case 'row_delta_abs':
      return Number.isNaN(int) ? null : { row_delta: { abs: int } };
    case 'row_delta_abs_min':
      return Number.isNaN(int) ? null : { row_delta: { abs_min: int } };
    case 'rank_delta':
      return Number.isNaN(int) ? null : { rank_delta: { eq: int } };
    case 'x_distance_min':
      return { x_distance: { min: parseNumber(p.value, 2.0) } };
    case 'direction':
      return { direction: p.value === 'outward' ? 'outward' : 'inward' };
    case 'hand_pattern':
      return p.value ? { hand_pattern: p.value } : null;
    case 'finger_name':
      return { finger_name: { in: [p.value as FingerName] } };
    case 'includes_finger_name':
      return { includes_finger_name: { in: [p.value as FingerName] } };
    case 'row':
      return Number.isNaN(int) ? null : { row: { in: [int] } };
    case 'key_kind':
      return { key_kind: { in: [p.value] } } as Predicate;
    case 'finger_height_preference':
      return { finger_height_preference: 'violated' };
    default:
      // Everything else in the vocabulary is a plain true/false test.
      return { [p.type]: p.value === 'true' } as Predicate;
  }
}

let customCounter = 0;

/** Turn the composer form into a rule ready to append to the set. */
export function buildRule(c: ComposerState): Rule {
  const leaves = c.predicates.map(predicateLeaf).filter((p): p is Predicate => p !== null);
  const where = { [c.combinator]: leaves } as Predicate;
  const id = c.id.trim() === '' ? `custom_${++customCounter}` : slug(c.id);
  const skip = c.skip === '1-3' ? [1, 2, 3] : Number.parseInt(c.skip, 10);

  return {
    id,
    label: c.label.trim() === '' ? id : c.label,
    family: c.family,
    enabled: true,
    source: 'ngram',
    ngram: { n: Number.parseInt(c.n, 10) as 1 | 2 | 3, skip },
    // Scissor-style predicates read this table, so a composed rule gets the standard one.
    params: { finger_height_preference: { middle: 3, ring: 2, pinky: 1, index: 0 } },
    where,
    aggregate: c.aggregate,
    score: { weight: parseNumber(c.weight, 0) },
    description: 'Custom rule',
  };
}

/** Band bounds are entered as a comma-separated list; an empty list removes the bands. */
export function parseBounds(text: string): number[] {
  return text
    .split(/[,\s]+/)
    .map((t) => Number.parseFloat(t))
    .filter((n) => Number.isFinite(n));
}

export function boundsText(rule: Rule): string {
  return (rule.bands?.bounds ?? []).join(', ');
}

/** Globals are typed: each name says how its text is read. */
export function coerceGlobal(name: string, value: string): Partial<Globals> {
  switch (name) {
    case 'skip_weights':
      return { skip_weights: parseBounds(value) };
    case 'lsb_adjacent_u':
      return { lsb_adjacent_u: parseNumber(value, 2.0) };
    case 'lsb_semi_adjacent_u':
      return { lsb_semi_adjacent_u: parseNumber(value, 3.5) };
    case 'top_items':
      return { top_items: Math.trunc(parseNumber(value, 12)) };
    case 'repeats_count_as_sfb':
      return { repeats_count_as_sfb: value === 'true' };
    case 'space_per_word_in_keystrokes':
      return { space_per_word_in_keystrokes: value === 'true' };
    default:
      return { [name]: value } as Partial<Globals>;
  }
}
