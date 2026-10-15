import { describe, expect, it } from 'vitest';
import { heldPart, partOf } from './parts.js';
import type { Binding } from './types.js';

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });
const a = kp('a');
const b = kp('b');

describe('the Plain part', () => {
  it('is past every binding that chooses one: a tap, a plain binding, a first tap, a default', () => {
    const plain: Binding[] = [
      { kind: 'hold_tap', tap: a, hold: { kind: 'mod', mod: 'LCTRL' } },
      { kind: 'lt', layer: 'num', tap: a },
      { kind: 'mod_morph', mods: ['LSHIFT', 'RSHIFT'], default: a, morphed: b },
      { kind: 'layer_morph', layers: ['num'], inactive: a, active: b },
      { kind: 'tap_dance', bindings: [a, b] },
      { kind: 'adaptive', default: a, triggers: [{ afterAny: ['x'], binding: b }] },
    ];
    for (const key of plain) expect(partOf(key)).toBe(a);
  });

  it('goes past choosers inside choosers', () => {
    const key: Binding = {
      kind: 'hold_tap',
      tap: {
        kind: 'layer_morph',
        layers: ['num'],
        inactive: { kind: 'adaptive', default: a },
        active: b,
      },
      hold: b,
    };
    expect(partOf(key)).toBe(a);
  });

  it('is the chooser itself when it has nothing to choose', () => {
    const adaptive: Binding = { kind: 'adaptive', triggers: [{ afterAny: ['x'], binding: b }] };
    const dance: Binding = { kind: 'tap_dance', bindings: [] };
    expect(partOf(adaptive)).toBe(adaptive);
    expect(partOf(dance)).toBe(dance);
    expect(partOf({ kind: 'mod_morph', mods: ['LSHIFT'], default: dance, morphed: b })).toBe(dance);
  });

  it('stops at the choosers a caller has to see', () => {
    const adaptive: Binding = { kind: 'adaptive', default: a };
    const key: Binding = { kind: 'mod_morph', mods: ['LSHIFT'], default: adaptive, morphed: b };
    expect(partOf(key, { stopAt: new Set(['adaptive']) })).toBe(adaptive);
    expect(partOf(key, { stopAt: new Set(['mod_morph']) })).toBe(key);
  });
});

describe('the part a press chooses', () => {
  it("is a tap-hold's hold, and a layer-tap held holds its layer", () => {
    const hold: Binding = { kind: 'mod', mod: 'LCTRL' };
    expect(partOf({ kind: 'hold_tap', tap: a, hold }, { press: 'hold' })).toBe(hold);
    expect(partOf({ kind: 'lt', layer: 'num', tap: a }, { press: 'hold' })).toEqual({
      kind: 'mo',
      layer: 'num',
    });
  });

  it("is a mod morph's changed binding when any one of its modifiers is held", () => {
    const key: Binding = { kind: 'mod_morph', mods: ['LSHIFT', 'RSHIFT'], default: a, morphed: b };
    expect(partOf(key, { mods: new Set(['RSHIFT']) })).toBe(b);
    expect(partOf(key, { mods: new Set(['LCTRL']) })).toBe(a);
  });

  it("is a layer morph's changed binding when any, or all, of its layers are on", () => {
    const any: Binding = { kind: 'layer_morph', layers: ['x', 'y'], inactive: a, active: b };
    const all: Binding = { ...any, match: 'all' } as Binding;
    const xOn = { layerOn: (l: string) => l === 'x' };
    expect(partOf(any, xOn)).toBe(b);
    expect(partOf(all, xOn)).toBe(a);
    expect(partOf(all, { layerOn: () => true })).toBe(b);
  });
});

describe('the part a hold reaches', () => {
  it("is a tap-hold's hold or a layer-tap's layer, found past the morphs before it", () => {
    const hold: Binding = { kind: 'mod', mod: 'LCTRL' };
    expect(heldPart({ kind: 'hold_tap', tap: a, hold })).toBe(hold);
    expect(heldPart({ kind: 'lt', layer: 'num', tap: a })).toEqual({ kind: 'mo', layer: 'num' });
    expect(
      heldPart({
        kind: 'layer_morph',
        layers: ['num'],
        inactive: { kind: 'hold_tap', tap: a, hold },
        active: b,
      }),
    ).toBe(hold);
  });

  it('is nothing for a key that does the same held as tapped', () => {
    expect(heldPart(a)).toBeNull();
    expect(heldPart({ kind: 'mod_morph', mods: ['LSHIFT'], default: a, morphed: b })).toBeNull();
  });
});
