import { describe, expect, it } from 'vitest';
import { structureHash } from '../analysis/hash.js';
import { normalizeText } from '../corpus/normalize.js';
import { FIXTURE_EN, FIXTURE_PT } from '../fixtures/index.js';
import { compileLayout } from '../layout/compile.js';
import { bundledLayout } from '../layouts/index.js';
import { simulate } from '../sim/resolver.js';
import { classifyBand } from './bands.js';
import { BANDS, catalogRules, sfbWhere } from './catalog.js';
import { evaluate } from './engine.js';
import { cyanophage, getPreset, keysolve, layoutsDoc } from './presets.js';
import { parseRuleSet, ruleSetFromJson, ruleSetToJson } from './serialize.js';
import type { RuleSet } from './types.js';

const OPTS = { caseMode: 'fold', crossWord: 'reset' } as const;
const text = `${FIXTURE_EN} ${FIXTURE_PT}`;

function run(layoutId: string, ruleSet: RuleSet) {
  const compiled = compileLayout(bundledLayout(layoutId)!);
  const sim = simulate(compiled, normalizeText(text, OPTS), OPTS);
  const { results, score } = evaluate(sim.tables, compiled, ruleSet);
  return { results, score, value: (id: string) => results.find((r) => r.id === id)?.value ?? null };
}

/**
 * A rule set with weights and scoring on. No shipped preset enables the composite score, so the
 * scoring path and the weighted JSON round-trip need a set of their own.
 */
function weightedSet(): RuleSet {
  const weights: Record<string, number> = { sfb: 3, sfs: 1, redirect: 1, alternation: 0.5 };
  return {
    id: 'weighted',
    name: 'Weighted',
    description: 'Doc rules with a few families weighted and the composite score enabled.',
    globals: {},
    rules: catalogRules().map((r) => ({ ...r, score: { weight: weights[r.id] ?? 0 } })),
    score_enabled: true,
  };
}

describe('rules engine', () => {
  const qwerty = run('qwerty', layoutsDoc());
  const magic = run('magic-romak', layoutsDoc());

  it('evaluates every catalog rule', () => {
    expect(qwerty.results.length).toBe(catalogRules().length);
    for (const r of qwerty.results) {
      expect(r.value === null || Number.isFinite(r.value), r.id).toBe(true);
    }
  });

  it('finds the well-known Qwerty same-finger bigrams', () => {
    const sfb = qwerty.results.find((r) => r.id === 'sfb')!;
    expect(sfb.value).toBeGreaterThan(3);
    expect(sfb.band.quality).toBe('bad');
    expect(sfb.items.some((i) => i.label === 'ed' || i.label === 'de')).toBe(true);
  });

  it('keeps trigram categories disjoint and rolls consistent', () => {
    const sum = ['alternation', 'roll_in', 'roll_out', 'onehand_in', 'onehand_out', 'redirect']
      .map((id) => qwerty.value(id) as number)
      .reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThan(60);
    expect(sum).toBeLessThanOrEqual(100);
    expect(
      Math.abs(
        (qwerty.value('rolls') as number) -
          ((qwerty.value('roll_in') as number) + (qwerty.value('roll_out') as number)),
      ),
    ).toBeLessThan(1e-6);
  });

  it('distributes usage to 100 percent', () => {
    const usage = qwerty.results.find((r) => r.id === 'finger_usage')!;
    const total = Object.values(usage.per_finger).reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 100)).toBeLessThan(0.01);
    const hands = qwerty.results.find((r) => r.id === 'hand_balance')!;
    expect(Math.abs(Object.values(hands.per_hand).reduce((a, b) => a + b, 0) - 100)).toBeLessThan(
      0.01,
    );
  });

  it('reports layer costs for a multi-layer alpha and none for a single-layer one', () => {
    expect(magic.value('sfb')).toBeLessThan(qwerty.value('sfb') as number);
    expect(magic.value('layer_taps_per_100')).toBeGreaterThan(0);
    expect(magic.value('extra_keystrokes')).toBeGreaterThan(0);
    expect(qwerty.value('layer_taps_per_100')).toBe(0);
    const dist = magic.results.find((r) => r.id === 'layer_distribution')!;
    expect(Object.keys(dist.breakdown).length).toBeGreaterThanOrEqual(2);
  });

  it('computes the in:out ratio after the other rules', () => {
    const expected = (qwerty.value('roll_in') as number) / (qwerty.value('roll_out') as number);
    expect(Math.abs((qwerty.value('in_out_ratio') as number) - expected)).toBeLessThan(1e-6);
    expect(qwerty.results[qwerty.results.length - 1].id).toBe('in_out_ratio');
  });

  it('classifies bands per the Doc thresholds', () => {
    expect(classifyBand(0.5, BANDS.sfb).label).toBe('min');
    expect(classifyBand(1.2, BANDS.sfb).label).toBe('mid_high');
    expect(classifyBand(2.0, BANDS.sfb).quality).toBe('bad');
    expect(classifyBand(40.0, BANDS.alt).quality).toBe('good');
    expect(classifyBand(null, BANDS.sfb).quality).toBe('neutral');
  });

  it('changes definitions and normalization per preset', () => {
    const cyan = run('qwerty', cyanophage());
    expect(cyan.value('sfb')).toBeLessThan(qwerty.value('sfb') as number);
    expect(getPreset('nope').id).toBe('layouts_doc');
  });

  it('computes a composite score when the set enables it', () => {
    const scored = run('qwerty', weightedSet());
    expect(scored.score.enabled).toBe(true);
    expect(typeof scored.score.value).toBe('number');
    // No preset ships with scoring on, so an unweighted set must leave it off.
    expect(run('qwerty', keysolve()).score.enabled).toBe(false);
  });

  it('round-trips rule sets through JSON', () => {
    const json = ruleSetToJson(weightedSet());
    const back = ruleSetFromJson(json);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.ruleSet.id).toBe('weighted');
    expect(back.ruleSet.score_enabled).toBe(true);
    expect(back.ruleSet.rules.find((r) => r.id === 'sfb')?.score?.weight).toBe(3);
    const sfb = back.ruleSet.rules.find((r) => r.id === 'sfb')!;
    expect(sfb.where).toEqual(sfbWhere());
    expect(sfb.ngram).toEqual({ n: 2, skip: 0 });
    expect(sfb.aggregate).toBe('percent_of_ngrams');
    expect(sfb.bands?.direction).toBe('lower_is_better');
  });

  it('rejects malformed rule sets with a readable message', () => {
    expect(ruleSetFromJson('not json').ok).toBe(false);
    expect(ruleSetFromJson('[]').ok).toBe(false);
    const missing = ruleSetFromJson('{"name":"x"}');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain('rules');
  });

  it('evaluates a rule composed by hand', () => {
    const custom: RuleSet = {
      ...layoutsDoc(),
      rules: [
        parseRuleSet({
          rules: [
            {
              id: 'ring_below_middle',
              label: 'Ring lower than middle, one row apart',
              family: 'bigram',
              source: 'ngram',
              ngram: { n: 2, skip: 0 },
              where: {
                all: [
                  { same_hand: true },
                  { finger_name_pair: ['ring', 'middle'] },
                  { row_delta: { abs: 1 } },
                ],
              },
              aggregate: 'percent_of_ngrams',
            },
          ],
        }).rules[0],
      ],
    };
    const r = run('qwerty', custom);
    expect(r.value('ring_below_middle')).toBeGreaterThan(0);
    expect(r.results[0].items.length).toBeGreaterThan(0);
  });

  it('hashes analysis identity stably and by case mode', () => {
    const layout = bundledLayout('qwerty')!;
    const a = structureHash(layout, { caseMode: 'fold', corpusId: 'x' });
    expect(structureHash(layout, { caseMode: 'fold', corpusId: 'x' })).toBe(a);
    expect(structureHash(layout, { caseMode: 'model', corpusId: 'x' })).not.toBe(a);
    expect(structureHash(bundledLayout('dvorak')!, { caseMode: 'fold', corpusId: 'x' })).not.toBe(
      a,
    );
  });
});
