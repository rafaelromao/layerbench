import { humanBand, type RuleResult } from '@layerbench/core';
import { formatValue, shortLabel } from '../components/format.js';
import { SUMMARY_IDS } from '../components/Metrics.js';

/**
 * One number of the Summary the page shows under a board, as the image gives it: what it is called
 * there, its value written as there, and how its band rates it, in words and in one of four ways.
 */
export interface SummaryCell {
  id: string;
  /** The short caption of the page's Summary: `Effort`, `SFB`, `Alt`. */
  label: string;
  /** The value as the page writes it: `6.55`, `0.84%`. */
  value: string;
  /** The band's name, `very good`, or empty for a rule that has none. */
  band: string;
  quality: RuleResult['band']['quality'];
}

/**
 * The Summary of a report: the same metrics, in the same order, under the same captions and with the
 * same values as the page's own (`SummaryStrip`), so the image and the screen cannot disagree. A
 * metric the rule set does not have is left out there, and so here.
 */
export function summaryCells(
  results: readonly RuleResult[],
  ids: readonly string[] = SUMMARY_IDS,
): SummaryCell[] {
  const byId = new Map(results.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    if (!r) return [];
    return [
      {
        id,
        label: shortLabel(id, r.label),
        value: formatValue(r.value, r.unit),
        band: humanBand(r.band.label),
        quality: r.band.quality,
      },
    ];
  });
}
