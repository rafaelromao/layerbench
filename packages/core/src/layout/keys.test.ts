import { describe, expect, it } from 'vitest';
import { BUNDLED_LAYOUTS } from '../layouts/index.js';
import { compileLayout } from './compile.js';
import { shiftWaysOffered, withDerivedKeys } from './keys.js';
import type { Binding, Layout } from './types.js';

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });
const SHIFT: Binding = { kind: 'sk', mod: 'LSHIFT' };

/** A 3x5+2 board, with `base` bound as given and the keys declared as given. */
function board(base: Record<string, Binding>, keys: Layout['keys'] = { space: 'L0' }): Layout {
  return {
    format: 'layerbench/layout@1',
    name: 'Keys',
    geometry: { preset: '3x5+2' },
    keys,
    layers: [{ id: 'base', name: 'Base', bindings: base }],
  };
}

describe('the space key', () => {
  it('stays while it still types a space, however many other keys do', () => {
    const layout = board({ L0: kp(' '), R0: kp(' ') });
    expect(withDerivedKeys(layout)).toBe(layout);
  });

  it('is the tap of a tap-hold, a layer tap or a morph, or a sentence space', () => {
    const hold: Binding = { kind: 'mo', layer: 'num' };
    for (const space of [
      { kind: 'hold_tap', tap: kp(' '), hold } as Binding,
      { kind: 'lt', layer: 'num', tap: kp(' ') } as Binding,
      { kind: 'mod_morph', mods: ['LSHIFT'], default: kp(' '), morphed: kp('_') } as Binding,
      { kind: 'sentence_space' } as Binding,
    ]) {
      const layout = board({ L0: space });
      expect(withDerivedKeys(layout)).toBe(layout);
    }
  });

  it('moves to a thumb that types a space, once its own key does not', () => {
    const layout = board({ LHM: kp(' '), R0: kp(' '), L0: kp('x') });
    expect(withDerivedKeys(layout).keys.space).toBe('R0');
  });

  it('moves to any key that types a space where no thumb does', () => {
    expect(withDerivedKeys(board({ LHM: kp(' '), L0: kp('x') })).keys.space).toBe('LHM');
  });

  it('stays as declared when no key types a space, as the analysis presses something', () => {
    const layout = board({ L0: kp('x') });
    expect(withDerivedKeys(layout)).toBe(layout);
  });

  it('stays on a key that chooses between bindings, as long as its plain part types a space', () => {
    for (const space of [
      { kind: 'adaptive', default: kp(' '), triggers: [] } as Binding,
      { kind: 'sentence_morph', default: kp(' '), pending: kp('x') } as Binding,
      { kind: 'layer_morph', layers: ['num'], active: kp('1'), inactive: kp(' ') } as Binding,
      { kind: 'tap_dance', bindings: [kp(' '), kp('x')] } as Binding,
    ]) {
      // Another key types a space too: an edit elsewhere must not move the space to it.
      const layout = board({ L0: space, R0: kp(' ') });
      expect(withDerivedKeys(layout)).toBe(layout);
    }
  });

  it("reads a layer's default binding for the keys it does not list", () => {
    const layout = board({ '*': kp(' ') }, { space: 'R0' });
    expect(withDerivedKeys(layout)).toBe(layout);
    // The key declared does not type a space once it lists a binding of its own.
    const moved = withDerivedKeys(board({ '*': kp(' '), R0: kp('x') }, { space: 'R0' }));
    expect(moved.keys.space).not.toBe('R0');
  });
});

describe('the shift key', () => {
  it('stays while it still shifts, with the kind it was given', () => {
    const layout = board(
      { R1: SHIFT, L1: SHIFT },
      { space: 'L0', shift: { key: 'L1', kind: 'hold' } },
    );
    expect(withDerivedKeys(layout)).toBe(layout);
  });

  it('is found when the layout declares none: a Shift tapped for the next key', () => {
    const layout = withDerivedKeys(board({ R1: SHIFT }));
    expect(layout.keys.shift).toEqual({ key: 'R1', kind: 'sk' });
    expect(layout.keys.space).toBe('L0');
  });

  it('is a morph whose plain part is a Shift, as caps word on shift is', () => {
    const morph: Binding = {
      kind: 'mod_morph',
      mods: ['LSHIFT', 'RSHIFT'],
      default: SHIFT,
      morphed: { kind: 'caps_word' },
    };
    expect(withDerivedKeys(board({ R1: morph })).keys.shift).toEqual({ key: 'R1', kind: 'sk' });
  });

  it('is a held Shift: a modifier key, or a thumb that holds Shift', () => {
    const mod: Binding = { kind: 'mod', mod: 'LSHIFT' };
    expect(withDerivedKeys(board({ LHM: mod })).keys.shift).toEqual({ key: 'LHM', kind: 'hold' });
    const holdTap: Binding = { kind: 'hold_tap', tap: kp('x'), hold: mod };
    expect(withDerivedKeys(board({ R1: holdTap })).keys.shift).toEqual({ key: 'R1', kind: 'hold' });
  });

  it('is not a home row mod, nor a Shift held with another modifier', () => {
    const homeRow: Binding = {
      kind: 'hold_tap',
      tap: kp('a'),
      hold: { kind: 'mod', mod: 'LSHIFT' },
    };
    const withGui: Binding = { kind: 'mod', mod: 'LSHIFT', also: ['LGUI'] };
    expect(withDerivedKeys(board({ LHM: homeRow, LHI: withGui })).keys.shift).toBeUndefined();
  });

  it('moves to the key that shifts, once its own does not, and a tapped one comes first', () => {
    const layout = board(
      { R1: kp('x'), LHM: { kind: 'mod', mod: 'RSHIFT' }, RHM: SHIFT },
      { space: 'L0', shift: { key: 'R1', kind: 'sk' } },
    );
    expect(withDerivedKeys(layout).keys.shift).toEqual({ key: 'RHM', kind: 'sk' });
  });

  it('is gone when no key shifts any more, so nothing pins its key', () => {
    const layout = board({ R1: kp('x') }, { space: 'L0', shift: { key: 'R1', kind: 'sk' } });
    expect(withDerivedKeys(layout).keys).toEqual({ space: 'L0' });
  });

  it('is found when the one declared is not on the board', () => {
    const layout = board({ R1: SHIFT }, { space: 'L0', shift: { key: 'NOPE', kind: 'hold' } });
    expect(withDerivedKeys(layout).keys.shift).toEqual({ key: 'R1', kind: 'sk' });
  });

  it('stays on a key that chooses between bindings, as long as its plain part shifts', () => {
    const hold: Binding = { kind: 'mo', layer: 'num' };
    for (const key of [
      { kind: 'adaptive', default: SHIFT, triggers: [] } as Binding,
      { kind: 'sentence_morph', default: SHIFT, pending: kp('x') } as Binding,
      { kind: 'tap_dance', bindings: [SHIFT, kp('x')] } as Binding,
      { kind: 'lt', layer: 'num', tap: SHIFT } as Binding,
      { kind: 'hold_tap', tap: SHIFT, hold } as Binding,
    ]) {
      const layout = board({ R1: key }, { space: 'L0', shift: { key: 'R1', kind: 'sk' } });
      expect(withDerivedKeys(layout)).toBe(layout);
    }
  });
});

describe('the keys of the bundled layouts', () => {
  it.each(BUNDLED_LAYOUTS.map((l) => [l.id, l] as const))(
    'are the keys derived from %s, so deriving them moves nothing',
    (_id, layout) => {
      expect(withDerivedKeys(layout).keys).toEqual(layout.keys);
      expect(() => compileLayout(withDerivedKeys(layout))).not.toThrow();
    },
  );
});

describe('the ways a layout gives Shift', () => {
  const HOLD: Binding = { kind: 'mod', mod: 'LSHIFT' };

  it('are a sticky Shift tapped, and a Shift held, wherever the layout has one', () => {
    expect(shiftWaysOffered(board({ LHM: kp('a') }))).toEqual([]);
    expect(shiftWaysOffered(board({ R1: SHIFT }))).toEqual(['sk']);
    expect(shiftWaysOffered(board({ R1: HOLD }))).toEqual(['hold']);
    // A key that taps one way and holds the other offers both, a home row mod's hold as a thumb's.
    const both: Binding = { kind: 'hold_tap', tap: SHIFT, hold: HOLD };
    expect(shiftWaysOffered(board({ R1: both }))).toEqual(['sk', 'hold']);
    expect(
      shiftWaysOffered(board({ LHM: { kind: 'hold_tap', tap: kp('a'), hold: HOLD } })),
    ).toEqual(['hold']);
  });

  it('include a sticky Shift a combo gives, which the analysis taps', () => {
    const layout = {
      ...board({ LHM: kp('a') }),
      combos: [{ keys: ['LHM', 'LHI'], binding: SHIFT }],
    };
    expect(shiftWaysOffered(layout)).toEqual(['sk']);
    // A combo that holds a Shift is let go in the same action, so it gives none.
    const held = { ...layout, combos: [{ keys: ['LHM', 'LHI'], binding: HOLD }] };
    expect(shiftWaysOffered(held)).toEqual([]);
  });

  it('are on any layer, and not a Shift held with another modifier', () => {
    const layout = board({ LHM: kp('a') });
    layout.layers.push({ id: 'num', bindings: { R1: SHIFT } });
    expect(shiftWaysOffered(layout)).toEqual(['sk']);
    expect(
      shiftWaysOffered(board({ R1: { kind: 'mod', mod: 'LSHIFT', also: ['LCTRL'] } })),
    ).toEqual([]);
  });
});
