import { FINGERS } from '../geometry/types.js';
import type { CompiledLayout } from '../layout/compile.js';

/**
 * What the simulator weighs when a press could be made on several keys, or a character typed several
 * ways: same-finger pairs, then effort. The measures are fixed, never the rule set's, so what is
 * typed never depends on the rules it is scored by.
 */
export interface PressMeasure {
  /** Per position: a bit for each finger that presses it, a chord's every finger. */
  readonly fingers: readonly number[];
  /** Per position: a chord, keys pressed together. */
  readonly chord: readonly boolean[];
  /** Per position: the effort of a press, a chord's keys summed. */
  readonly effort: readonly number[];
}

export function pressMeasure(
  compiled: CompiledLayout,
  pressEffort: readonly number[],
): PressMeasure {
  return {
    fingers: compiled.positions.map((p) =>
      p.fingers.reduce((bits, f) => bits | (1 << FINGERS.indexOf(f)), 0),
    ),
    chord: compiled.positions.map((p) => p.members.length > 1),
    effort: pressEffort,
  };
}

/**
 * Two presses one finger makes on different keys: a same-finger bigram when one follows the other,
 * a skipgram with one press between. Counted as `sfbWhere()` counts them: a chord shares every
 * finger it uses, and only a pair of chords is left out.
 */
export function sameFingerPair(m: PressMeasure, a: number, b: number): boolean {
  return a !== b && (m.fingers[a] & m.fingers[b]) !== 0 && !(m.chord[a] && m.chord[b]);
}

export interface PressCost {
  /** Same-finger bigrams. */
  sfb: number;
  /** Same-finger skipgrams, one press apart. */
  sfs: number;
  effort: number;
}

/** Fewer same-finger bigrams first, then fewer skipgrams, then less effort. */
export function compareCost(a: PressCost, b: PressCost): number {
  return a.sfb - b.sfb || a.sfs - b.sfs || a.effort - b.effort;
}

/** What a run of presses costs, given the position of each. */
export function runCost(m: PressMeasure, keys: readonly number[]): PressCost {
  let sfb = 0;
  let sfs = 0;
  let effort = 0;
  for (let i = 0; i < keys.length; i++) {
    effort += m.effort[keys[i]] ?? 0;
    if (i >= 1 && sameFingerPair(m, keys[i - 1], keys[i])) sfb++;
    if (i >= 2 && sameFingerPair(m, keys[i - 2], keys[i])) sfs++;
  }
  return { sfb, sfs, effort };
}

/** A press of a run that any of several keys could make, the planner's own key first. */
export interface Choosable {
  /** Where the press is in the run. */
  at: number;
  keys: readonly number[];
}

/** Beyond this many combinations, the keys are chosen in one pass rather than every way. */
export const EXHAUSTIVE_LIMIT = 1024;

/**
 * The keys that make a run cost least, and that cost. `keys` holds the run with every choosable press
 * on its first key; it is changed during the search and left as it was. Combinations are tried in
 * order, the first press changing slowest, and only a cheaper one replaces the best: of equal costs
 * the earliest wins, so a run no other key improves keeps the keys it was planned with. Past
 * `EXHAUSTIVE_LIMIT` combinations each press in turn takes the key that costs least with the ones
 * before it chosen and the ones after it unchanged.
 */
export function chooseKeys(
  m: PressMeasure,
  keys: number[],
  choosable: readonly Choosable[],
): { cost: PressCost; pick: number[] } {
  const pick = choosable.map(() => 0);
  if (choosable.length === 0) return { cost: runCost(m, keys), pick };
  const put = (j: number, i: number) => {
    keys[choosable[j].at] = choosable[j].keys[i];
  };
  let combinations = 1;
  for (const c of choosable) {
    combinations *= c.keys.length;
    if (combinations > EXHAUSTIVE_LIMIT) break;
  }
  let best = runCost(m, keys);
  if (combinations <= EXHAUSTIVE_LIMIT) {
    const at = choosable.map(() => 0);
    for (;;) {
      let j = choosable.length - 1;
      while (j >= 0 && at[j] === choosable[j].keys.length - 1) {
        at[j] = 0;
        put(j, 0);
        j--;
      }
      if (j < 0) break;
      at[j]++;
      put(j, at[j]);
      const cost = runCost(m, keys);
      if (compareCost(cost, best) < 0) {
        best = cost;
        for (let k = 0; k < at.length; k++) pick[k] = at[k];
      }
    }
  } else {
    for (let j = 0; j < choosable.length; j++) {
      for (let i = 1; i < choosable[j].keys.length; i++) {
        put(j, i);
        const cost = runCost(m, keys);
        if (compareCost(cost, best) < 0) {
          best = cost;
          pick[j] = i;
        }
      }
      put(j, pick[j]);
    }
    for (let j = 0; j < choosable.length; j++) put(j, 0);
  }
  return { cost: best, pick };
}
