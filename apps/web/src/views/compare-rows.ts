import type { RuleResult } from '@layoutmaster/core';
import { HEADLINE_IDS } from '../components/Metrics.js';

/**
 * Metrics where a bigger number is the better one. Everything else reads the other way, so a
 * negative delta is an improvement.
 */
const HIGHER_IS_BETTER = new Set([
  'alternation',
  'rolls',
  'roll_in',
  'roll_out',
  'onehand_in',
  'onehand_out',
  'in_out_ratio',
  'home_row',
  'adaptive_hit_rate',
]);

export type Winner = 'a' | 'b' | 'tie';

export interface CompareRow {
  id: string;
  label: string;
  family: string;
  unit: RuleResult['unit'];
  a: RuleResult;
  b: RuleResult | undefined;
  delta: number | null;
  winner: Winner;
}

/**
 * Pair up two reports metric by metric. The reference decided direction from whether a rule carried
 * a band, which crowned the wrong side for unbanded rules; direction is a property of the metric,
 * so it is read from the metric alone.
 */
export function compareRows(aResults: RuleResult[], bResults: RuleResult[]): CompareRow[] {
  const byId = new Map(bResults.map((r) => [r.id, r]));
  const rows: CompareRow[] = [];

  for (const a of aResults) {
    if (typeof a.value !== 'number') continue;
    const b = byId.get(a.id);
    const delta = typeof b?.value === 'number' ? b.value - a.value : null;

    let winner: Winner = 'tie';
    if (delta !== null && Math.abs(delta) >= 1e-9) {
      const bIsBetter = HIGHER_IS_BETTER.has(a.id) ? delta > 0 : delta < 0;
      winner = bIsBetter ? 'b' : 'a';
    }

    rows.push({ id: a.id, label: a.label, family: a.family, unit: a.unit, a, b, delta, winner });
  }
  // The two numbers layouts are judged by lead the table; the rest keep the rule set's order.
  const lead = (id: string) => {
    const i = (HEADLINE_IDS as readonly string[]).indexOf(id);
    return i < 0 ? HEADLINE_IDS.length : i;
  };
  return rows
    .map((row, i) => ({ row, i }))
    .sort((x, y) => lead(x.row.id) - lead(y.row.id) || x.i - y.i)
    .map((x) => x.row);
}
