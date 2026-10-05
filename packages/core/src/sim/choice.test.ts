import { describe, expect, it } from 'vitest';
import {
  type Choosable,
  chooseKeys,
  compareCost,
  EXHAUSTIVE_LIMIT,
  type PressMeasure,
  runCost,
  sameFingerPair,
} from './choice.js';

/**
 * Positions 0–3 are four fingers, one key each; 4 is a second key of finger 0's; 5 a chord of
 * fingers 0 and 1, 6 a chord of fingers 1 and 2. Effort is the position's own number, so it is easy
 * to read off a cost.
 */
const m: PressMeasure = {
  fingers: [0b0001, 0b0010, 0b0100, 0b1000, 0b0001, 0b0011, 0b0110],
  chord: [false, false, false, false, false, true, true],
  effort: [0, 1, 2, 3, 4, 5, 6],
};

describe('what a run of presses costs', () => {
  it('counts one finger on two different keys, in a row or one press apart', () => {
    expect(runCost(m, [0, 4])).toEqual({ sfb: 1, sfs: 0, effort: 4 });
    expect(runCost(m, [0, 1, 4])).toEqual({ sfb: 0, sfs: 1, effort: 5 });
  });

  it('does not count the same key twice as a pair', () => {
    expect(runCost(m, [0, 0])).toEqual({ sfb: 0, sfs: 0, effort: 0 });
  });

  it('counts a chord and a key that share a finger, but not two chords', () => {
    expect(sameFingerPair(m, 5, 1)).toBe(true);
    expect(sameFingerPair(m, 5, 6)).toBe(false);
    expect(sameFingerPair(m, 5, 3)).toBe(false);
  });

  it('puts same-finger bigrams before skipgrams, and both before effort', () => {
    expect(compareCost({ sfb: 0, sfs: 3, effort: 9 }, { sfb: 1, sfs: 0, effort: 0 })).toBeLessThan(
      0,
    );
    expect(compareCost({ sfb: 0, sfs: 0, effort: 9 }, { sfb: 0, sfs: 1, effort: 0 })).toBeLessThan(
      0,
    );
    expect(compareCost({ sfb: 0, sfs: 0, effort: 1 }, { sfb: 0, sfs: 0, effort: 2 })).toBeLessThan(
      0,
    );
  });
});

describe('choosing the keys of a run', () => {
  it('takes the key that makes no same-finger pair', () => {
    // 0, then a press either finger 0 makes again on another key (4) or finger 2 makes (2).
    const keys = [0, 4];
    const { pick, cost } = chooseKeys(m, keys, [{ at: 1, keys: [4, 2] }]);
    expect(pick).toEqual([1]);
    expect(cost).toEqual({ sfb: 0, sfs: 0, effort: 2 });
    expect(keys).toEqual([0, 4]);
  });

  it('keeps the planned key when nothing is gained', () => {
    const { pick } = chooseKeys(m, [1, 2], [{ at: 1, keys: [2, 3] }]);
    // 2 and 3 both avoid finger 1; 2 costs less, and it is the planned one anyway.
    expect(pick).toEqual([0]);
    // A real tie keeps the first key too.
    const tie: PressMeasure = { ...m, effort: [0, 0, 0, 0, 0, 0, 0] };
    expect(chooseKeys(tie, [1, 2], [{ at: 1, keys: [2, 3] }]).pick).toEqual([0]);
  });

  it('weighs what comes after a press as well as what comes before it', () => {
    // 1, a choosable press, then 0: key 4 is clear of 1 but pairs with the 0 after it.
    const { pick } = chooseKeys(m, [1, 4, 0], [{ at: 1, keys: [4, 2] }]);
    expect(pick).toEqual([1]);
  });

  it('chooses two presses together, and the earliest keys on a tie', () => {
    // After 0, the first must not be finger 0's other key, and the second must pair neither with
    // the first nor, one press back, with 0. Pressing the same key twice is no pair.
    const choosable: Choosable[] = [
      { at: 1, keys: [4, 1, 2] },
      { at: 2, keys: [4, 1, 2] },
    ];
    expect(chooseKeys(m, [0, 4, 4], choosable)).toEqual({
      cost: { sfb: 0, sfs: 0, effort: 2 },
      pick: [1, 1],
    });
    // Without effort, (1, 1), (1, 2), (2, 1) and (2, 2) all make no pair: the first of them wins.
    const free: PressMeasure = { ...m, effort: m.effort.map(() => 0) };
    expect(chooseKeys(free, [0, 4, 4], choosable).pick).toEqual([1, 1]);
  });

  it('chooses in one pass past the limit, never worse than as planned', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ at: i + 1, keys: [4, 1] }));
    const keys = [0, ...many.map(() => 4)];
    expect(2 ** many.length).toBeGreaterThan(EXHAUSTIVE_LIMIT);
    const planned = runCost(m, keys);
    const { pick, cost } = chooseKeys(m, keys, many);
    expect(compareCost(cost, planned)).toBeLessThan(0);
    expect(cost.sfb).toBe(0);
    expect(pick[0]).toBe(1);
    expect(keys).toEqual([0, ...many.map(() => 4)]);
    // The same run chooses the same keys every time.
    expect(chooseKeys(m, keys, many).pick).toEqual(pick);
  });
});
