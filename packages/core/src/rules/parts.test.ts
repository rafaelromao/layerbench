import { describe, expect, it } from 'vitest';
import { analyze } from '../analysis/analyze.js';
import { keyStats } from '../analysis/key-stats.js';
import { normalizeText } from '../corpus/normalize.js';
import { FIXTURE_MIXED } from '../fixtures/index.js';
import { keyDistance } from '../geometry/distance.js';
import { compileLayout } from '../layout/compile.js';
import type { Layout } from '../layout/types.js';
import { bundledLayout } from '../layouts/index.js';
import { sfbWhere } from './catalog.js';
import { defaultEffort } from './effort.js';
import { keyPart } from './parts.js';
import { allPresets, layoutsDoc } from './presets.js';
import type { RuleResult, RuleSet } from './types.js';

const stream = normalizeText(FIXTURE_MIXED, { caseMode: 'fold' });

/** Every key's part, on every layer, added up. */
function sumOfParts(r: RuleResult): number {
  let sum = 0;
  for (const keys of Object.values(r.per_layer_key))
    for (const v of Object.values(keys)) sum += v * (r.key_scale ?? 0);
  return sum;
}

function expectPartsAddUp(results: RuleResult[]): number {
  let checked = 0;
  for (const r of results) {
    if (r.key_scale === null || typeof r.value !== 'number') continue;
    expect(Math.abs(sumOfParts(r) - r.value), `${r.id}`).toBeLessThan(
      1e-9 * Math.max(1, Math.abs(r.value)),
    );
    checked++;
  }
  return checked;
}

describe("each key's part of a number", () => {
  it('adds up to the number, for every rule of every preset, on Qwerty and Magic Romak', () => {
    for (const id of ['qwerty', 'magic-romak']) {
      const layout = bundledLayout(id) as Layout;
      for (const ruleSet of allPresets()) {
        const report = analyze(layout, stream, { ruleSet, maxSymbols: 20_000 });
        expect(expectPartsAddUp(report.results)).toBeGreaterThan(10);
      }
    }
  });

  it('adds up for every way a rule can sum: counts, per 100, distances, effort over pairs, travel', () => {
    const base = layoutsDoc();
    const ruleSet: RuleSet = {
      ...base,
      rules: [
        {
          id: 'c',
          source: 'ngram',
          ngram: { n: 2, skip: 0 },
          where: sfbWhere(),
          aggregate: 'count',
        },
        {
          id: 'p',
          source: 'ngram',
          ngram: { n: 2, skip: 0 },
          where: sfbWhere(),
          aggregate: 'per100',
          aggregate_opts: { per: 'words' },
        },
        {
          id: 'm',
          source: 'ngram',
          ngram: { n: 2, skip: 0 },
          where: sfbWhere(),
          aggregate: 'mean_distance',
        },
        {
          id: 's',
          source: 'ngram',
          ngram: { n: 2, skip: [1, 2] },
          where: sfbWhere(),
          aggregate: 'sum_distance',
        },
        { id: 'w', source: 'ngram', ngram: { n: 2, skip: 0 }, aggregate: 'weighted_sum' },
        { id: 't', source: 'travel', travel_mode: 'reset_at_word' },
      ],
    };
    const report = analyze(bundledLayout('magic-romak') as Layout, stream, {
      ruleSet,
      maxSymbols: 20_000,
    });
    expect(expectPartsAddUp(report.results)).toBe(6);
  });

  it('credits Effort by cost: a key that costs nothing has no part, however often pressed', () => {
    const layout = bundledLayout('qwerty') as Layout;
    const compiled = compileLayout(layout);
    const report = analyze(compiled, stream, { maxSymbols: 20_000 });
    const effort = report.results.find((r) => r.id === 'effort') as RuleResult;
    const grid = defaultEffort(compiled);
    const f = compiled.keyIndex.get('LHI') as number; // home index: free
    const e = compiled.keyIndex.get('LTM') as number; // top middle: costs 1
    expect(grid.LHI).toBe(0);
    expect(keyPart(effort, f, 0) ?? 0).toBe(0);
    expect(keyPart(effort, e, 0)).toBeGreaterThan(0);
    // The part is its cost times its presses, scaled as the value is.
    const presses = [...report.simulation.noSpace.unigram]
      .filter(([id]) => report.simulation.registry.get(id)?.pos === e)
      .reduce((sum, [, c]) => sum + c, 0);
    expect(keyPart(effort, e, 0)).toBeCloseTo(grid.LTM * presses * (effort.key_scale ?? 0), 9);
  });

  it('credits Finger travel to the key the finger moved to', () => {
    const layout = bundledLayout('qwerty') as Layout;
    const compiled = compileLayout(layout);
    const ruleSet: RuleSet = { ...layoutsDoc(), rules: [{ id: 't', source: 'travel' }] };
    // f r: the left index goes from its home key to R, which takes all the travel.
    const report = analyze(compiled, 'r', { ruleSet });
    const travel = report.results[0];
    const r = compiled.keyIndex.get('LTI') as number;
    const d = keyDistance(
      compiled.keys[compiled.keyIndex.get('LHI') as number],
      compiled.keys[r],
      'euclid',
    );
    expect(travel.per_key).toEqual({ [r]: d });
    expect(keyPart(travel, r)).toBeCloseTo(travel.value as number, 12);
  });
});

describe("a key's own n-grams", () => {
  const layout = bundledLayout('magic-romak') as Layout;
  const ruleSet = { ...layoutsDoc(), globals: { ...layoutsDoc().globals, top_items: 1_000_000 } };
  const report = analyze(layout, stream, { ruleSet, maxSymbols: 20_000 });

  it("lists, for each rule, the card's own n-grams with the key in them, in the card's order", () => {
    const sfb = report.results.find((r) => r.id === 'sfb') as RuleResult;
    // The first key of the busiest same-finger pair, on the layer it was pressed on.
    const key = report.compiled.positions[sfb.items[0].keys[0]].members[0];
    const layer = sfb.items[0].layers?.[0] ?? 0;
    const focus = keyStats(report, key, layer, { limit: 1_000_000 });
    const filtered = sfb.items.filter((it) =>
      it.keys.some(
        (p, i) => it.layers?.[i] === layer && report.compiled.positions[p].members.includes(key),
      ),
    );
    const own = focus.rules.find((r) => r.id === 'sfb');
    expect(filtered.length).toBeGreaterThan(0);
    expect(own?.items).toEqual(filtered);
  });

  it('says what a layer key was pressed for, the shares adding up to one', () => {
    const r0 = report.compiled.keyIndex.get('R0') as number;
    const { next } = keyStats(report, r0, 0);
    expect(next.length).toBeGreaterThan(3);
    expect(next.reduce((s, n) => s + n.share, 0)).toBeCloseTo(1, 12);
    const alpha2 = report.compiled.layerIndex.get('alpha2');
    expect(next.filter((n) => n.layer === alpha2).length).toBeGreaterThan(0);
    // A letter is pressed for itself, not for what follows.
    expect(keyStats(report, report.compiled.keyIndex.get('RHM') as number, 0).next).toEqual([]);
  });
});
