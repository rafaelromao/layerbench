import { catalogRules, redirectWhere, scissorWhere } from './catalog.js';
import type { Rule, RuleSet } from './types.js';

export const PRESET_IDS = ['layouts_doc', 'cyanophage', 'keysolve'] as const;
export type PresetId = (typeof PRESET_IDS)[number];

/** The Layouts Doc definitions, unmodified. */
export function layoutsDoc(): RuleSet {
  return {
    id: 'layouts_doc',
    name: 'Layouts Doc',
    description:
      'Definitions and bands from the Keyboard Layouts Doc (3rd ed.). Thumbs included, space excluded, no composite score.',
    globals: {},
    rules: catalogRules(),
    score_enabled: false,
  };
}

/** Column-pair lateral stretches, adjacency scissors, bigrams normalized over keystrokes. */
export function cyanophage(): RuleSet {
  const rules = catalogRules()
    .map((r): Rule => {
      if (r.id === 'lsb') {
        return {
          ...r,
          label: 'Lat stretch bigrams (column pairs)',
          description: 'cyanophage: inner-column key with a middle-finger key (any rows).',
          where: {
            all: [
              { same_hand: true },
              { any_thumb: false },
              { any_inner: true },
              { includes_finger_name: { in: ['middle'] } },
              { same_finger: false },
            ],
          },
        };
      }
      if (r.id === 'fsb') {
        return {
          ...r,
          label: 'Scissors (adjacent columns, 2 rows)',
          description: 'cyanophage: adjacent fingers, two rows apart, same hand.',
          where: {
            all: [
              { same_hand: true },
              { same_finger: false },
              { any_thumb: false },
              { adjacent_fingers: true },
              { row_delta: { abs_min: 2 } },
            ],
          },
          weight: null,
        };
      }
      if (r.id === 'redirect') {
        return {
          ...r,
          where: { all: [redirectWhere(), { same_finger: false, at: [0, 2] }] },
          description: 'cyanophage: direction change with three different fingers.',
        };
      }
      return r;
    })
    .map(
      (r): Rule =>
        r.aggregate === 'percent_of_ngrams' && r.source === 'ngram' && r.ngram?.n === 2
          ? { ...r, aggregate: 'percent_of_keystrokes' }
          : r,
    );

  return {
    id: 'cyanophage',
    name: 'cyanophage-like',
    description:
      'Column-pair LSBs, adjacency scissors, bigram percentages over keystrokes (+ one space per word), repeats excluded.',
    globals: {
      space_per_word_in_keystrokes: true,
      cross_word: 'reset',
    },
    rules,
    score_enabled: false,
  };
}

/** Ring–middle row jumps always count as scissors, on top of the Doc definition. */
export function keysolve(): RuleSet {
  const rules = catalogRules().map((r): Rule => {
    if (r.id === 'fsb') {
      return {
        ...r,
        description: 'Keysolve: Doc full scissors plus every ring–middle two-row jump.',
        where: {
          any: [
            scissorWhere(2),
            {
              all: [
                { same_hand: true },
                { finger_name_pair: ['ring', 'middle'] },
                { row_delta: { abs: 2 } },
              ],
            },
          ],
        },
      };
    }
    if (r.id === 'hsb') {
      return {
        ...r,
        where: {
          any: [
            scissorWhere(1),
            {
              all: [
                { same_hand: true },
                { finger_name_pair: ['ring', 'middle'] },
                { row_delta: { abs: 1 } },
              ],
            },
          ],
        },
      };
    }
    return r;
  });

  return {
    id: 'keysolve',
    name: 'Keysolve-like',
    description: 'Ring–middle row jumps always count as scissors; bigram normalization.',
    globals: {},
    rules,
    score_enabled: false,
  };
}

/** A preset by id; unknown ids fall back to the Layouts Doc set. */
export function getPreset(id: string): RuleSet {
  switch (id) {
    case 'cyanophage':
      return cyanophage();
    case 'keysolve':
      return keysolve();
    default:
      return layoutsDoc();
  }
}

export function allPresets(): RuleSet[] {
  return PRESET_IDS.map(getPreset);
}
