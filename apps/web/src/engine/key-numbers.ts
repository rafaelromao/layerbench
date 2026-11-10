import { keyPart, type RuleResult } from '@layerbench/core';
import type { ReportDTO } from './protocol.js';

/** One rule's number, and the part of it one key makes on one layer. */
export interface KeyNumberRow {
  result: RuleResult;
  /** The key's part, in the number's own unit. */
  part: number;
  /** The part as a share of the number, 0–1; null when the number is zero. */
  share: number | null;
}

/** What one key, pressed on one layer, adds to the analysis. */
export interface KeyNumbers {
  /** Presses of the key alone on the layer, and all presses counted. */
  presses: number;
  total: number;
  /** Presses of combos the key is part of, on the layer. */
  chordPresses: number;
  /** Presses on the key made to bring a layer on. */
  layerTaps: number;
  /** Every number that is a sum over keys, in the report's order. */
  rows: KeyNumberRow[];
}

/** Every press counted, on every layer: what a key's share of the presses is a share of. */
function totalPresses(dto: Pick<ReportDTO, 'usageAll'>): number {
  return dto.usageAll.reduce((a, b) => a + b, 0);
}

/**
 * Each position's share of all the presses of the text on one layer, 0–1: its presses there over
 * every press counted on every layer, the share a key's numbers open with. A press counts on the
 * layer whose key was pressed, so a thumb tapped for a layer is counted where it is tapped, and the
 * shares of every position of every layer, combos included, add up to 1. Positions with no
 * presses are left out. `undefined` for a layer the report does not have, as one just added: a
 * share there would be another layer's.
 */
export function pressShares(
  dto: Pick<ReportDTO, 'usageByLayer' | 'usageAll'>,
  layer: number,
): Record<number, number> | undefined {
  const onLayer = dto.usageByLayer[layer];
  if (!onLayer) return undefined;
  const total = totalPresses(dto);
  const out: Record<number, number> = {};
  if (!(total > 0)) return out;
  onLayer.forEach((presses, pos) => {
    if (presses > 0) out[pos] = presses / total;
  });
  return out;
}

/**
 * Read off the report on the main thread, so the numbers follow whatever report is shown, an
 * estimate after a swap included.
 */
export function keyNumbers(dto: ReportDTO, key: number, layer: number): KeyNumbers {
  const onLayer = dto.usageByLayer[layer] ?? [];
  let chordPresses = 0;
  dto.members.forEach((members, pos) => {
    if (members.length > 1 && members.includes(key)) chordPresses += onLayer[pos] ?? 0;
  });
  const rows: KeyNumberRow[] = [];
  for (const result of dto.results) {
    if (typeof result.value !== 'number') continue;
    const part = keyPart(result, key, layer);
    if (part === null) continue;
    rows.push({ result, part, share: result.value !== 0 ? part / result.value : null });
  }
  return {
    presses: onLayer[key] ?? 0,
    total: totalPresses(dto),
    chordPresses,
    layerTaps: dto.layerTapsByLayer[layer]?.[key] ?? 0,
    rows,
  };
}
