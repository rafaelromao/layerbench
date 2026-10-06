import { describe, expect, it } from 'vitest';
import { expandPositions, heatMap, normalizeHeat, usageHeat } from './heat.js';
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
  it('scales against the busiest key', () => {
    expect(normalizeHeat({ 0: 5, 1: 10, 2: 0 })).toEqual({ 0: 0.5, 1: 1 });
    expect(normalizeHeat({})).toEqual({});
    expect(normalizeHeat({ 0: 0 })).toEqual({});
  });

  it('reads usage from the selected layer', () => {
    const dto = reportWith({
      usageByLayer: [
        [10, 0, 0],
        [0, 4, 2],
      ],
    });
    expect(heatMap(dto, 'usage', 0)).toEqual({ 0: 1 });
    expect(heatMap(dto, 'usage', 1)).toEqual({ 1: 1, 2: 0.5 });
    // A layer beyond the end clamps rather than blanking the board.
    expect(heatMap(dto, 'usage', 9)).toEqual({ 1: 1, 2: 0.5 });
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
    expect(heatMap(dto, 'sfb', 1)).toEqual({ 0: 1, 1: 1 });
    // The thumb that reaches a layer is pressed on the base layer, so it is warm there only.
    expect(heatMap(dto, 'layer_taps', 0)).toEqual({ 2: 1 });
    expect(heatMap(dto, 'layer_taps', 1)).toEqual({});
  });

  it('falls back to usage only when the rule set has no such rule', () => {
    const dto = reportWith({ usageByLayer: [[3, 0, 0]] });
    expect(heatMap(dto, 'sfb', 0)).toEqual({ 0: 1 });
  });

  it('sums usage across layers for previews', () => {
    expect(usageHeat(reportWith({ usageAll: [2, 4, 0] }))).toEqual({ 0: 0.5, 1: 1 });
  });

  it('expands a chord position to the keys behind it', () => {
    const dto = reportWith({ members: [[0], [1], [4, 5]] });
    expect(expandPositions(dto, [2])).toEqual([4, 5]);
    expect(expandPositions(dto, [0, 1])).toEqual([0, 1]);
  });
});
