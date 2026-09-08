import { readFileSync } from 'node:fs';
import { normalizeText } from '../corpus/normalize.js';
import { FIXTURE_EN, FIXTURE_MIXED, FIXTURE_PT } from '../fixtures/index.js';
import type { CompiledLayout } from '../layout/compile.js';
import { compileLayout } from '../layout/compile.js';
import { parseLayout } from '../layout/schema.js';
import type { Layout } from '../layout/types.js';
import { evaluate } from '../rules/engine.js';
import { getPreset } from '../rules/presets.js';
import type { RuleResult, RuleSet, Score } from '../rules/types.js';
import type { Coverage } from '../sim/resolver.js';
import { explain, simulate } from '../sim/resolver.js';
import type { SimulationStats } from '../tables/tables.js';
import { goldenPath } from './paths.js';

/**
 * One cell of the golden matrix. The report file name is derived from it, and every parameter the
 * engine needs is here — so the dump script and the parity suite read the same source of truth and
 * cannot drift apart.
 */
export interface GoldenCase {
  layout: string;
  corpus: GoldenCorpus;
  preset: string;
  caseMode: 'fold' | 'model';
  universe: 'no_space' | 'with_space';
}

export type GoldenCorpus = 'fixture_en' | 'fixture_pt' | 'fixture_enpt';

/** Layouts covered by the matrix. Resolved from `golden/layouts/`, not from the bundled registry. */
export const GOLDEN_LAYOUTS = ['magic-romak', 'romak-34', 'qwerty'] as const;

const GOLDEN_CORPORA: GoldenCorpus[] = ['fixture_en', 'fixture_pt', 'fixture_enpt'];
const GOLDEN_PRESETS = ['layouts_doc', 'cyanophage'] as const;
const GOLDEN_UNIVERSES: GoldenCase['universe'][] = ['no_space', 'with_space'];

/** Words whose full typing trace is pinned, chosen to exercise accents, macros and shift. */
export const EXPLAIN_WORDS = [
  'ação',
  'açúcar',
  'chave',
  'hello',
  'quando',
  'não',
  'é',
  'll',
  'qu',
  'ões',
  'the',
  'work',
  'vocês',
  'ótimo',
  'shift',
];

/**
 * Every case the goldens cover: the full fold-mode grid, plus two model-mode runs that are the only
 * coverage of shift modelling.
 */
export function goldenMatrix(): GoldenCase[] {
  const cases: GoldenCase[] = [];
  for (const layout of GOLDEN_LAYOUTS)
    for (const corpus of GOLDEN_CORPORA)
      for (const preset of GOLDEN_PRESETS)
        for (const universe of GOLDEN_UNIVERSES)
          cases.push({ layout, corpus, preset, caseMode: 'fold', universe });
  for (const corpus of ['fixture_en', 'fixture_pt'] as GoldenCorpus[])
    cases.push({
      layout: 'magic-romak',
      corpus,
      preset: 'layouts_doc',
      caseMode: 'model',
      universe: 'no_space',
    });
  return cases;
}

export function goldenName(c: GoldenCase): string {
  return `${c.layout}__${c.corpus}__${c.preset}__${c.caseMode}__${c.universe}.json`;
}

export function corpusText(name: string): string {
  if (name === 'fixture_en') return FIXTURE_EN;
  if (name === 'fixture_pt') return FIXTURE_PT;
  return FIXTURE_MIXED;
}

/**
 * The layout document a report was produced from. Reports resolve layouts through `golden/layouts/`
 * rather than the bundled registry, so a layout can leave the shipped catalogue and still stay
 * regression-tested.
 */
export function goldenLayout(id: string): Layout {
  return parseLayout(JSON.parse(readFileSync(goldenPath(`layouts/${id}.json`), 'utf8')));
}

export interface GoldenCoverage {
  excluded_by_case: string[];
  soft_dropped: Record<string, number>;
  unproducible: Record<string, number>;
}

export interface GoldenReport {
  meta: {
    layout: string;
    corpus: string;
    preset: string;
    case_mode: 'fold' | 'model';
    universe: 'no_space' | 'with_space';
    cross_word: string;
    stream_length: number;
  };
  globals: Record<string, unknown>;
  stats: Record<string, number | Record<string, number>>;
  coverage: GoldenCoverage;
  totals: Record<string, { unigram: number; bigram: number; trigram: number; skip: number[] }>;
  registry: { id: number; layer: number; pos: number; key_kind: string; label: string }[];
  unigram_no_space: Record<string, number>;
  unigram_with_space: Record<string, number>;
  travel: {
    continuous: Record<string, number>;
    reset_at_word: Record<string, number>;
    usage: Record<string, number>;
  };
  runs: {
    finger_runs: Record<string, number>;
    hand_runs: Record<string, number>;
    hand_strings: Record<string, number>;
    layer_runs: Record<string, number>;
  };
  words_count: number;
  results: RuleResult[];
  score: Score;
  producers: Record<string, string[]>;
  explain: Record<
    string,
    {
      presses: number;
      coverage: GoldenCoverage;
      steps: {
        key: string;
        layer: string;
        finger: string;
        kind: string;
        key_kind: string;
        label: string;
        symbols: string;
        wasted_one_shot: boolean;
      }[];
    }
  >;
}

function coverageOf(c: Coverage): GoldenCoverage {
  return {
    excluded_by_case: [...c.excludedByCase],
    soft_dropped: mapToObject(c.softDropped),
    unproducible: mapToObject(c.unproducible),
  };
}

function mapToObject(m: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...m.entries()]);
}

/** A histogram held as a sparse array; holes and index 0 simply do not appear. */
function histogram(a: number[]): Record<string, number> {
  return Object.fromEntries(Object.entries(a).filter(([k]) => k !== '0'));
}

/** A dense per-index count, such as presses per layer, keeps its zeros. */
function dense(a: number[]): Record<string, number> {
  return Object.fromEntries(a.map((v, i) => [String(i), v]));
}

function ngramTotals(t: {
  totals: { unigram: number; bigram: number; trigram: number; skip: [number, number, number] };
}) {
  return {
    unigram: t.totals.unigram,
    bigram: t.totals.bigram,
    trigram: t.totals.trigram,
    skip: [...t.totals.skip],
  };
}

/**
 * Simulation statistics as the report files hold them: `per_layer` becomes an index map, and
 * `unproducible` is dropped because the same counts are already reported under `coverage`.
 */
function statsOf(s: SimulationStats): Record<string, number | Record<string, number>> {
  const { per_layer, unproducible: _unproducible, ...rest } = s;
  return { ...rest, per_layer: dense(per_layer) };
}

/** The rule set a case evaluates with: a preset, with the case's universe pinned. */
export function goldenRuleSet(c: GoldenCase): RuleSet {
  const base = getPreset(c.preset);
  return { ...base, globals: { ...base.globals, universe: c.universe, top_items: 50 } };
}

/** Run one case and shape the result exactly as the report files hold it. */
export function buildGoldenReport(c: GoldenCase, layout?: Layout): GoldenReport {
  const compiled: CompiledLayout = compileLayout(layout ?? goldenLayout(c.layout));
  const ruleSet = goldenRuleSet(c);
  const crossWord = ruleSet.globals.cross_word ?? 'reset';
  const stream = normalizeText(corpusText(c.corpus), { caseMode: c.caseMode });
  const sim = simulate(compiled, stream, { caseMode: c.caseMode, crossWord });
  const { results, score, globals } = evaluate(sim.tables, compiled, ruleSet);
  const t = sim.tables;

  return {
    meta: {
      layout: c.layout,
      corpus: c.corpus,
      preset: c.preset,
      case_mode: c.caseMode,
      universe: c.universe,
      cross_word: crossWord,
      stream_length: [...stream].length,
    },
    globals: globals as unknown as Record<string, unknown>,
    stats: statsOf(t.stats),
    coverage: coverageOf(sim.coverage),
    totals: { no_space: ngramTotals(t.noSpace), with_space: ngramTotals(t.withSpace) },
    registry: t.registry
      .all()
      .map((k) => ({ id: k.id, layer: k.layer, pos: k.pos, key_kind: k.keyKind, label: k.label })),
    unigram_no_space: Object.fromEntries([...t.noSpace.unigram].map(([k, v]) => [String(k), v])),
    unigram_with_space: Object.fromEntries(
      [...t.withSpace.unigram].map(([k, v]) => [String(k), v]),
    ),
    travel: {
      continuous: { ...t.travel.continuous },
      reset_at_word: { ...t.travel.resetAtWord },
      usage: { ...t.travel.usage },
    },
    runs: {
      finger_runs: histogram(t.runs.fingerRuns),
      hand_runs: histogram(t.runs.handRuns),
      hand_strings: mapToObject(t.runs.handStrings),
      layer_runs: histogram(t.runs.layerRuns),
    },
    words_count: t.words.size,
    results,
    score,
    producers: Object.fromEntries(
      [...sim.producers.bySymbol].map(([s, ps]) => [s, ps.map((p) => p.id)]),
    ),
    explain: Object.fromEntries(
      EXPLAIN_WORDS.map((w) => {
        const e = explain(compiled, w, { caseMode: c.caseMode, crossWord: 'reset' });
        return [
          w,
          {
            presses: e.presses,
            coverage: coverageOf(e.coverage),
            steps: e.steps.map((s) => ({
              key: s.key,
              layer: s.layer,
              finger: s.finger,
              kind: s.kind,
              key_kind: s.keyKind,
              label: s.label,
              symbols: s.symbols,
              wasted_one_shot: s.wastedOneShot,
            })),
          },
        ];
      }),
    ),
  };
}
