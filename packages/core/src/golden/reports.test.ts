import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeText } from '../corpus/normalize.js';
import { FIXTURE_EN, FIXTURE_PT } from '../fixtures/index.js';
import { compileLayout } from '../layout/compile.js';
import { bundledLayout } from '../layouts/index.js';
import { classifyBand } from '../rules/bands.js';
import { evaluate } from '../rules/engine.js';
import { getPreset } from '../rules/presets.js';
import type { RuleSet } from '../rules/types.js';
import { explain, simulate } from '../sim/resolver.js';
import { goldenPath } from './paths.js';

interface Golden {
  meta: {
    layout: string;
    corpus: string;
    preset: string;
    case_mode: 'fold' | 'model';
    universe: 'no_space' | 'with_space';
    cross_word: 'reset' | 'bridge';
  };
  stats: Record<string, number | Record<string, number>>;
  totals: Record<string, { unigram: number; bigram: number; trigram: number; skip: number[] }>;
  results: {
    id: string;
    value: number | null;
    unit: string;
    band: { index: number | null; label: string | null };
    items: { label: string; count: number; percent: number }[];
    per_finger: Record<string, number>;
    per_hand: Record<string, number>;
    breakdown: Record<string, number>;
  }[];
  score: { enabled: boolean; value: number | null };
  words_count: number;
  producers: Record<string, string[]>;
  explain: Record<
    string,
    {
      presses: number;
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

function corpusText(name: string): string {
  if (name === 'fixture_en') return FIXTURE_EN;
  if (name === 'fixture_pt') return FIXTURE_PT;
  return `${FIXTURE_EN} ${FIXTURE_PT}`;
}

/**
 * Rules whose reference values are known-wrong and deliberately not reproduced. See DEVIATIONS.md:
 * the reference never resolves a `$global.` reference nested inside a numeric condition, so its
 * lateral-stretch rules match nothing.
 */
const DEVIATIONS = new Set(['lsb', 'lss']);

function close(a: number, b: number, eps = 1e-6): boolean {
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= eps * scale;
}

const files = readdirSync(goldenPath('.')).filter((f) => f.endsWith('.json'));

/**
 * Reports produced by the reference implementation. Every number the engine computes is pinned
 * here, so a regression in the simulator, the tables or any rule shows up immediately.
 */
describe('reference reports', () => {
  for (const file of files) {
    const g: Golden = JSON.parse(readFileSync(goldenPath(file), 'utf8'));
    const { meta } = g;

    describe(file.replace('.json', ''), () => {
      const layout = bundledLayout(meta.layout)!;
      const compiled = compileLayout(layout);
      const stream = normalizeText(corpusText(meta.corpus), { caseMode: meta.case_mode });
      const sim = simulate(compiled, stream, {
        caseMode: meta.case_mode,
        crossWord: meta.cross_word,
      });
      const base = getPreset(meta.preset);
      const ruleSet: RuleSet = {
        ...base,
        globals: { ...base.globals, universe: meta.universe, top_items: 50 },
      };
      const { results, score } = evaluate(sim.tables, compiled, ruleSet);
      const byId = new Map(results.map((r) => [r.id, r]));

      it('simulation statistics', () => {
        const st = sim.tables.stats as unknown as Record<string, number>;
        for (const [k, v] of Object.entries(g.stats)) {
          if (typeof v === 'number') expect(st[k], k).toBe(v);
        }
        expect(sim.tables.words.size).toBe(g.words_count);
      });

      it('n-gram totals', () => {
        for (const [universe, t] of Object.entries(g.totals)) {
          const got = universe === 'no_space' ? sim.tables.noSpace : sim.tables.withSpace;
          expect(got.totals.unigram, `${universe} unigram`).toBe(t.unigram);
          expect(got.totals.bigram, `${universe} bigram`).toBe(t.bigram);
          expect(got.totals.trigram, `${universe} trigram`).toBe(t.trigram);
          expect(got.totals.skip, `${universe} skip`).toEqual(t.skip);
        }
      });

      it('rule values', () => {
        expect(results.length).toBe(g.results.length);
        for (const want of g.results) {
          if (DEVIATIONS.has(want.id)) continue;
          const got = byId.get(want.id);
          expect(got, want.id).toBeDefined();
          if (!got) continue;
          expect(got.unit, `${want.id} unit`).toBe(want.unit);
          if (want.value === null) {
            expect(got.value, `${want.id} value`).toBeNull();
          } else {
            expect(
              close(got.value as number, want.value),
              `${want.id}: ${got.value} vs ${want.value}`,
            ).toBe(true);
          }
          expect(got.band.index, `${want.id} band`).toBe(want.band.index);
          expect(got.band.label, `${want.id} band label`).toBe(want.band.label);
        }
      });

      it('producer enumeration and ordering', () => {
        const got = sim.producers.bySymbol;
        expect([...got.keys()].sort()).toEqual(Object.keys(g.producers).sort());
        for (const [sym, ids] of Object.entries(g.producers)) {
          expect(
            (got.get(sym) ?? []).map((p) => p.id),
            `producers for ${JSON.stringify(sym)}`,
          ).toEqual(ids);
        }
      });

      it('explain traces', () => {
        for (const [word, want] of Object.entries(g.explain)) {
          const e = explain(compiled, word, {
            caseMode: meta.case_mode,
            crossWord: 'reset',
          });
          expect(e.presses, `${word} presses`).toBe(want.presses);
          expect(
            e.steps.map((s) => [
              s.key,
              s.layer,
              s.finger,
              s.kind,
              s.keyKind,
              s.label,
              s.symbols,
              s.wastedOneShot,
            ]),
            `${word} steps`,
          ).toEqual(
            want.steps.map((s) => [
              s.key,
              s.layer,
              s.finger,
              s.kind,
              s.key_kind,
              s.label,
              s.symbols,
              s.wasted_one_shot,
            ]),
          );
        }
      });

      it('composite score', () => {
        expect(score.enabled).toBe(g.score.enabled);
        // The score aggregates every weighted rule, including the deviating ones, so recompute it
        // with the reference's own values substituted for those.
        const wantById = new Map(g.results.map((r) => [r.id, r]));
        const bandsById = new Map(ruleSet.rules.map((r) => [r.id, r.bands]));
        let totalW = 0;
        let sum = 0;
        for (const r of results) {
          if (r.score_weight <= 0) continue;
          const w = wantById.get(r.id);
          const value = DEVIATIONS.has(r.id) ? (w?.value ?? null) : r.value;
          if (typeof value !== 'number') continue;
          const band = DEVIATIONS.has(r.id) ? classifyBand(value, bandsById.get(r.id)) : r.band;
          if (band.index === null) continue;
          totalW += r.score_weight;
          sum += r.score_weight * (band.goodness ?? 0.5);
        }
        const rebuilt = totalW > 0 ? (sum / totalW) * 100 : null;
        if (g.score.value === null) expect(rebuilt).toBeNull();
        else
          expect(close(rebuilt as number, g.score.value), `${rebuilt} vs ${g.score.value}`).toBe(
            true,
          );
      });
    });
  }
});
