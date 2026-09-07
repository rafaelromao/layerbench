import {
  bundledLayout,
  catalogRules,
  compileLayout,
  evaluate,
  getPreset,
  normalizeText,
  simulate,
} from '@layoutmaster/core';
import { describe, expect, it } from 'vitest';
import {
  buildRule,
  type ComposerState,
  coerceGlobal,
  NEW_COMPOSER,
  parseBounds,
  predicateLeaf,
} from './composer.js';
import { describeSource, describeWhere } from './describe.js';
import { initialRulesState, removedBuiltIns, rulesReducer } from './reducer.js';

describe('predicate rows', () => {
  it('builds the leaf each type stands for', () => {
    expect(predicateLeaf({ type: 'same_hand', value: 'true' })).toEqual({ same_hand: true });
    expect(predicateLeaf({ type: 'same_finger', value: 'false' })).toEqual({ same_finger: false });
    expect(predicateLeaf({ type: 'row_delta_abs', value: '2' })).toEqual({ row_delta: { abs: 2 } });
    expect(predicateLeaf({ type: 'row_delta_abs_min', value: '2' })).toEqual({
      row_delta: { abs_min: 2 },
    });
    expect(predicateLeaf({ type: 'rank_delta', value: '1' })).toEqual({ rank_delta: { eq: 1 } });
    expect(predicateLeaf({ type: 'x_distance_min', value: '3.5' })).toEqual({
      x_distance: { min: 3.5 },
    });
    expect(predicateLeaf({ type: 'direction', value: 'outward' })).toEqual({
      direction: 'outward',
    });
    expect(predicateLeaf({ type: 'hand_pattern', value: 'aba' })).toEqual({ hand_pattern: 'aba' });
    expect(predicateLeaf({ type: 'finger_name', value: 'pinky' })).toEqual({
      finger_name: { in: ['pinky'] },
    });
    expect(predicateLeaf({ type: 'row', value: '1' })).toEqual({ row: { in: [1] } });
    expect(predicateLeaf({ type: 'key_kind', value: 'layer_tap' })).toEqual({
      key_kind: { in: ['layer_tap'] },
    });
    expect(predicateLeaf({ type: 'finger_height_preference', value: 'violated' })).toEqual({
      finger_height_preference: 'violated',
    });
  });

  it('drops a row whose value will not parse', () => {
    expect(predicateLeaf({ type: 'row_delta_abs', value: 'x' })).toBeNull();
    expect(predicateLeaf({ type: 'hand_pattern', value: '' })).toBeNull();
  });
});

describe('composing a rule', () => {
  const composer: ComposerState = {
    ...NEW_COMPOSER,
    id: 'my rule',
    label: 'My rule',
    family: 'bigram',
    predicates: [
      { type: 'same_hand', value: 'true' },
      { type: 'row_delta_abs', value: '2' },
    ],
    weight: '1.5',
  };

  it('names, shapes and weights the rule', () => {
    const rule = buildRule(composer);
    expect(rule.id).toBe('my-rule');
    expect(rule.label).toBe('My rule');
    expect(rule.ngram).toEqual({ n: 2, skip: 0 });
    expect(rule.where).toEqual({ all: [{ same_hand: true }, { row_delta: { abs: 2 } }] });
    expect(rule.score).toEqual({ weight: 1.5 });
    expect(rule.aggregate).toBe('percent_of_ngrams');
  });

  it('falls back to a generated id and uses it as the label', () => {
    const rule = buildRule({ ...composer, id: '', label: '' });
    expect(rule.id).toMatch(/^custom_\d+$/);
    expect(rule.label).toBe(rule.id);
  });

  it('expands the weighted skip range', () => {
    expect(buildRule({ ...composer, skip: '1-3' }).ngram?.skip).toEqual([1, 2, 3]);
    expect(buildRule({ ...composer, skip: '2' }).ngram?.skip).toBe(2);
  });

  it('produces a rule the engine can actually evaluate', () => {
    const compiled = compileLayout(bundledLayout('qwerty')!);
    const text = 'the quick brown fox jumps over the lazy dog '.repeat(40);
    const stream = normalizeText(text, { caseMode: 'fold' });
    const sim = simulate(compiled, stream, { caseMode: 'fold', crossWord: 'reset' });
    const rule = buildRule({
      ...composer,
      predicates: [
        { type: 'same_hand', value: 'true' },
        { type: 'rank_delta', value: '1' },
      ],
    });
    const { results } = evaluate(sim.tables, compiled, {
      ...getPreset('layouts_doc'),
      rules: [rule],
    });
    expect(results).toHaveLength(1);
    expect(results[0].value).toBeGreaterThan(0);
    expect(results[0].items.length).toBeGreaterThan(0);
  });
});

describe('rule set editing', () => {
  const start = () => initialRulesState(getPreset('layouts_doc'), 'layouts_doc');

  it('disables and re-enables a rule', () => {
    let state = rulesReducer(start(), { type: 'toggleRule', id: 'sfb' });
    expect(state.ruleSet.rules.find((r) => r.id === 'sfb')?.enabled).toBe(false);
    expect(state.dirty).toBe(true);
    state = rulesReducer(state, { type: 'toggleRule', id: 'sfb' });
    expect(state.ruleSet.rules.find((r) => r.id === 'sfb')?.enabled).toBe(true);
  });

  it('removes a rule and offers it back', () => {
    const state = rulesReducer(start(), { type: 'removeRule', id: 'sfb' });
    expect(state.ruleSet.rules.some((r) => r.id === 'sfb')).toBe(false);
    expect(removedBuiltIns(state.ruleSet).map((r) => r.id)).toEqual(['sfb']);

    const restored = rulesReducer(state, { type: 'restoreRule', id: 'sfb' });
    expect(restored.ruleSet.rules.some((r) => r.id === 'sfb')).toBe(true);
    expect(removedBuiltIns(restored.ruleSet)).toEqual([]);
  });

  it('edits bands, and an empty list drops them entirely', () => {
    let state = rulesReducer(start(), { type: 'setBounds', id: 'sfb', value: '1, 2, 3' });
    expect(state.ruleSet.rules.find((r) => r.id === 'sfb')?.bands?.bounds).toEqual([1, 2, 3]);
    state = rulesReducer(state, { type: 'setBounds', id: 'sfb', value: '' });
    expect(state.ruleSet.rules.find((r) => r.id === 'sfb')?.bands).toBeUndefined();
  });

  it('reads each global with its own type', () => {
    expect(coerceGlobal('skip_weights', '0.5, 0.25')).toEqual({ skip_weights: [0.5, 0.25] });
    expect(coerceGlobal('lsb_adjacent_u', '2.5')).toEqual({ lsb_adjacent_u: 2.5 });
    expect(coerceGlobal('lsb_adjacent_u', 'nonsense')).toEqual({ lsb_adjacent_u: 2.0 });
    expect(coerceGlobal('top_items', '20')).toEqual({ top_items: 20 });
    expect(coerceGlobal('space_per_word_in_keystrokes', 'true')).toEqual({
      space_per_word_in_keystrokes: true,
    });
    expect(coerceGlobal('universe', 'with_space')).toEqual({ universe: 'with_space' });
  });

  it('turns the composite score on and off', () => {
    const state = rulesReducer(start(), { type: 'toggleScore' });
    expect(state.ruleSet.score_enabled).toBe(true);
  });

  it('appends a composed rule and announces it', () => {
    const state = rulesReducer(
      { ...start(), composer: { ...NEW_COMPOSER, id: 'mine' } },
      { type: 'composerAddRule' },
    );
    expect(state.ruleSet.rules.at(-1)?.id).toBe('mine');
    expect(state.notice).toBe('Rule mine added');
    // The form resets, ready for the next one.
    expect(state.composer).toEqual(NEW_COMPOSER);
  });

  it('parses band bounds from a loose list', () => {
    expect(parseBounds('1, 2 3')).toEqual([1, 2, 3]);
    expect(parseBounds('   ')).toEqual([]);
  });
});

describe('describing a rule', () => {
  it('writes a predicate back out as text', () => {
    const sfb = catalogRules().find((r) => r.id === 'sfb')!;
    expect(describeWhere(sfb.where)).toContain('same_finger=true');
    expect(describeWhere(sfb.where)).toMatch(/^all\(/);
    expect(describeWhere(null)).toBe('');
  });

  it('says what a rule reads', () => {
    const byId = (id: string) => catalogRules().find((r) => r.id === id)!;
    expect(describeSource(byId('sfb'))).toBe('n=2 skip=0');
    expect(describeSource(byId('layer_taps_per_100'))).toBe('stat=layer_taps_per_100');
    expect(describeSource(byId('same_hand_runs'))).toBe('run by hand');
    expect(describeSource(byId('finger_travel'))).toBe('travel continuous');
  });
});
