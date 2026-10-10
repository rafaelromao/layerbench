import { describe, expect, it } from 'vitest';
import { normalizeText } from '../corpus/normalize.js';
import { FIXTURE_EN } from '../fixtures/index.js';
import { compileLayout } from '../layout/compile.js';
import { swapKeys } from '../layout/ops.js';
import { bundledLayout } from '../layouts/index.js';
import { layoutsDoc } from '../rules/presets.js';
import { analyze } from './analyze.js';
import { relabelEligible, relabelSwap } from './relabel.js';

const OPTS = { caseMode: 'fold' } as const;

/** Every rule that reads only the n-gram tables, so relabeling must reproduce it exactly. */
const NGRAM_RULES = [
  'sfb',
  'sfs',
  'sfb_distance',
  'lsb',
  'fsb',
  'hsb',
  'alternation',
  'rolls',
  'roll_in',
  'roll_out',
  'redirect',
  'onehand_in',
  'finger_usage',
  'hand_balance',
  'pinky_off',
  'home_row',
  'effort',
  'layer_taps_per_100',
];

describe('relabel after a swap', () => {
  const layout = bundledLayout('qwerty')!;
  const compiled = compileLayout(layout);
  const stream = normalizeText(FIXTURE_EN, OPTS);
  const ruleSet = layoutsDoc();

  it('matches a full re-analysis for every n-gram metric', () => {
    const from = 'LTM';
    const to = 'RHI';
    const posA = compiled.keyIndex.get(from)!;
    const posB = compiled.keyIndex.get(to)!;
    expect(relabelEligible(compiled, 0, posA, posB)).toBe(true);

    const before = analyze(compiled, stream, { ...OPTS, ruleSet });
    const swapped = swapKeys(layout, 0, from, to);
    const compiledAfter = compileLayout(swapped);

    const estimated = relabelSwap(before, compiledAfter, 0, posA, posB, ruleSet);
    const full = analyze(compiledAfter, stream, { ...OPTS, ruleSet });

    expect(estimated.provisional).toBe(true);
    expect(full.provisional).toBe(false);

    const value = (r: typeof full, id: string) => r.results.find((x) => x.id === id)?.value ?? null;
    // The swap has to move the numbers, otherwise the comparison proves nothing.
    expect(
      Math.abs((value(full, 'sfb') as number) - (value(before, 'sfb') as number)),
    ).toBeGreaterThan(0.01);

    for (const id of NGRAM_RULES) {
      const a = value(estimated, id);
      const b = value(full, id);
      if (a === null || b === null) {
        expect(a, id).toBe(b);
        continue;
      }
      expect(Math.abs(a - b), `${id}: ${a} vs ${b}`).toBeLessThan(1e-6);
    }
  });

  it('is refused for keys that are not plain symbols and for the space key', () => {
    const magic = compileLayout(bundledLayout('magic-romak')!);
    const thumb = magic.keyIndex.get('R0')!;
    const letter = magic.keyIndex.get('RHM')!;
    expect(relabelEligible(magic, 0, thumb, letter)).toBe(false);

    expect(relabelEligible(compiled, 0, compiled.spaceKey, compiled.keyIndex.get('LHM')!)).toBe(
      false,
    );
    expect(
      relabelEligible(compiled, 0, compiled.keyIndex.get('LHM')!, compiled.keyIndex.get('RHM')!),
    ).toBe(true);
  });

  it('exchanges two bindings on one layer only', () => {
    const swapped = swapKeys(layout, 0, 'LTM', 'RHI');
    expect(swapped.layers[0].bindings.LTM).toEqual(layout.layers[0].bindings.RHI);
    expect(swapped.layers[0].bindings.RHI).toEqual(layout.layers[0].bindings.LTM);
    expect(swapped.layers.length).toBe(layout.layers.length);
  });
});
