import type { CompiledLayout } from '../layout/compile.js';
import { compileLayout } from '../layout/compile.js';
import type { Layout } from '../layout/types.js';
import { evaluate } from '../rules/engine.js';
import { layoutsDoc } from '../rules/presets.js';
import type { Globals, RuleResult, RuleSet, Score } from '../rules/types.js';
import type { Coverage, SimulateOptions } from '../sim/resolver.js';
import { simulate } from '../sim/resolver.js';
import type { SimulationTables } from '../tables/tables.js';

export interface AnalyzeOptions {
  caseMode?: 'fold' | 'model';
  crossWord?: 'reset' | 'bridge';
  maxSymbols?: number;
  ruleSet?: RuleSet;
  typingPaths?: SimulateOptions['typingPaths'];
}

/** Everything one run produces. Tables and the compiled layout stay in memory for relabeling. */
export interface Report {
  layout: Layout;
  compiled: CompiledLayout;
  simulation: SimulationTables;
  results: RuleResult[];
  score: Score;
  globals: Globals;
  coverage: Coverage;
  stats: SimulationTables['stats'];
  options: Required<Pick<AnalyzeOptions, 'caseMode' | 'crossWord'>> & { maxSymbols?: number };
  elapsedMs: number;
  /** True for a report estimated from an earlier run rather than simulated fresh. */
  provisional: boolean;
}

/** Type a corpus on a layout and score the result. */
export function analyze(
  layoutOrCompiled: Layout | CompiledLayout,
  stream: string,
  opts: AnalyzeOptions = {},
): Report {
  const started = performance.now();
  const compiled =
    'layers' in layoutOrCompiled && 'positions' in layoutOrCompiled
      ? (layoutOrCompiled as CompiledLayout)
      : compileLayout(layoutOrCompiled as Layout);

  const ruleSet = opts.ruleSet ?? layoutsDoc();
  const caseMode = opts.caseMode ?? 'fold';
  const crossWord = opts.crossWord ?? ruleSet.globals.cross_word ?? 'reset';

  const sim = simulate(compiled, stream, {
    caseMode,
    crossWord,
    maxSymbols: opts.maxSymbols,
    typingPaths: opts.typingPaths,
  });
  const { results, score, globals } = evaluate(sim.tables, compiled, ruleSet);

  return {
    layout: compiled.layout,
    compiled,
    simulation: sim.tables,
    results,
    score,
    globals,
    coverage: sim.coverage,
    stats: sim.tables.stats,
    options: { caseMode, crossWord, maxSymbols: opts.maxSymbols },
    elapsedMs: performance.now() - started,
    provisional: false,
  };
}

/** Re-score an existing run, e.g. after editing the rule set. No re-simulation. */
export function reevaluate(report: Report, ruleSet: RuleSet): Report {
  const { results, score, globals } = evaluate(report.simulation, report.compiled, ruleSet);
  return { ...report, results, score, globals };
}
