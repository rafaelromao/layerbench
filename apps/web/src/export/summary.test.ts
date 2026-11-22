import type { RuleResult } from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import { SUMMARY_IDS } from '../components/Metrics.js';
import { summaryCells } from './summary.js';

/** A rule's result with only what the Summary reads. */
function result(
  id: string,
  value: number | null,
  unit: RuleResult['unit'],
  band: Partial<RuleResult['band']> = {},
  label = id,
): RuleResult {
  return {
    id,
    label,
    value,
    unit,
    band: { index: 1, label: 'good', quality: 'good', ...band },
  } as RuleResult;
}

describe('the Summary of a report', () => {
  const results = [
    result('sfb', 0.84, 'percent', { label: 'very_good' }, 'Same-finger bigrams'),
    result('effort', 6.5, 'effort', { label: 'good', quality: 'ok' }, 'Effort'),
    result('rolls', 41.234, 'percent', { label: null as unknown as string, quality: 'neutral' }),
    result('finger_travel', 3, 'distance'),
  ];

  it('is the page’s metrics, in the page’s order, under the page’s captions', () => {
    expect(summaryCells(results).map((c) => c.id)).toEqual(['effort', 'sfb', 'rolls']);
    expect(summaryCells(results).map((c) => c.label)).toEqual(['Effort', 'SFB', 'Rolls']);
  });

  it('writes each value as the page writes it', () => {
    expect(summaryCells(results).map((c) => c.value)).toEqual(['6.50', '0.84%', '41.23%']);
  });

  it('says the band in words, and how it rates the number', () => {
    const [effort, sfb, rolls] = summaryCells(results);
    expect(effort).toMatchObject({ band: 'good', quality: 'ok' });
    expect(sfb).toMatchObject({ band: 'very good', quality: 'good' });
    // A rule with no band has no word, and is neutral.
    expect(rolls).toMatchObject({ band: '', quality: 'neutral' });
  });

  it('leaves out a metric the rule set does not have, and one the Summary does not list', () => {
    const ids = summaryCells(results).map((c) => c.id);
    expect(ids).not.toContain('finger_travel');
    expect(ids).not.toContain('alternation');
  });

  it('writes a value that was not measured as the page does', () => {
    expect(summaryCells([result('effort', null, 'effort')])[0]?.value).toBe('–');
  });

  it('is empty for a report with none of them', () => {
    expect(summaryCells([])).toEqual([]);
  });

  it('lists as many as the page’s Summary does, and takes another list when given one', () => {
    const everything = SUMMARY_IDS.map((id) => result(id, 1, 'count'));
    expect(summaryCells(everything)).toHaveLength(SUMMARY_IDS.length);
    expect(summaryCells(everything, ['sfb', 'effort']).map((c) => c.id)).toEqual(['sfb', 'effort']);
  });
});
