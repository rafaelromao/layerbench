import { describe, expect, it } from 'vitest';
import { copyKey, keyBinding, sendKeyToLayer, setKeyBinding, swapKeys } from './ops.js';
import type { Layout } from './types.js';

const layout: Layout = {
  format: 'layoutmaster/layout@1',
  name: 'Test',
  geometry: { preset: '3x5+2' },
  keys: { space: 'L0' },
  layers: [
    {
      id: 'base',
      bindings: { LHM: { kind: 'kp', symbol: 'a' }, LHI: { kind: 'kp', symbol: 'b' } },
    },
    { id: 'upper', bindings: { '*': { kind: 'trans' }, LHM: { kind: 'kp', symbol: '1' } } },
  ],
};

describe('layout ops', () => {
  it('reads the authored binding, not the one the layer falls through to', () => {
    expect(keyBinding(layout, 0, 'LHM')).toEqual({ kind: 'kp', symbol: 'a' });
    expect(keyBinding(layout, 1, 'LHI')).toBeUndefined();
    expect(keyBinding(layout, 9, 'LHM')).toBeUndefined();
  });

  it('removes the entry rather than writing a transparent one, so the key stays implicit', () => {
    const cleared = setKeyBinding(layout, 0, 'LHM', undefined);
    expect('LHM' in cleared.layers[0].bindings).toBe(false);
    expect(cleared.layers[0].bindings.LHI).toEqual({ kind: 'kp', symbol: 'b' });
    // The original is untouched.
    expect(layout.layers[0].bindings.LHM).toEqual({ kind: 'kp', symbol: 'a' });
  });

  it('sets a binding without disturbing the other layers', () => {
    const next = setKeyBinding(layout, 1, 'LHI', { kind: 'kp', symbol: '2' });
    expect(next.layers[1].bindings.LHI).toEqual({ kind: 'kp', symbol: '2' });
    expect(next.layers[0]).toBe(layout.layers[0]);
  });

  it('swaps an explicit key with an implicit one by moving, not duplicating', () => {
    const next = swapKeys(layout, 1, 'LHM', 'LHI');
    expect(next.layers[1].bindings.LHI).toEqual({ kind: 'kp', symbol: '1' });
    expect('LHM' in next.layers[1].bindings).toBe(false);
  });

  it('copies onto a key, overwriting what was there and leaving the source alone', () => {
    const next = copyKey(layout, 0, 'LHM', 'LHI');
    expect(next.layers[0].bindings.LHI).toEqual({ kind: 'kp', symbol: 'a' });
    expect(next.layers[0].bindings.LHM).toEqual({ kind: 'kp', symbol: 'a' });
    expect(copyKey(layout, 0, 'LHM', 'LHM')).toBe(layout);
  });

  it('copying an implicit key makes the target implicit too', () => {
    const next = copyKey(layout, 1, 'LHI', 'LHM');
    expect('LHM' in next.layers[1].bindings).toBe(false);
  });

  it('sends a key to another layer, clearing the source only when moving', () => {
    const moved = sendKeyToLayer(layout, 0, 1, 'LHI', 'move');
    expect(moved.layers[1].bindings.LHI).toEqual({ kind: 'kp', symbol: 'b' });
    expect('LHI' in moved.layers[0].bindings).toBe(false);

    const copied = sendKeyToLayer(layout, 0, 1, 'LHI', 'copy');
    expect(copied.layers[1].bindings.LHI).toEqual({ kind: 'kp', symbol: 'b' });
    expect(copied.layers[0].bindings.LHI).toEqual({ kind: 'kp', symbol: 'b' });

    expect(sendKeyToLayer(layout, 0, 0, 'LHI', 'move')).toBe(layout);
    expect(sendKeyToLayer(layout, 0, 9, 'LHI', 'move')).toBe(layout);
  });
});
