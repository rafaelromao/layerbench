import { catalogRule, catalogRules, type Rule, type RuleSet } from '@layerbench/core';
import {
  buildRule,
  type ComposerPredicate,
  type ComposerState,
  coerceGlobal,
  NEW_COMPOSER,
  parseBounds,
} from './composer.js';

export interface RulesState {
  ruleSet: RuleSet;
  /** Where the current set came from: a preset id, or `saved:<id>`. */
  sourceRef: string;
  dirty: boolean;
  composer: ComposerState;
  jsonText: string;
  jsonError: string | null;
  notice: string | null;
}

export type RulesAction =
  | { type: 'load'; ruleSet: RuleSet; ref: string }
  | { type: 'toggleRule'; id: string }
  | { type: 'removeRule'; id: string }
  | { type: 'restoreRule'; id: string }
  | { type: 'setWeight'; id: string; value: string }
  | { type: 'setBounds'; id: string; value: string }
  | { type: 'setGlobal'; name: string; value: string }
  | { type: 'toggleScore' }
  | { type: 'composerChange'; patch: Partial<ComposerState> }
  | { type: 'composerSetPredicate'; index: number; patch: Partial<ComposerPredicate> }
  | { type: 'composerAddPredicate' }
  | { type: 'composerRemovePredicate'; index: number }
  | { type: 'composerAddRule' }
  | { type: 'exportJson' }
  | { type: 'jsonChange'; text: string }
  | { type: 'importJson'; ruleSet: RuleSet }
  | { type: 'jsonError'; error: string }
  | { type: 'saved'; ref: string }
  | { type: 'clearNotice' };

export function initialRulesState(ruleSet: RuleSet, ref: string): RulesState {
  return {
    ruleSet,
    sourceRef: ref,
    dirty: false,
    composer: NEW_COMPOSER,
    jsonText: '',
    jsonError: null,
    notice: null,
  };
}

function mapRule(state: RulesState, id: string, fn: (rule: Rule) => Rule): RulesState {
  return {
    ...state,
    dirty: true,
    ruleSet: {
      ...state.ruleSet,
      rules: state.ruleSet.rules.map((r) => (r.id === id ? fn(r) : r)),
    },
  };
}

export function rulesReducer(state: RulesState, action: RulesAction): RulesState {
  switch (action.type) {
    case 'load':
      return initialRulesState(action.ruleSet, action.ref);

    case 'toggleRule':
      return mapRule(state, action.id, (r) => ({ ...r, enabled: r.enabled === false }));

    case 'removeRule':
      return {
        ...state,
        dirty: true,
        ruleSet: {
          ...state.ruleSet,
          rules: state.ruleSet.rules.filter((r) => r.id !== action.id),
        },
      };

    case 'restoreRule': {
      const rule = catalogRule(action.id);
      if (!rule || state.ruleSet.rules.some((r) => r.id === action.id)) return state;
      return {
        ...state,
        dirty: true,
        ruleSet: { ...state.ruleSet, rules: [...state.ruleSet.rules, rule] },
      };
    }

    case 'setWeight': {
      const weight = Number.parseFloat(action.value);
      return mapRule(state, action.id, (r) => ({
        ...r,
        score: { weight: Number.isFinite(weight) ? weight : 0 },
      }));
    }

    case 'setBounds': {
      const bounds = parseBounds(action.value);
      return mapRule(state, action.id, (r) => {
        // An empty list means the metric has no bands at all, not bands with no bounds.
        if (bounds.length === 0) {
          const { bands: _bands, ...rest } = r;
          return rest;
        }
        return {
          ...r,
          bands: { direction: r.bands?.direction ?? 'lower_is_better', ...r.bands, bounds },
        };
      });
    }

    case 'setGlobal':
      return {
        ...state,
        dirty: true,
        ruleSet: {
          ...state.ruleSet,
          globals: { ...state.ruleSet.globals, ...coerceGlobal(action.name, action.value) },
        },
      };

    case 'toggleScore':
      return {
        ...state,
        dirty: true,
        ruleSet: { ...state.ruleSet, score_enabled: !state.ruleSet.score_enabled },
      };

    case 'composerChange':
      return { ...state, composer: { ...state.composer, ...action.patch } };

    case 'composerSetPredicate':
      return {
        ...state,
        composer: {
          ...state.composer,
          predicates: state.composer.predicates.map((p, i) =>
            i === action.index ? { ...p, ...action.patch } : p,
          ),
        },
      };

    case 'composerAddPredicate':
      return {
        ...state,
        composer: {
          ...state.composer,
          predicates: [...state.composer.predicates, { type: 'same_finger', value: 'true' }],
        },
      };

    case 'composerRemovePredicate':
      return {
        ...state,
        composer: {
          ...state.composer,
          predicates: state.composer.predicates.filter((_, i) => i !== action.index),
        },
      };

    case 'composerAddRule': {
      const rule = buildRule(state.composer);
      return {
        ...state,
        dirty: true,
        ruleSet: { ...state.ruleSet, rules: [...state.ruleSet.rules, rule] },
        composer: NEW_COMPOSER,
        notice: `Rule ${rule.id} added`,
      };
    }

    case 'exportJson':
      return { ...state, jsonText: JSON.stringify(state.ruleSet, null, 2), jsonError: null };

    case 'jsonChange':
      return { ...state, jsonText: action.text };

    case 'importJson':
      return { ...state, dirty: true, ruleSet: action.ruleSet, jsonError: null };

    case 'jsonError':
      return { ...state, jsonError: action.error };

    case 'saved':
      return { ...state, dirty: false, sourceRef: action.ref };

    case 'clearNotice':
      return { ...state, notice: null };

    default:
      return state;
  }
}

/** Built-in rules the current set no longer contains, so they can be put back. */
export function removedBuiltIns(ruleSet: RuleSet): Rule[] {
  const present = new Set(ruleSet.rules.map((r) => r.id));
  return catalogRules().filter((r) => !present.has(r.id));
}
