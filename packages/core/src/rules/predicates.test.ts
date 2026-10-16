import { describe, expect, it } from 'vitest';
import type { Finger } from '../geometry/types.js';
import { FINGER_RANK } from '../geometry/types.js';
import type { Attrs } from './attrs.js';
import { compilePredicate, matchPredicate, type PredicateContext } from './predicates.js';
import { DEFAULT_GLOBALS, type Predicate } from './types.js';

const ctx: PredicateContext = { globals: DEFAULT_GLOBALS, params: undefined };

let nextId = 0;
function key(finger: Finger | null, over: Partial<Attrs> = {}): Attrs {
  return {
    id: nextId++,
    pos: nextId,
    layer: 0,
    key_kind: 'alpha',
    label: 'a',
    reaches: null,
    hand: finger ? (finger[0] === 'L' ? 'L' : 'R') : 'both',
    fingers: finger ? [finger] : ['LI', 'RI'],
    finger,
    rank: finger ? FINGER_RANK[finger] : 3,
    x: 0,
    y: 0,
    row: 1,
    col: 1,
    thumb: false,
    home: false,
    inner: false,
    members: [nextId],
    ...over,
  };
}

const holds = (pred: Predicate, ...ng: Attrs[]) => matchPredicate(pred, ng, ctx);

describe('single-key predicates', () => {
  const a = key('LM', { x: 2, y: 0, row: 1, col: 3, home: true, layer: 1, key_kind: 'shift' });
  const b = key('LI', { x: 3, y: 1, row: 2, col: 4, inner: true, thumb: true });

  it('match on hand, finger and finger name, with sets', () => {
    expect(holds({ hand: 'L' }, a, b)).toBe(true);
    expect(holds({ hand: 'R' }, a, b)).toBe(false);
    expect(holds({ finger: ['LM', 'LI'] }, a, b)).toBe(true);
    expect(holds({ finger: { in: ['LM'] } }, a, b)).toBe(false);
    expect(holds({ includes_finger: 'LI' }, a, b)).toBe(true);
    expect(holds({ finger_name: ['middle', 'index'] }, a, b)).toBe(true);
    expect(holds({ finger_name: 'middle' }, a, b)).toBe(false);
    expect(holds({ includes_finger_name: 'index' }, a, b)).toBe(true);
    expect(holds({ includes_finger_name: 'pinky' }, a, b)).toBe(false);
  });

  it('never matches a finger name for a key pressed by several fingers', () => {
    const chord = key(null);
    expect(holds({ finger_name: 'index' }, chord)).toBe(false);
    expect(holds({ includes_finger_name: 'index' }, chord)).toBe(false);
  });

  it('match on position and flags', () => {
    expect(holds({ row: [1, 2] }, a, b)).toBe(true);
    expect(holds({ row: 1 }, a, b)).toBe(false);
    expect(holds({ col: { in: [3, 4] } }, a, b)).toBe(true);
    expect(holds({ is_thumb: true }, a, b)).toBe(false);
    expect(holds({ any_thumb: true }, a, b)).toBe(true);
    expect(holds({ is_home: true }, a)).toBe(true);
    expect(holds({ is_inner: true }, a, b)).toBe(false);
    expect(holds({ any_inner: true }, a, b)).toBe(true);
    expect(holds({ is_chord: false }, a, b)).toBe(true);
    expect(holds({ is_chord: true }, key('LI', { members: [1, 2] }))).toBe(true);
  });

  it('match on key kind and layer, for every or any key', () => {
    expect(holds({ key_kind: 'shift' }, a)).toBe(true);
    expect(holds({ key_kind: 'shift' }, a, b)).toBe(false);
    expect(holds({ any_key_kind: 'shift' }, a, b)).toBe(true);
    expect(holds({ layer: 1 }, a)).toBe(true);
    expect(holds({ layer: 1 }, a, b)).toBe(false);
    expect(holds({ any_layer: [1] }, a, b)).toBe(true);
  });

  it('can be limited to some positions of the n-gram', () => {
    expect(holds({ at: [1], layer: 0 }, a, b)).toBe(true);
    expect(holds({ at: [0], layer: 0 }, a, b)).toBe(false);
  });
});

describe('pairwise predicates', () => {
  const home = key('LM', { x: 0, y: 0, row: 1, col: 3 });
  const reach = key('LI', { x: 3, y: 4, row: 2, col: 4 });
  const other = key('RI', { x: 8, y: 0, row: 1, col: 7 });

  it('need at least two keys', () => {
    expect(holds({ same_hand: true }, home)).toBe(false);
  });

  it('compare hands, fingers and keys', () => {
    expect(holds({ same_hand: true }, home, reach)).toBe(true);
    expect(holds({ same_hand: false }, home, other)).toBe(true);
    expect(holds({ same_finger: true }, home, key('LM'))).toBe(true);
    expect(holds({ same_finger: false }, home, reach)).toBe(true);
    expect(holds({ same_key: true }, home, home)).toBe(true);
    expect(holds({ adjacent_fingers: true }, home, reach)).toBe(true);
    expect(holds({ adjacent_fingers: false }, home, key(null))).toBe(true);
  });

  it('measure rank, row and column steps against a number or a range', () => {
    expect(holds({ rank_delta: 1 }, home, reach)).toBe(true);
    expect(holds({ rank_delta: { eq: 1 } }, home, reach)).toBe(true);
    expect(holds({ rank_delta: { abs: 1 } }, home, reach)).toBe(true);
    expect(holds({ rank_delta: { abs_min: 1, abs_max: 2 } }, home, reach)).toBe(true);
    expect(holds({ rank_delta: { abs_min: 2 } }, home, reach)).toBe(false);
    expect(holds({ rank_delta: { abs_max: 0 } }, home, reach)).toBe(false);
    expect(holds({ row_delta: { min: -1, max: -1 } }, home, reach)).toBe(true);
    expect(holds({ row_delta: { gt: -2, lt: 0 } }, home, reach)).toBe(true);
    expect(holds({ col_delta: { lt: -2 } }, home, reach)).toBe(false);
  });

  it('measure distances on the same hand only', () => {
    expect(holds({ x_distance: 3 }, home, reach)).toBe(true);
    expect(holds({ y_distance: { gt: 3 } }, home, reach)).toBe(true);
    expect(holds({ distance: 5 }, home, reach)).toBe(true);
    expect(holds({ distance: { max: 4 } }, home, reach)).toBe(false);
    expect(holds({ x_distance: { min: 0 } }, home, other)).toBe(false);
    expect(holds({ distance: { min: 0 } }, home, other)).toBe(false);
  });

  it('read direction', () => {
    expect(holds({ direction: 'inward' }, home, reach)).toBe(true);
    expect(holds({ direction: 'outward' }, reach, home)).toBe(true);
    expect(holds({ direction: 'same' }, home, key('LM'))).toBe(true);
    expect(holds({ direction: 'none' }, home, other)).toBe(true);
  });

  it('match a pair of finger names whatever the order', () => {
    expect(holds({ finger_name_pair: ['index', 'middle'] }, home, reach)).toBe(true);
    expect(holds({ finger_name_pair: ['pinky', 'ring'] }, home, reach)).toBe(false);
    expect(holds({ finger_name_pair: ['index', 'middle'] }, home, key(null))).toBe(false);
    expect(holds({ finger_name_pair: ['index', 'index'] }, reach, other)).toBe(false);
  });

  it('flag a finger that prefers being higher sitting lower', () => {
    const middleLow = key('LM', { y: 2 });
    const indexHigh = key('LI', { y: 0 });
    expect(holds({ finger_height_preference: 'violated' }, middleLow, indexHigh)).toBe(true);
    expect(holds({ finger_height_preference: 'violated' }, indexHigh, middleLow)).toBe(true);
    expect(
      holds({ finger_height_preference: 'violated' }, key('LM', { y: 0 }), key('LI', { y: 2 })),
    ).toBe(false);
    // Same finger, another hand, or no single finger: never a violation.
    expect(holds({ finger_height_preference: 'violated' }, middleLow, key('LM'))).toBe(false);
    expect(holds({ finger_height_preference: 'violated' }, middleLow, other)).toBe(false);
    expect(holds({ finger_height_preference: 'violated' }, middleLow, key(null))).toBe(false);
  });

  it('takes the height preference from the rule when it has one', () => {
    const preferring: PredicateContext = {
      globals: DEFAULT_GLOBALS,
      params: { finger_height_preference: { index: 5 } },
    };
    const indexLow = key('LI', { y: 2 });
    const middleHigh = key('LM', { y: 0 });
    const violated = { finger_height_preference: 'violated' } as const;
    // By default the middle finger prefers being higher, so a lower index breaks nothing.
    expect(matchPredicate(violated, [indexLow, middleHigh], ctx)).toBe(false);
    // With the index preferred highest, a lower index than middle is the violation.
    expect(matchPredicate(violated, [indexLow, middleHigh], preferring)).toBe(true);
    // Two fingers of equal preference never violate.
    const equal: PredicateContext = {
      globals: DEFAULT_GLOBALS,
      params: { finger_height_preference: { middle: 0 } },
    };
    expect(matchPredicate(violated, [indexLow, middleHigh], equal)).toBe(false);
  });
});

describe('whole n-gram predicates', () => {
  const index = key('LI');
  const middle = key('LM');
  const ring = key('LR');
  const right = key('RI');

  it('match a hand pattern, by hand or by alternation', () => {
    expect(holds({ hand_pattern: 'LL' }, index, middle)).toBe(true);
    expect(holds({ hand_pattern: 'LR' }, index, right)).toBe(true);
    expect(holds({ hand_pattern: 'LR' }, index, middle)).toBe(false);
    expect(holds({ hand_pattern: 'aa' }, index, middle)).toBe(true);
    expect(holds({ hand_pattern: 'ab' }, index, right)).toBe(true);
    expect(holds({ hand_pattern: 'ab' }, index, middle)).toBe(false);
    expect(holds({ hand_pattern: 'ab' }, key(null), right)).toBe(false);
    expect(holds({ hand_pattern: 'ab' }, index, key(null))).toBe(false);
    expect(holds({ hand_pattern: 'aab' }, index, middle)).toBe(false);
    expect(holds({ hand_pattern: 'ax' }, index, middle)).toBe(false);
  });

  it('tell a roll in one direction from one that turns', () => {
    expect(holds({ monotone: true }, ring, middle, index)).toBe(true);
    expect(holds({ monotone: true }, ring, middle, key('LP'))).toBe(false);
    expect(holds({ monotone: true }, ring, middle)).toBe(false);
    expect(holds({ changes_direction: true }, ring, index, middle)).toBe(true);
    expect(holds({ changes_direction: true }, ring, middle, index)).toBe(false);
    expect(holds({ changes_direction: true }, ring, middle)).toBe(false);
    expect(holds({ changes_direction: true }, ring, key('LR'), middle)).toBe(false);
  });

  it('check that the fingers are all different', () => {
    expect(holds({ distinct_fingers: true }, ring, middle, index)).toBe(true);
    expect(holds({ distinct_fingers: true }, ring, key('LR'))).toBe(false);
  });
});

describe('combining predicates', () => {
  const a = key('LI', { layer: 0 });
  const b = key('RI', { layer: 1 });

  it('reads all, any and none, and an empty predicate as true', () => {
    expect(
      holds(
        {
          all: [
            { hand: 'L', at: [0] },
            { hand: 'R', at: [1] },
          ],
        },
        a,
        b,
      ),
    ).toBe(true);
    expect(holds({ any: [{ layer: 5 }, { any_layer: 1 }] }, a, b)).toBe(true);
    expect(holds({ none: [{ layer: 5 }] }, a, b)).toBe(true);
    expect(holds({ none: [{ any_layer: 1 }] }, a, b)).toBe(false);
    expect(compilePredicate(null, ctx)([a])).toBe(true);
    expect(compilePredicate(undefined, ctx)([a])).toBe(true);
  });

  it('resolves $global references, whole or inside an object', () => {
    const withGlobals: PredicateContext = {
      globals: { ...DEFAULT_GLOBALS, lsb_adjacent_u: 2 },
      params: undefined,
    };
    const near = key('LI', { x: 0 });
    const far = key('LM', { x: 2 });
    expect(
      matchPredicate(
        { x_distance: '$global.lsb_adjacent_u' as unknown as number },
        [near, far],
        withGlobals,
      ),
    ).toBe(true);
    expect(
      matchPredicate(
        { x_distance: { max: '$global.lsb_adjacent_u' as unknown as number } },
        [near, far],
        withGlobals,
      ),
    ).toBe(true);
  });

  it('refuses a predicate it does not know', () => {
    expect(() => holds({ nonsense: true } as unknown as Predicate, a)).toThrow(
      'unknown predicate nonsense',
    );
  });
});
