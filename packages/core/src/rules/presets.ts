import { CYANOPHAGE_BANDS, catalogRules, redirectWhere } from './catalog.js';
import type { Rule, RuleSet } from './types.js';

export const PRESET_IDS = ['layouts_doc', 'cyanophage'] as const;
export type PresetId = (typeof PRESET_IDS)[number];

/**
 * The Layouts Doc definitions, each rule carrying the ruler the catalog gives it: the Doc's bounds,
 * SFB's carried on past its last threshold, and LayerBench's own for Effort and LSB.
 */
export function layoutsDoc(): RuleSet {
  return {
    id: 'layouts_doc',
    name: 'Layouts Doc',
    description:
      'Definitions and bands from the Keyboard Layouts Doc (3rd ed.), SFB’s carried on past the Doc’s last threshold and Effort’s LayerBench’s own. Thumbs included, no composite score. Space is excluded unless Space is turned on; SFB and its ≥ 2 rows part are shares of the characters typed either way, the way the Doc’s analyzer counts SFB.',
    globals: {},
    rules: catalogRules(),
    score_enabled: false,
  };
}

/**
 * Column-pair lateral stretches, adjacent-column scissors, bigrams normalized over keystrokes, the
 * characters the layout cannot type among them.
 */
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
          description:
            'cyanophage: keys in adjacent columns, two rows apart, typed by two fingers of one hand.',
          where: {
            all: [
              { same_hand: true },
              { same_finger: false },
              { any_thumb: false },
              { col_delta: { abs: 1 } },
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
        (r.aggregate === 'percent_of_ngrams' || r.aggregate === 'percent_of_symbols') &&
        r.source === 'ngram' &&
        r.ngram?.n === 2
          ? { ...r, aggregate: 'percent_of_keystrokes' }
          : r,
    )
    // The ruler is part of the rule set: this one's SFB reads on cyanophage's own ramp.
    .map((r): Rule => (CYANOPHAGE_BANDS[r.id] ? { ...r, bands: CYANOPHAGE_BANDS[r.id] } : r));

  return {
    id: 'cyanophage',
    name: 'cyanophage-like',
    description:
      'Column-pair LSBs, adjacent-column scissors, bigram percentages over keystrokes (+ one space per word, and the characters the layout cannot type), repeats excluded. SFB is rated on the ramp cyanophage colours it by.',
    globals: {
      space_per_word_in_keystrokes: true,
      untyped_in_keystrokes: true,
      cross_word: 'reset',
    },
    rules,
    score_enabled: false,
  };
}

/** A preset by id; unknown ids fall back to the Layouts Doc set. */
export function getPreset(id: string): RuleSet {
  switch (id) {
    case 'cyanophage':
      return cyanophage();
    default:
      return layoutsDoc();
  }
}

export function allPresets(): RuleSet[] {
  return PRESET_IDS.map(getPreset);
}
