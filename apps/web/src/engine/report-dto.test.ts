import { analyze, compileLayout, type Layout, layoutsDoc } from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import { toReportDTO } from './report-dto.js';

const kp = (symbol: string) => ({ kind: 'kp', symbol }) as const;

/** Letters on the base layer, and `q` and `z` on Up, reached by a thumb's one-shot. */
const layout: Layout = {
  format: 'layerbench/layout@1',
  name: 'taps',
  geometry: { preset: '3x5+2' },
  keys: { space: 'L0' },
  layers: [
    {
      id: 'base',
      bindings: { LHP: kp('a'), L0: kp(' '), R0: { kind: 'sl', layer: 'up' } },
    },
    { id: 'up', name: 'Up', bindings: { RHP: kp('q'), RHR: kp('z') } },
  ],
};

describe('the layer taps drawn on the board', () => {
  const compiled = compileLayout(layout);

  it('are the ones the layer taps rule credits each key with, with space or without', () => {
    for (const universe of ['no_space', 'with_space'] as const) {
      const base = layoutsDoc();
      const ruleSet = { ...base, globals: { ...base.globals, universe } };
      const report = analyze(compiled, 'aq az aq', { ruleSet });
      const heat = toReportDTO(report, 'taps').layerTapsByLayer;
      expect(heat[0][compiled.keyIndex.get('R0')!], universe).toBe(report.stats.layer_taps);
      const rule = report.results.find((r) => r.id === 'layer_taps_per_100')!;
      heat.forEach((keys, layer) => {
        const credited = (rule.per_layer_key[layer] ?? {}) as Record<number, number>;
        keys.forEach((taps, key) => {
          expect(taps, `${universe} layer ${layer} key ${key}`).toBe(credited[key] ?? 0);
        });
      });
    }
  });
});
