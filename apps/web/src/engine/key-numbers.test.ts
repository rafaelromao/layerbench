import { analyze, compileLayout, type Layout, layoutsDoc } from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import { keyNumbers, pressShares } from './key-numbers.js';
import { toReportDTO } from './report-dto.js';

const kp = (symbol: string) => ({ kind: 'kp', symbol }) as const;

/**
 * Letters on the base layer, a tap-hold that types `b` and holds Shift, and `q` and `z` on Up,
 * reached by a thumb's one-shot. No combos, so the keys are every position there is.
 */
const layout: Layout = {
  format: 'layerbench/layout@1',
  name: 'shares',
  geometry: { preset: '3x5+2' },
  keys: { space: 'L0' },
  layers: [
    {
      id: 'base',
      bindings: {
        LHP: kp('a'),
        LHR: { kind: 'hold_tap', tap: kp('b'), hold: { kind: 'mod', mod: 'LSHIFT' } },
        L0: kp(' '),
        R0: { kind: 'sl', layer: 'up' },
      },
    },
    { id: 'up', name: 'Up', bindings: { RHP: kp('q'), RHR: kp('z') } },
  ],
};

describe('a key’s share of the presses', () => {
  const compiled = compileLayout(layout);
  const pos = (id: string) => compiled.keyIndex.get(id) as number;
  const report = analyze(compiled, 'aq ab az aa', { ruleSet: layoutsDoc() });
  const dto = toReportDTO(report, 'shares');
  const shares = dto.usageByLayer.map((_, layer) => pressShares(dto, layer) ?? {});
  const total = dto.usageAll.reduce((a, b) => a + b, 0);

  it('adds up to 1 over every key of every layer', () => {
    expect(total).toBeGreaterThan(0);
    const sum = shares.flatMap((row) => Object.values(row)).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('is each key’s presses over all of them, the share its numbers give', () => {
    dto.usageByLayer.forEach((onLayer, layer) => {
      onLayer.forEach((presses, key) => {
        expect(shares[layer][key] ?? 0, `layer ${layer} key ${key}`).toBeCloseTo(
          presses / total,
          12,
        );
        const numbers = keyNumbers(dto, key, layer);
        expect(numbers.presses / numbers.total, `layer ${layer} key ${key}`).toBeCloseTo(
          shares[layer][key] ?? 0,
          12,
        );
      });
    });
  });

  it('counts a thumb tapped for a layer where it is tapped, on no other layer', () => {
    const tapped = report.stats.layer_taps;
    expect(tapped).toBeGreaterThan(0);
    expect(shares[0][pos('R0')]).toBeCloseTo(tapped / total, 12);
    expect(shares[1][pos('R0')]).toBeUndefined();
    // The keys it leads to are counted on the layer they are pressed on.
    expect(shares[1][pos('RHP')]).toBeGreaterThan(0);
    expect(shares[0][pos('RHP')]).toBeUndefined();
  });

  it('counts a tap-hold key’s presses on its own key', () => {
    // The text has one `b`, and the tap-hold types it.
    expect(shares[0][pos('LHR')]).toBeCloseTo(1 / total, 12);
    // `a` is typed five times.
    expect(shares[0][pos('LHP')]).toBeCloseTo(5 / total, 12);
  });

  it('leaves out the keys never pressed, and has no share for a layer the report lacks', () => {
    expect(Object.keys(shares[0])).not.toContain(String(pos('RHP')));
    expect(pressShares(dto, dto.usageByLayer.length)).toBeUndefined();
    expect(pressShares({ usageByLayer: [[0, 0]], usageAll: [0, 0] }, 0)).toEqual({});
  });
});
