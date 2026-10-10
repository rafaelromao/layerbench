import { analyze } from '../analysis/analyze.js';
import { stableStringify } from '../analysis/hash.js';
import { analysisRun, typedLayout } from '../analysis/settings.js';
import { compileLayout } from '../layout/compile.js';
import type { Layout } from '../layout/types.js';
import { BUNDLED_LAYOUTS } from '../layouts/index.js';
import type { RuleItem } from '../rules/types.js';
import type { Sample } from './tables.js';

/**
 * The engine's own numbers for a layout, on the settings the Library ranks on (`librarySettings`):
 * the same text, the same cut of it, the same rules, typed and scored by `analyze` as the app does.
 */

export interface EngineScore {
  effort: number;
  sfb: number;
  sfs: number;
  /** One-shot, toggle and switch layer taps per 100 symbols. */
  tapsPer100: number;
  extraKeystrokes: number;
  /** Share of the text's characters the layout could not type, percent. */
  skipped: number;
  missing: string[];
  symbols: number;
  words: number;
  /** The same-finger pairs, most frequent first, as the `sfb` rule lists them. */
  sfbItems: RuleItem[];
}

export function scoreLayout(layout: Layout, sample: Sample): EngineScore {
  const { options } = analysisRun(sample.settings, sample.text);
  const typed = typedLayout(compileLayout(layout), sample.settings.without);
  const report = analyze(typed, sample.stream, options);
  const value = (id: string): number => {
    const v = report.results.find((r) => r.id === id)?.value;
    return typeof v === 'number' ? v : Number.NaN;
  };
  const unproducible = [...report.coverage.unproducible.entries()].sort((a, b) => b[1] - a[1]);
  const left = unproducible.reduce((sum, [, count]) => sum + count, 0);
  const whole = report.stats.symbols + left;
  return {
    effort: value('effort'),
    sfb: value('sfb'),
    sfs: value('sfs'),
    tapsPer100: value('layer_taps_per_100'),
    extraKeystrokes: value('extra_keystrokes'),
    skipped: whole > 0 ? (left / whole) * 100 : 0,
    missing: unproducible.map(([symbol]) => symbol),
    symbols: report.stats.symbols,
    words: report.stats.words,
    sfbItems: report.results.find((r) => r.id === 'sfb')?.items ?? [],
  };
}

const bundledCache = new Map<string, Map<string, EngineScore>>();

/** Every bundled layout on the same request, so a result can be placed among them. */
export function bundledScores(sample: Sample): Map<string, EngineScore> {
  const key = stableStringify(sample.settings);
  let scores = bundledCache.get(key);
  if (!scores) {
    scores = new Map();
    for (const layout of BUNDLED_LAYOUTS) {
      scores.set(layout.id ?? layout.name, scoreLayout(layout, sample));
    }
    bundledCache.set(key, scores);
  }
  return scores;
}

/** Place among the bundled layouts, lowest first, as "1st of 35". */
export function placeAmong(mine: number, others: Iterable<number>): string {
  let below = 0;
  let n = 0;
  for (const o of others) {
    n++;
    if (o < mine) below++;
  }
  const rank = below + 1;
  const v = rank % 100;
  const suffix = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[rank % 10] ?? 'th');
  return `${rank}${suffix} of ${n + 1}`;
}
