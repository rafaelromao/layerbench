import type { Report } from '@layoutmaster/core';
import type { CoverageDTO, ReportDTO, StatsDTO } from './protocol.js';

/** Sorted descending by count, so the coverage strip can show the worst offenders first. */
function entries(map: Map<string, number>): [string, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function coverageOf(report: Report): CoverageDTO {
  return {
    unproducible: entries(report.coverage.unproducible),
    softDropped: entries(report.coverage.softDropped),
    excludedByCase: report.coverage.excludedByCase ?? [],
  };
}

/**
 * Usage per position for each layer. Layer, shift and space keys count on every layer, because they
 * are what the user presses to reach the layer they are looking at.
 */
function usageMaps(report: Report): {
  usageByLayer: number[][];
  usageAll: number[];
  layerTaps: number[];
} {
  const positions = report.compiled.positions.length;
  const layerCount = report.compiled.layers.length;
  const usageByLayer = Array.from({ length: layerCount }, () =>
    new Array<number>(positions).fill(0),
  );
  const usageAll = new Array<number>(positions).fill(0);
  const layerTaps = new Array<number>(positions).fill(0);

  const unigram = report.simulation.noSpace.unigram;
  for (const lk of report.simulation.registry.all()) {
    const count = unigram.get(lk.id) ?? 0;
    if (count === 0) continue;
    usageAll[lk.pos] += count;
    if (lk.keyKind === 'layer_tap') layerTaps[lk.pos] += count;
    const alwaysVisible =
      lk.keyKind === 'layer_tap' || lk.keyKind === 'shift' || lk.keyKind === 'space';
    for (let l = 0; l < layerCount; l++) {
      if (alwaysVisible || lk.layer === l) usageByLayer[l][lk.pos] += count;
    }
  }
  return { usageByLayer, usageAll, layerTaps };
}

/** Strip a report down to what the interface needs. Tables stay behind. */
export function toReportDTO(report: Report, key: string): ReportDTO {
  const { usageByLayer, usageAll, layerTaps } = usageMaps(report);
  const st = report.stats;
  const stats: StatsDTO = {
    symbols: st.symbols,
    words: st.words,
    keystrokes: st.keystrokes,
    space_presses: st.space_presses,
    layer_taps: st.layer_taps,
    one_shot_activations: st.one_shot_activations,
    wasted_one_shots: st.wasted_one_shots,
    hold_presses: st.hold_presses,
    chords: st.chords,
    macro_presses: st.macro_presses,
    adaptive_presses: st.adaptive_presses,
    adaptive_trigger_hits: st.adaptive_trigger_hits,
    repeat_presses: st.repeat_presses,
    per_layer: [...st.per_layer],
  };

  return {
    key,
    provisional: report.provisional,
    elapsedMs: report.elapsedMs,
    results: report.results,
    score: report.score,
    globals: report.globals as unknown as Record<string, unknown>,
    coverage: coverageOf(report),
    stats,
    usageByLayer,
    usageAll,
    layerTaps,
    members: report.compiled.positions.map((p) => p.members),
  };
}
