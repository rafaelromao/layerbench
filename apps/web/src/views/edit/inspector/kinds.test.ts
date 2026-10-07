import { type Binding, bundledLayout, compileLayout } from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import { ARM_KINDS, convert, kindOf, TAP_KINDS } from './kinds.js';

const compiled = compileLayout(bundledLayout('magic-romak') as never);
const to = (b: Binding | undefined, kind: Parameters<typeof convert>[2]) =>
  convert(compiled, b, kind, []);

const magic: Binding = {
  kind: 'adaptive',
  default: { kind: 'kp', symbol: 'h' },
  triggers: [{ afterAny: ['a'], binding: { kind: 'kp', symbol: 'v' } }],
};

describe('changing what a key is', () => {
  it('offers a magic key and an alt repeat for the tap of a tap-hold, and not for any arm', () => {
    expect(TAP_KINDS).toEqual([...ARM_KINDS, 'magic', 'altrepeat']);
    expect(ARM_KINDS).not.toContain('magic');
  });

  it('keeps a magic key as the tap when the key becomes a tap-hold', () => {
    const held = to(magic, 'taphold');
    expect(held).toEqual({ kind: 'lt', layer: 'alpha2', tap: magic });
    expect(kindOf(held)).toBe('taphold');
    expect(to({ kind: 'key_repeat' }, 'taphold')).toEqual({
      kind: 'lt',
      layer: 'alpha2',
      tap: { kind: 'key_repeat' },
    });
  });

  it("takes a tap-hold's magic tap out, branches and all, when the key becomes a magic key", () => {
    const held: Binding = { kind: 'hold_tap', tap: magic, hold: { kind: 'mod', mod: 'LGUI' } };
    expect(to(held, 'magic')).toEqual(magic);
    expect(to(held, 'altrepeat')).toEqual({ ...magic, default: { kind: 'key_repeat' } });
    expect(to(held, 'symbol')).toEqual({ kind: 'kp', symbol: 'h' });
  });

  it('turns an alt repeat with tagged branches into a magic key and back, keeping them', () => {
    const alt: Binding = {
      kind: 'adaptive',
      default: { kind: 'key_repeat' },
      triggers: [{ afterAny: ['e'], afterTags: ['alpha2'], binding: { kind: 'kp', symbol: 'x' } }],
    };
    expect(kindOf(alt)).toBe('altrepeat');
    const back = to(to(alt, 'magic'), 'altrepeat');
    expect(back).toEqual(alt);
  });
});
