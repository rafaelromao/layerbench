import type { CompiledLayout } from '../layout/compile.js';
import { compileLayout } from '../layout/compile.js';
import type { Layout } from '../layout/types.js';
import { evaluate } from '../rules/engine.js';
import { layoutsDoc } from '../rules/presets.js';
import type { Globals, RuleResult, RuleSet, Score } from '../rules/types.js';
import type { Coverage, SimulateOptions } from '../sim/resolver.js';
import { Simulator } from '../sim/resolver.js';
import type { SimulationTables } from '../tables/tables.js';

export interface AnalyzeOptions {
  caseMode?: 'fold' | 'model';
  crossWord?: 'reset' | 'bridge';
  maxSymbols?: number;
  ruleSet?: RuleSet;
  typingPaths?: SimulateOptions['typingPaths'];
  /**
   * Punctuation that counts as soft-dropped rather than unproducible when the layout cannot type
   * it. Defaults to the simulator's `?` and `!`; a language's own marks belong here too, or every
   * Spanish question fills the coverage panel with `¿` on a layout that simply has no key for it.
   */
  softSymbols?: string[];
}

/** Everything one run produces. Tables and the compiled layout stay in memory for relabeling. */
export interface Report {
  layout: Layout;
  compiled: CompiledLayout;
  simulation: SimulationTables;
  results: RuleResult[];
  score: Score;
  globals: Globals;
  /** The rules it was scored by, for a closer look at one key later. */
  ruleSet: RuleSet;
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
  const steps = analyzeSteps(layoutOrCompiled, stream, opts, Infinity);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/**
 * `analyze`, stopping after about every `every` symbols typed to say how many are done, so a
 * worker can answer other requests in between, or give the analysis up.
 */
export function* analyzeSteps(
  layoutOrCompiled: Layout | CompiledLayout,
  stream: string,
  opts: AnalyzeOptions = {},
  every = 20_000,
): Generator<number, Report> {
  const started = performance.now();
  const compiled =
    'layers' in layoutOrCompiled && 'positions' in layoutOrCompiled
      ? (layoutOrCompiled as CompiledLayout)
      : compileLayout(layoutOrCompiled as Layout);

  const ruleSet = opts.ruleSet ?? layoutsDoc();
  const caseMode = opts.caseMode ?? 'fold';
  const crossWord = opts.crossWord ?? ruleSet.globals.cross_word ?? 'reset';

  const sim = yield* new Simulator(compiled, {
    caseMode,
    crossWord,
    maxSymbols: opts.maxSymbols,
    typingPaths: opts.typingPaths,
    softSymbols: opts.softSymbols,
  }).steps(stream, every);
  const { results, score, globals } = evaluate(sim.tables, compiled, ruleSet);

  return {
    layout: compiled.layout,
    compiled,
    simulation: sim.tables,
    results,
    score,
    globals,
    ruleSet,
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
  return { ...report, results, score, globals, ruleSet };
}
