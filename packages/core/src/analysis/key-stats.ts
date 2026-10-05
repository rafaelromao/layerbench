import { evaluateFocus, type FocusResult } from '../rules/engine.js';
import type { Report } from './analyze.js';

/**
 * What one key, pressed on one layer, takes part in, by the rules the report was scored with: each
 * rule's n-grams with the key in them, and for a layer key what it was pressed for. Its part of
 * each number needs no more than the report's own `per_layer_key` and `key_scale`.
 */
export function keyStats(
  report: Report,
  key: number,
  layer: number,
  opts: { limit?: number } = {},
): FocusResult {
  return evaluateFocus(report.simulation, report.compiled, report.ruleSet, { key, layer }, opts);
}
