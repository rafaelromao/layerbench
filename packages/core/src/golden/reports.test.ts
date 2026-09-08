import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { goldenPath } from './paths.js';
import type { GoldenReport } from './report.js';
import { buildGoldenReport, goldenMatrix, goldenName } from './report.js';

function close(a: number, b: number, eps = 1e-6): boolean {
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= eps * scale;
}

const cases = goldenMatrix();

/**
 * Every number the engine computes is pinned by these reports, so a regression in the simulator,
 * the tables or any rule shows up immediately. The matrix drives the suite and `pnpm goldens`
 * writes it, so the two cannot drift; layouts are resolved from `golden/layouts/`, which is why a
 * layout can leave the shipped catalogue and stay covered here.
 */
describe('golden reports', () => {
  it('the files on disk are exactly the matrix', () => {
    const onDisk = readdirSync(goldenPath('.'))
      .filter((f) => f.endsWith('.json'))
      .sort();
    expect(onDisk).toEqual(cases.map(goldenName).sort());
  });

  for (const c of cases) {
    const file = goldenName(c);

    describe(file.replace('.json', ''), () => {
      const want: GoldenReport = JSON.parse(readFileSync(goldenPath(file), 'utf8'));
      const got = buildGoldenReport(c);

      it('metadata', () => {
        expect(got.meta.cross_word).toBe(want.meta.cross_word);
        expect(got.meta.stream_length).toBe(want.meta.stream_length);
      });

      it('simulation statistics', () => {
        for (const [k, v] of Object.entries(want.stats)) {
          if (typeof v === 'number') expect(got.stats[k], k).toBe(v);
        }
        expect(got.words_count).toBe(want.words_count);
      });

      it('n-gram totals', () => {
        expect(got.totals).toEqual(want.totals);
      });

      it('rule values', () => {
        expect(got.results.map((r) => r.id)).toEqual(want.results.map((r) => r.id));
        const byId = new Map(got.results.map((r) => [r.id, r]));
        for (const w of want.results) {
          const r = byId.get(w.id);
          expect(r, w.id).toBeDefined();
          if (!r) continue;
          expect(r.unit, `${w.id} unit`).toBe(w.unit);
          if (w.value === null) expect(r.value, `${w.id} value`).toBeNull();
          else
            expect(close(r.value as number, w.value), `${w.id}: ${r.value} vs ${w.value}`).toBe(
              true,
            );
          expect(r.band, `${w.id} band`).toEqual(w.band);
        }
      });

      // Item lists carry the worst offenders the UI shows, including their order — which is what
      // decides the top-50 cutoff when counts tie.
      it('rule items and attribution', () => {
        const byId = new Map(got.results.map((r) => [r.id, r]));
        for (const w of want.results) {
          const r = byId.get(w.id);
          if (!r) continue;
          expect(r.items, `${w.id} items`).toEqual(w.items);
          expect(r.per_finger, `${w.id} per_finger`).toEqual(w.per_finger);
          expect(r.per_hand, `${w.id} per_hand`).toEqual(w.per_hand);
          expect(r.breakdown, `${w.id} breakdown`).toEqual(w.breakdown);
        }
      });

      it('coverage, registry and runs', () => {
        expect(got.coverage).toEqual(want.coverage);
        expect(got.registry).toEqual(want.registry);
        expect(got.runs).toEqual(want.runs);
      });

      it('producer enumeration and ordering', () => {
        expect(Object.keys(got.producers).sort()).toEqual(Object.keys(want.producers).sort());
        for (const [sym, ids] of Object.entries(want.producers)) {
          expect(got.producers[sym], `producers for ${JSON.stringify(sym)}`).toEqual(ids);
        }
      });

      it('explain traces', () => {
        expect(got.explain).toEqual(want.explain);
      });

      it('composite score', () => {
        expect(got.score.enabled).toBe(want.score.enabled);
        if (want.score.value === null) expect(got.score.value).toBeNull();
        else
          expect(
            close(got.score.value as number, want.score.value),
            `${got.score.value} vs ${want.score.value}`,
          ).toBe(true);
      });
    });
  }
});
