import type { RuleResult } from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import {
  effectiveHeat,
  expandPositions,
  formatShare,
  heatMap,
  heatSourceOf,
  layerShare,
  normalizeHeat,
} from './heat.js';
import type { ReportDTO } from './protocol.js';

function reportWith(overrides: Partial<ReportDTO>): ReportDTO {
  return {
    key: 'k',
    provisional: false,
    elapsedMs: 1,
    results: [],
    score: { enabled: false, value: null },
    globals: {},
    coverage: { unproducible: [], softDropped: [], excludedByCase: [] },
    stats: {
      symbols: 0,
      words: 0,
      keystrokes: 0,
      space_presses: 0,
      layer_taps: 0,
      one_shot_activations: 0,
      wasted_one_shots: 0,
      hold_presses: 0,
      chords: 0,
      macro_presses: 0,
      adaptive_presses: 0,
      adaptive_trigger_hits: 0,
      repeat_presses: 0,
      per_layer: [],
    },
    usageByLayer: [[0, 0, 0]],
    usageAll: [0, 0, 0],
    layerTapsByLayer: [[0, 0, 0]],
    members: [[0], [1], [2]],
    ...overrides,
  };
}

describe('heat maps', () => {
  it('scales against the busiest key, or against the one it is given', () => {
    expect(normalizeHeat({ 0: 5, 1: 10, 2: 0 })).toEqual({ 0: 0.5, 1: 1 });
    expect(normalizeHeat({ 0: 5, 1: 10, 2: 0 }, 20)).toEqual({ 0: 0.25, 1: 0.5 });
    expect(normalizeHeat({})).toEqual({});
    expect(normalizeHeat({ 0: 0 })).toEqual({});
  });

  it('reads usage from the selected layer, against the busiest key of every layer', () => {
    const dto = reportWith({
      usageByLayer: [
        [10, 0, 0],
        [0, 4, 2],
      ],
    });
    expect(heatMap(dto, 'usage', 0)).toEqual({ 0: 1 });
    expect(heatMap(dto, 'usage', 1)).toEqual({ 1: 0.4, 2: 0.2 });
    // A layer beyond the end clamps rather than blanking the board.
    expect(heatMap(dto, 'usage', 9)).toEqual({ 1: 0.4, 2: 0.2 });
  });

  it('gives an equal press share an equal colour on every layer', () => {
    const dto = reportWith({
      usageByLayer: [
        [10, 5, 0],
        [0, 10, 5],
        [5, 0, 10],
      ],
    });
    // The same count is the same heat, wherever and on whichever layer the key is.
    expect(heatMap(dto, 'usage', 0)).toEqual({ 0: 1, 1: 0.5 });
    expect(heatMap(dto, 'usage', 1)).toEqual({ 1: 1, 2: 0.5 });
    expect(heatMap(dto, 'usage', 2)).toEqual({ 0: 0.5, 2: 1 });
  });

  it('leaves a layer whose keys are all cold cold, next to a hot one', () => {
    const dto = reportWith({
      usageByLayer: [
        [1000, 500, 0],
        [8, 4, 0],
      ],
    });
    // Scaled against its own busiest key, the second layer's 8 would be drawn at full heat.
    expect(heatMap(dto, 'usage', 1)).toEqual({ 0: 0.008, 1: 0.004 });
    expect(Math.max(...Object.values(heatMap(dto, 'usage', 1)))).toBeLessThan(0.01);
  });

  it('gives the hottest key of all layers the top of the scale, and no key more', () => {
    const dto = reportWith({
      usageByLayer: [
        [3, 1, 0],
        [0, 12, 6],
        [2, 0, 0],
      ],
    });
    const layers = [0, 1, 2].map((l) => Object.values(heatMap(dto, 'usage', l)));
    expect(Math.max(...layers.flat())).toBe(1);
    // Only the layer the busiest key is on reaches it.
    expect(layers.map((heats) => Math.max(0, ...heats))).toEqual([0.25, 1, 1 / 6]);
  });

  it('scales every mode against all layers, not the one shown', () => {
    const dto = reportWith({
      usageByLayer: [
        [10, 4, 0],
        [0, 4, 2],
      ],
      layerTapsByLayer: [
        [0, 0, 6],
        [0, 0, 3],
      ],
      results: [
        rule('sfb', { 0: { 0: 4 }, 1: { 0: 2, 1: 1 } }),
        rule('effort', { 0: { 1: 9 }, 1: { 1: 3 } }),
        rule('finger_travel', { 0: { 2: 2 }, 1: { 2: 8 } }),
      ],
    });
    expect(heatMap(dto, 'usage', 0)).toEqual({ 0: 1, 1: 0.4 });
    expect(heatMap(dto, 'usage', 1)).toEqual({ 1: 0.4, 2: 0.2 });
    expect(heatMap(dto, 'layer_taps', 0)).toEqual({ 2: 1 });
    expect(heatMap(dto, 'layer_taps', 1)).toEqual({ 2: 0.5 });
    expect(heatMap(dto, 'sfb', 0)).toEqual({ 0: 1 });
    expect(heatMap(dto, 'sfb', 1)).toEqual({ 0: 0.5, 1: 0.25 });
    expect(heatMap(dto, 'effort', 0)).toEqual({ 1: 1 });
    expect(heatMap(dto, 'effort', 1)).toEqual({ 1: 1 / 3 });
    expect(heatMap(dto, 'travel', 0)).toEqual({ 2: 0.25 });
    expect(heatMap(dto, 'travel', 1)).toEqual({ 2: 1 });
  });

  it('draws the usage of all positions when a report has no layers of its own', () => {
    const dto = reportWith({ usageByLayer: [], usageAll: [2, 8, 0] });
    expect(heatMap(dto, 'usage', 0)).toEqual({ 0: 0.25, 1: 1 });
    expect(heatMap(dto, 'usage', 3)).toEqual({ 0: 0.25, 1: 1 });
  });

  it('maps the travel mode to the finger travel rule', () => {
    const dto = reportWith({
      usageByLayer: [[1, 0, 0]],
      results: [
        {
          id: 'finger_travel',
          label: 'Finger travel',
          family: 'usage',
          value: 1,
          unit: 'distance',
          band: { index: null, label: null, quality: 'neutral' },
          items: [],
          per_finger: {},
          per_key: { 2: 8 },
          per_layer_key: { 0: { 2: 8 } },
          key_scale: 1 / 8,
          per_hand: {},
          breakdown: {},
          note: null,
          enabled: true,
          score_weight: 0,
          normalized: null,
        },
      ],
    });
    // Looked up under the mode's own name, the rule would be missed and usage shown instead.
    expect(heatMap(dto, 'travel', 0)).toEqual({ 2: 1 });
    // A layer the rule credits nothing on is cold, not drawn as usage.
    expect(
      heatMap(
        {
          ...dto,
          usageByLayer: [
            [1, 0, 0],
            [5, 0, 0],
          ],
        },
        'travel',
        1,
      ),
    ).toEqual({});
  });

  it('draws a rule and the layer taps on the layer they were pressed on, and nowhere else', () => {
    const dto = reportWith({
      usageByLayer: [
        [1, 0, 0],
        [0, 1, 0],
      ],
      layerTapsByLayer: [
        [0, 0, 6],
        [0, 0, 0],
      ],
      results: [
        {
          id: 'sfb',
          label: 'Same finger bigrams',
          family: 'bigram',
          value: 1,
          unit: 'percent',
          band: { index: null, label: null, quality: 'neutral' },
          items: [],
          per_finger: {},
          // Position 0 had SFBs on both layers; position 1 on the upper layer only.
          per_key: { 0: 6, 1: 2 },
          per_layer_key: { 0: { 0: 4 }, 1: { 0: 2, 1: 2 } },
          key_scale: 0.1,
          per_hand: {},
          breakdown: {},
          note: null,
          enabled: true,
          score_weight: 0,
          normalized: null,
        },
      ],
    });
    expect(heatMap(dto, 'sfb', 0)).toEqual({ 0: 1 });
    // Against the 4 on the base layer, the 2 and 2 on the upper one are half.
    expect(heatMap(dto, 'sfb', 1)).toEqual({ 0: 0.5, 1: 0.5 });
    // The thumb that reaches a layer is pressed on the base layer, so it is warm there only.
    expect(heatMap(dto, 'layer_taps', 0)).toEqual({ 2: 1 });
    expect(heatMap(dto, 'layer_taps', 1)).toEqual({});
  });

  it('falls back to usage only when the rule set has no such rule', () => {
    const dto = reportWith({ usageByLayer: [[3, 0, 0]] });
    expect(heatMap(dto, 'sfb', 0)).toEqual({ 0: 1 });
  });

  it('expands a chord position to the keys behind it', () => {
    const dto = reportWith({ members: [[0], [1], [4, 5]] });
    expect(expandPositions(dto, [2])).toEqual([4, 5]);
    expect(expandPositions(dto, [0, 1])).toEqual([0, 1]);
  });
});

/** A rule as a report carries it, with only what the heat reads filled in. */
function rule(id: string, perLayerKey: Record<number, Record<number, number>>): RuleResult {
  return { id, per_layer_key: perLayerKey, per_key: {} } as unknown as RuleResult;
}

describe('heat sources', () => {
  const dto = reportWith({
    usageByLayer: [
      [10, 4, 0],
      [0, 4, 2],
    ],
    usageAll: [10, 8, 2],
    layerTapsByLayer: [
      [0, 0, 6],
      [0, 0, 0],
    ],
    results: [
      rule('sfb', { 0: { 0: 4 }, 1: { 0: 2, 1: 2 } }),
      rule('effort', { 0: { 1: 9 } }),
      rule('finger_travel', { 1: { 2: 3 } }),
      rule('alternation', { 0: { 0: 99 } }),
    ],
  });

  it('draws every mode and layer as the report it was made from does', () => {
    const source = heatSourceOf(dto);
    for (const mode of ['usage', 'sfb', 'effort', 'travel', 'layer_taps'] as const) {
      for (const layer of [0, 1, 9]) {
        expect(heatMap(source, mode, layer)).toEqual(heatMap(dto, mode, layer));
      }
    }
  });

  it('keeps only what a heat map reads, so the rest of the report can be let go', () => {
    const source = heatSourceOf(dto);
    expect(Object.keys(source).sort()).toEqual([
      'layerTapsByLayer',
      'results',
      'usageAll',
      'usageByLayer',
    ]);
    expect(source.results.map((r) => r.id)).toEqual(['sfb', 'effort', 'finger_travel']);
    expect(source.results.every((r) => Object.keys(r).sort().join() === 'id,per_layer_key')).toBe(
      true,
    );
  });

  it('says what is really drawn: usage where the rule set lacks the rule asked for', () => {
    const source = heatSourceOf(dto);
    expect(effectiveHeat(source, 'usage')).toBe('usage');
    expect(effectiveHeat(source, 'layer_taps')).toBe('layer_taps');
    expect(effectiveHeat(source, 'travel')).toBe('travel');
    const without = heatSourceOf(reportWith({ results: [rule('sfb', {})] }));
    expect(effectiveHeat(without, 'sfb')).toBe('sfb');
    expect(effectiveHeat(without, 'effort')).toBe('usage');
    expect(effectiveHeat(without, 'travel')).toBe('usage');
    // The map is the one it says: usage, not a blank board.
    expect(heatMap(without, 'effort', 0)).toEqual(heatMap(without, 'usage', 0));
  });
});

describe('the share of the typing on a layer', () => {
  const source = heatSourceOf(
    reportWith({
      usageByLayer: [
        [30, 20, 25],
        [0, 15, 10],
        [0, 0, 0],
      ],
      usageAll: [30, 35, 35],
    }),
  );

  it('is the presses on the layer over all presses, and sums to 1 over the layers', () => {
    expect(layerShare(source, 0)).toBeCloseTo(0.75);
    expect(layerShare(source, 1)).toBeCloseTo(0.25);
    expect(layerShare(source, 2)).toBe(0);
    const sum = [0, 1, 2].reduce((a, l) => a + layerShare(source, l), 0);
    expect(sum).toBeCloseTo(1);
  });

  it('does not depend on the heat mode, and is 0 where nothing was pressed', () => {
    expect(layerShare(heatSourceOf(reportWith({})), 0)).toBe(0);
  });

  it('is written with one decimal at most', () => {
    expect(formatShare(0.925)).toBe('92.5%');
    expect(formatShare(0.075)).toBe('7.5%');
    expect(formatShare(0)).toBe('0%');
    expect(formatShare(1)).toBe('100%');
  });
});
