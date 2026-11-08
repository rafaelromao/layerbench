import type { RuleResult } from '@layerbench/core';
import type { HeatMode } from '../url/params.js';
import type { ReportDTO } from './protocol.js';

/** What each heat mode is called wherever it is chosen. */
export const HEAT_LABELS: Record<HeatMode, string> = {
  usage: 'Usage',
  sfb: 'SFB contribution',
  effort: 'Effort',
  travel: 'Finger travel',
  layer_taps: 'Layer taps',
};

/**
 * Heat modes backed by a rule, each key drawn by its part of the rule's number: Effort is a key's
 * cost times its presses, travel the distance its finger moved to press it.
 */
const HEAT_RULE_ID: Partial<Record<HeatMode, string>> = {
  sfb: 'sfb',
  effort: 'effort',
  travel: 'finger_travel',
};

/**
 * The part of a report a heat map is drawn from: the presses per position, and what each rule that
 * backs a mode credits to a key on a layer. A `ReportDTO` is one; `heatSourceOf` keeps nothing else.
 */
export interface HeatSource {
  usageByLayer: ReportDTO['usageByLayer'];
  usageAll: ReportDTO['usageAll'];
  layerTapsByLayer: ReportDTO['layerTapsByLayer'];
  results: Pick<RuleResult, 'id' | 'per_layer_key'>[];
}

/**
 * Just what `heatMap` reads of a report, so a list of layouts can keep it after the rest of each
 * report, the other rules' tables included, is let go.
 */
export function heatSourceOf(dto: ReportDTO): HeatSource {
  const ruleIds = new Set(Object.values(HEAT_RULE_ID));
  return {
    usageByLayer: dto.usageByLayer,
    usageAll: dto.usageAll,
    layerTapsByLayer: dto.layerTapsByLayer,
    results: dto.results
      .filter((r) => ruleIds.has(r.id))
      .map(({ id, per_layer_key }) => ({ id, per_layer_key })),
  };
}

/**
 * Scale to 0–1 against the busiest key of `values`, or against `top` where the keys scaled are
 * only some of those it is read beside: `heatMap` scales a layer against the busiest key of all.
 */
export function normalizeHeat(
  values: Record<number, number>,
  top = Math.max(0, ...Object.values(values)),
): Record<number, number> {
  if (!(top > 0)) return {};
  const out: Record<number, number> = {};
  for (const [pos, v] of Object.entries(values)) {
    if (v > 0) out[Number(pos)] = v / top;
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

/** The rule behind a mode, if the source has it: a rule switched off in the rule set is missing. */
function ruleFor(source: HeatSource, mode: HeatMode): HeatSource['results'][number] | undefined {
  const ruleId = HEAT_RULE_ID[mode];
  return ruleId ? source.results.find((r) => r.id === ruleId) : undefined;
}

/**
 * The mode a map is really drawn in: the one asked for, or usage where it asks for a rule the rule
 * set does not have, as `heatMap` falls back to.
 */
export function effectiveHeat(source: HeatSource, mode: HeatMode): HeatMode {
  if (mode === 'usage' || mode === 'layer_taps') return mode;
  return ruleFor(source, mode) ? mode : 'usage';
}

/** What a mode counts on each key of each layer, before it is scaled: a row per layer. */
function heatCounts(source: HeatSource, mode: HeatMode): Record<number, Record<number, number>> {
  if (mode === 'layer_taps') return source.layerTapsByLayer.map(fromArray);
  const rule = mode === 'usage' ? undefined : ruleFor(source, mode);
  // A rule that credits nothing on a layer leaves it cold; only a rule switched off in the rule
  // set falls back to usage.
  if (rule) return rule.per_layer_key;
  return source.usageByLayer.length > 0
    ? source.usageByLayer.map(fromArray)
    : [fromArray(source.usageAll)];
}

/**
 * Per-position heat for the selected mode on one layer, 0–1. Only what was pressed on that layer
 * counts, so each key drawn there shows its own presses and no other layer's. The scale is shared:
 * 1 is the busiest key of all layers, so an equal share of presses is an equal colour on every
 * layer, and a layer of cold keys stays cold beside a hot one.
 */
export function heatMap(source: HeatSource, mode: HeatMode, layer: number): Record<number, number> {
  const counts = heatCounts(source, mode);
  const top = Math.max(0, ...Object.values(counts).flatMap((row) => Object.values(row)));
  // A layer beyond the end clamps rather than blanking the board.
  const l = Math.max(0, Math.min(layer, source.usageByLayer.length - 1));
  return normalizeHeat(counts[l] ?? {}, top);
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
