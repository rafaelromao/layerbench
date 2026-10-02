import type { HeatMode } from '../url/params.js';
import type { ReportDTO } from './protocol.js';

/**
 * Heat modes backed by a rule. The reference looked `travel` up by its own name and silently fell
 * back to usage, because the catalog calls that rule `finger_travel`; this map is the fix.
 */
const HEAT_RULE_ID: Partial<Record<HeatMode, string>> = {
  sfb: 'sfb',
  effort: 'effort',
  travel: 'finger_travel',
};

/** Scale to 0–1 against the busiest key, so colour is comparable within one map only. */
export function normalizeHeat(values: Record<number, number>): Record<number, number> {
  const max = Math.max(0, ...Object.values(values));
  if (!(max > 0)) return {};
  const out: Record<number, number> = {};
  for (const [pos, v] of Object.entries(values)) {
    if (v > 0) out[Number(pos)] = v / max;
  }
  return out;
}

function fromArray(counts: number[]): Record<number, number> {
  const out: Record<number, number> = {};
  counts.forEach((v, pos) => {
    if (v > 0) out[pos] = v;
  });
  return out;
}

/**
 * Per-position heat for the selected mode on one layer, normalized to 0–1. Only what was pressed on
 * that layer counts, so each key drawn there shows its own presses and no other layer's.
 */
export function heatMap(dto: ReportDTO, mode: HeatMode, layer: number): Record<number, number> {
  // A layer beyond the end clamps rather than blanking the board.
  const l = Math.max(0, Math.min(layer, dto.usageByLayer.length - 1));
  if (mode === 'layer_taps') return normalizeHeat(fromArray(dto.layerTapsByLayer[l] ?? []));
  if (mode !== 'usage') {
    const ruleId = HEAT_RULE_ID[mode];
    const rule = ruleId ? dto.results.find((r) => r.id === ruleId) : undefined;
    if (rule && Object.keys(rule.per_key).length > 0) {
      return normalizeHeat((rule.per_layer_key[l] ?? {}) as Record<number, number>);
    }
  }
  return normalizeHeat(fromArray(dto.usageByLayer[l] ?? dto.usageAll));
}

/** Usage across every layer, for previews that show no particular layer. */
export function usageHeat(dto: ReportDTO): Record<number, number> {
  return normalizeHeat(fromArray(dto.usageAll));
}

/** Expand positions to the physical keys behind them, so chords highlight all their members. */
export function expandPositions(dto: ReportDTO, positions: number[]): number[] {
  const out: number[] = [];
  for (const p of positions) {
    const members = dto.members[p];
    if (members && members.length > 0) out.push(...members);
    else out.push(p);
  }
  return [...new Set(out)];
}
