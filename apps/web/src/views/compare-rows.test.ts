import type { RuleResult } from '@layoutmaster/core';
import { describe, expect, it } from 'vitest';
import { compareRows } from './compare-rows.js';

function result(id: string, value: number | null, withBand = true): RuleResult {
  return {
    id,
    label: id,
    family: 'bigram',
    value,
    unit: 'percent',
    band: withBand
      ? { index: 1, label: 'low', quality: 'good', goodness: 0.8 }
      : { index: null, label: null, quality: 'neutral' },
    items: [],
    per_finger: {},
    per_key: {},
    per_hand: {},
    breakdown: {},
    note: null,
    enabled: true,
    score_weight: 0,
    normalized: null,
  };
}

describe('comparing two reports', () => {
  it('reports the delta from A to B', () => {
    const rows = compareRows([result('sfb', 2)], [result('sfb', 1.5)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].delta).toBeCloseTo(-0.5, 10);
  });

  it('knows which direction is an improvement', () => {
    // Fewer same-finger bigrams is better.
    expect(compareRows([result('sfb', 2)], [result('sfb', 1)])[0].winner).toBe('b');
    expect(compareRows([result('sfb', 1)], [result('sfb', 2)])[0].winner).toBe('a');
    // More alternation is better.
    expect(compareRows([result('alternation', 30)], [result('alternation', 35)])[0].winner).toBe(
      'b',
    );
    expect(compareRows([result('alternation', 35)], [result('alternation', 30)])[0].winner).toBe(
      'a',
    );
  });

  it('judges unbanded metrics by the same direction rule', () => {
    // The reference read direction from the presence of a band, which crowned the wrong side here.
    const rows = compareRows(
      [result('sfb_distance', 3, false)],
      [result('sfb_distance', 2, false)],
    );
    expect(rows[0].winner).toBe('b');
  });

  it('calls an immaterial difference a tie', () => {
    expect(compareRows([result('sfb', 1)], [result('sfb', 1)])[0].winner).toBe('tie');
    expect(compareRows([result('sfb', 1)], [result('sfb', 1 + 1e-12)])[0].winner).toBe('tie');
  });

  it('keeps a metric the other side lacks, with no delta', () => {
    const rows = compareRows([result('sfb', 2)], []);
    expect(rows[0].b).toBeUndefined();
    expect(rows[0].delta).toBeNull();
    expect(rows[0].winner).toBe('tie');
  });

  it('skips metrics without a numeric value', () => {
    expect(compareRows([result('sfb', null)], [result('sfb', 1)])).toEqual([]);
  });
});
