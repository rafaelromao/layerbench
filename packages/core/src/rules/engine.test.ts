import { describe, expect, it } from 'vitest';
import { structureHash } from '../analysis/hash.js';
import { normalizeText } from '../corpus/normalize.js';
import { FIXTURE_EN, FIXTURE_PT } from '../fixtures/index.js';
import { compileLayout } from '../layout/compile.js';
import { bundledLayout, CLASSIC_LAYOUTS } from '../layouts/index.js';
import { simulate } from '../sim/resolver.js';
import { classifyBand } from './bands.js';
import { BANDS, catalogRules, sfbWhere } from './catalog.js';
import { evaluate } from './engine.js';
import { cyanophage, getPreset, keysolve, layoutsDoc } from './presets.js';
import { parseRuleSet, ruleSetFromJson, ruleSetToJson } from './serialize.js';
import type { RuleSet } from './types.js';

const OPTS = { caseMode: 'fold', crossWord: 'reset' } as const;
const text = `${FIXTURE_EN} ${FIXTURE_PT}`;

/**
 * A layout by id, a classic one as written: its letters on one layer, one press a character. The
 * bundled one has the default layers, and types the Portuguese accents through Dead keys.
 */
const layoutOf = (id: string) => CLASSIC_LAYOUTS.find((l) => l.id === id) ?? bundledLayout(id)!;

function run(layoutId: string, ruleSet: RuleSet) {
  const compiled = compileLayout(layoutOf(layoutId));
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
    // One press per symbol, and the space bar's presses type spaces, which are not symbols.
    expect(qwerty.value('extra_keystrokes')).toBe(0);
    const dist = magic.results.find((r) => r.id === 'layer_distribution')!;
    expect(Object.keys(dist.breakdown).length).toBeGreaterThanOrEqual(2);
  });

  it("splits each key's share by the layer it typed from, adding up to the whole", () => {
    for (const id of ['sfb', 'finger_usage']) {
      const r = magic.results.find((x) => x.id === id)!;
      expect(Object.keys(r.per_layer_key).length, id).toBeGreaterThan(1);
      const sum: Record<string, number> = {};
      for (const keys of Object.values(r.per_layer_key)) {
        for (const [pos, v] of Object.entries(keys)) sum[pos] = (sum[pos] ?? 0) + v;
      }
      expect(Object.keys(sum).sort(), id).toEqual(Object.keys(r.per_key).sort());
      for (const [pos, v] of Object.entries(r.per_key)) expect(sum[pos], id).toBeCloseTo(v, 9);
    }
    // A single-layer layout presses everything on its base layer.
    expect(Object.keys(qwerty.results.find((x) => x.id === 'sfb')!.per_layer_key)).toEqual(['0']);
  });

  it('says what a pair that ends on a layer key was pressed for, adding up to the pair', () => {
    const ending = magic.results.flatMap((r) => r.items.filter((i) => i.then));
    expect(ending.length).toBeGreaterThan(0);
    for (const item of ending) {
      const then = item.then!;
      expect(
        then.reduce((a, t) => a + t.share, 0),
        item.label,
      ).toBeCloseTo(1, 9);
      expect(
        then.reduce((a, t) => a + t.percent, 0),
        item.label,
      ).toBeCloseTo(item.percent!, 9);
      const counts = then.map((t) => t.count);
      expect(counts, item.label).toEqual([...counts].sort((a, b) => b - a));
      // Only a pair whose last key brings a layer on has them.
      expect(item.keys, item.label).toHaveLength(2);
    }
    // Magic Romak's thumb that reaches Alpha 2 is pressed for a key on Alpha 2.
    const a2 = ending.find((i) => i.label.endsWith('→A2'));
    expect(a2, 'a pair ending on the A2 thumb').toBeDefined();
    expect(a2!.then![0].layer).toBe(1);
    // A pair that starts on it already names the key it was pressed for.
    const starting = magic.results.flatMap((r) => r.items.filter((i) => /^→A2./.test(i.label)));
    expect(starting.length).toBeGreaterThan(0);
    expect(starting.every((i) => i.then === undefined)).toBe(true);
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

  it('counts each word’s space once in cyanophage’s keystrokes, whether space is counted or not', () => {
    const compiled = compileLayout(layoutOf('qwerty'));
    const sim = simulate(compiled, normalizeText(text, OPTS), OPTS);
    const st = sim.tables.stats;
    const sfbOf = (rs: RuleSet) =>
      evaluate(sim.tables, compiled, rs).results.find((r) => r.id === 'sfb')?.value as number;
    const universe = (rs: RuleSet, u: 'no_space' | 'with_space'): RuleSet => ({
      ...rs,
      globals: { ...rs.globals, universe: u },
    });
    // The same-finger bigrams themselves, counted over bigrams by the Doc.
    const sfbs = (sfbOf(layoutsDoc()) / 100) * sim.tables.noSpace.totals.bigram;
    expect(sfbs).toBeGreaterThan(0);

    // Without space: every other keystroke, plus one space per word.
    const without = sfbOf(universe(cyanophage(), 'no_space'));
    expect(without).toBeCloseTo((sfbs / (st.keystrokes - st.space_presses + st.words)) * 100, 9);

    // With space: the space presses are keystrokes already, and nothing is added.
    const withSfbs =
      (sfbOf(universe(layoutsDoc(), 'with_space')) / 100) * sim.tables.withSpace.totals.bigram;
    const withSpace = sfbOf(universe(cyanophage(), 'with_space'));
    expect(withSpace).toBeCloseTo((withSfbs / st.keystrokes) * 100, 9);
  });

  it('divides pairs by the text’s own pairs, so extra presses do not thin them out', () => {
    const tablesOf = (id: string) => {
      const compiled = compileLayout(layoutOf(id));
      return simulate(compiled, normalizeText(text, OPTS), OPTS).tables;
    };
    // A layout typing each character with one press has exactly the text's totals: nothing it
    // reports moves.
    const q = tablesOf('qwerty');
    expect(q.text.noSpace).toEqual(q.noSpace.totals);
    expect(q.text.withSpace).toEqual(q.withSpace.totals);

    // Magic Romak's layer taps and holds add pairs of its own, but the text has the pairs it has,
    // and that is what its same-finger bigrams are a share of.
    const m = tablesOf('magic-romak');
    expect(m.noSpace.totals.bigram).toBeGreaterThan(m.text.noSpace.bigram);
    expect(m.text.noSpace.unigram).toBe(m.stats.symbols);
    const sfb = catalogRules().find((r) => r.id === 'sfb')!;
    const counting: RuleSet = {
      ...layoutsDoc(),
      rules: [sfb, { ...sfb, id: 'sfb_count', aggregate: 'count' }],
    };
    const compiled = compileLayout(bundledLayout('magic-romak')!);
    const [percent, count] = evaluate(m, compiled, counting).results.map((r) => r.value as number);
    expect(count).toBeGreaterThan(0);
    expect(percent).toBeCloseTo((count / m.text.noSpace.bigram) * 100, 9);
  });

  it('never counts a trigram with a thumb press as a roll or an alternation, but keeps it in the total', () => {
    const piano = compileLayout(bundledLayout('ben-vallack-piano')!);
    const ids = ['alternation', 'rolls', 'roll_in'];
    const asFingers: RuleSet = {
      ...layoutsDoc(),
      rules: [
        {
          id: 'in_with_thumbs',
          ngram: { n: 3 },
          where: { all: [{ hand_pattern: 'aab' }, { direction: 'inward', at: [0, 1] }] },
        },
      ],
    };
    const typed = (word: string) => {
      const tables = simulate(piano, normalizeText(word, OPTS), OPTS).tables;
      const ruleSet: RuleSet = {
        ...layoutsDoc(),
        rules: catalogRules().filter((r) => ids.includes(r.id)),
      };
      return {
        trigrams: tables.noSpace.totals.trigram,
        values: evaluate(tables, piano, ruleSet).results.map((r) => r.value),
        asFingers: evaluate(tables, piano, asFingers).results[0].value,
      };
    };
    // s, e, t: left, right, left.
    expect(typed('set').values).toEqual([100, 0, 0]);
    // e, the right outer thumb tapping Alpha 2, then v on the left hand. Were the thumb a finger,
    // middle finger to thumb would roll inward; it is one trigram, and neither.
    const ev = typed('ev');
    expect(ev.trigrams).toBe(1);
    expect(ev.asFingers).toBe(100);
    expect(ev.values).toEqual([0, 0, 0]);
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
