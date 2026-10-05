import { keyPart, type RuleResult } from '@layoutmaster/core';
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
    total: dto.usageAll.reduce((a, b) => a + b, 0),
    chordPresses,
    layerTaps: dto.layerTapsByLayer[layer]?.[key] ?? 0,
    rows,
  };
}
