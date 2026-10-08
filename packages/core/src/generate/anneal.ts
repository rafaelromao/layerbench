import { cloneDesign, type Design, FastScorer, rng, type Score, scoreExact } from './model.js';
import type { Sample } from './tables.js';

/**
 * Simulated annealing over a design's slots, scored by `FastScorer`. The objective is the sum of
 * what the run is asked to keep low: a weight on Effort, one on one-shot taps, and steep penalties
 * past the SFB and Effort caps, so a design under both caps is what the search settles on and the
 * weights decide which of them.
 */

export interface Targets {
  /** Upper bound on SFB, percent. */
  sfbCap: number;
  /** Upper bound on Effort. */
  effortCap: number;
  /** Weight on Effort inside the caps. */
  effortWeight: number;
  /** Weight on one-shot taps per 100 symbols. */
  tapsWeight: number;
}

export interface AnnealOptions extends Targets {
  iterations: number;
  seed: number;
  /** Start and end temperatures of the geometric schedule. */
  t0?: number;
  t1?: number;
}

/** Penalty per percentage point of SFB, and per Effort point, past a cap. */
const SFB_PENALTY = 3000;
const EFFORT_PENALTY = 300;

export function objective(t: Targets, effort: number, sfb: number, taps: number): number {
  return (
    t.effortWeight * effort +
    SFB_PENALTY * Math.max(0, sfb - t.sfbCap) +
    EFFORT_PENALTY * Math.max(0, effort - t.effortCap) +
    t.tapsWeight * taps
  );
}

export function feasible(t: Targets, effort: number, sfb: number): boolean {
  return effort <= t.effortCap && sfb <= t.sfbCap;
}

export interface AnnealResult {
  /** The best design under both caps by the weighted objective, or the best objective overall. */
  design: Design;
  score: Score;
  feasible: boolean;
  accepted: number;
}

export function anneal(sample: Sample, start: Design, opts: AnnealOptions): AnnealResult {
  const rand = rng(opts.seed);
  const design = cloneDesign(start);
  const scorer = new FastScorer(sample, design);
  const n = design.slots.length;
  const t0 = opts.t0 ?? 40;
  const t1 = opts.t1 ?? 0.02;
  let cur = objective(opts, scorer.effort, scorer.sfb, scorer.taps);
  let best: { design: Design; obj: number; feasible: boolean } | null = null;
  let accepted = 0;

  const consider = (): void => {
    const e = scorer.effort;
    const f = scorer.sfb;
    const ok = feasible(opts, e, f);
    const obj = objective(opts, e, f, scorer.taps);
    if (best === null || (ok && !best.feasible) || (ok === best.feasible && obj < best.obj)) {
      best = { design: cloneDesign(design), obj, feasible: ok };
    }
  };
  consider();

  for (let it = 0; it < opts.iterations; it++) {
    const temp = t0 * (t1 / t0) ** (it / opts.iterations);
    const i = Math.floor(rand() * n);
    const j = Math.floor(rand() * n);
    if (i === j || (design.occupant[i] < 0 && design.occupant[j] < 0)) continue;
    scorer.swap(i, j);
    const next = objective(opts, scorer.effort, scorer.sfb, scorer.taps);
    if (next <= cur || rand() < Math.exp((cur - next) / temp)) {
      cur = next;
      accepted++;
      consider();
    } else {
      scorer.swap(i, j);
    }
  }

  const found = best as { design: Design; obj: number; feasible: boolean } | null;
  if (!found) throw new Error('annealing never scored a design');
  return {
    design: found.design,
    score: scoreExact(sample, found.design),
    feasible: found.feasible,
    accepted,
  };
}

/**
 * Greedy improvement by single swaps until none helps, judged by the exact pass, so the result is
 * a local optimum of what the engine will measure.
 */
export function polish(
  sample: Sample,
  start: Design,
  t: Targets,
): { design: Design; score: Score } {
  const design = cloneDesign(start);
  const n = design.slots.length;
  let score = scoreExact(sample, design);
  let cur = objective(t, score.effort, score.sfb, score.taps);
  for (;;) {
    let improved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = design.occupant[i];
        const b = design.occupant[j];
        if (a < 0 && b < 0) continue;
        design.occupant[i] = b;
        design.occupant[j] = a;
        if (a >= 0) design.slotOf[a] = j;
        if (b >= 0) design.slotOf[b] = i;
        const next = scoreExact(sample, design);
        const obj = objective(t, next.effort, next.sfb, next.taps);
        if (obj < cur - 1e-9) {
          cur = obj;
          score = next;
          improved = true;
        } else {
          design.occupant[i] = a;
          design.occupant[j] = b;
          if (a >= 0) design.slotOf[a] = i;
          if (b >= 0) design.slotOf[b] = j;
        }
      }
    }
    if (!improved) return { design, score };
  }
}
