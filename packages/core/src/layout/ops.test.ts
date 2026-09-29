import { describe, expect, it } from 'vitest';
import {
  copyKey,
  duplicateLayer,
  keyBinding,
  layerReachedFrom,
  moveLayer,
  removeFeaturesAt,
  removeLayer,
  sendKeyToLayer,
  setKeyBinding,
  swapKeys,
} from './ops.js';
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

describe('layout ops on placed features', () => {
  const magic: Layout = {
    ...layout,
    features: {
      adaptiveKeys: [
        {
          id: 'magic',
          default: { kind: 'kp', symbol: 'h' },
          triggers: [],
          at: [{ layer: 'base', key: 'LHM' }],
        },
      ],
      altRepeat: { triggers: [], at: [{ layer: 'upper', key: 'LHI' }] },
      sentenceCase: {},
    },
  };
  const placed = (l: Layout) => ({
    magic: l.features?.adaptiveKeys?.[0].at,
    altRepeat: l.features?.altRepeat?.at,
  });

  it('carries a magic key along when its key is swapped', () => {
    const next = swapKeys(magic, 0, 'LHM', 'LHI');
    expect(placed(next).magic).toEqual([{ layer: 'base', key: 'LHI' }]);
    // A feature on another layer, and one that follows a role, are left where they were.
    expect(placed(next).altRepeat).toBe(magic.features?.altRepeat?.at);
    expect(next.features?.sentenceCase).toBe(magic.features?.sentenceCase);
  });

  it('places a copied magic key on the target too, and replaces what the target had', () => {
    const next = copyKey(magic, 0, 'LHM', 'LHI');
    expect(placed(next).magic).toEqual([
      { layer: 'base', key: 'LHM' },
      { layer: 'base', key: 'LHI' },
    ]);
    const over = copyKey(magic, 0, 'LHI', 'LHM');
    expect(placed(over).magic).toEqual([]);
  });

  it('moves the alt-repeat key to the layer its key is sent to', () => {
    const moved = sendKeyToLayer(magic, 1, 0, 'LHI', 'move');
    expect(placed(moved).altRepeat).toEqual([{ layer: 'base', key: 'LHI' }]);
    const copied = sendKeyToLayer(magic, 1, 0, 'LHI', 'copy');
    expect(placed(copied).altRepeat).toEqual([
      { layer: 'upper', key: 'LHI' },
      { layer: 'base', key: 'LHI' },
    ]);
  });

  it('takes a feature off a key, and returns the same document when there was none', () => {
    expect(placed(removeFeaturesAt(magic, 0, 'LHM')).magic).toEqual([]);
    expect(removeFeaturesAt(magic, 0, 'LTP')).toBe(magic);
    expect(swapKeys(layout, 0, 'LHM', 'LHI').features).toBeUndefined();
  });
});

describe('layer order', () => {
  const three: Layout = {
    ...layout,
    layers: [...layout.layers, { id: 'third', name: 'Third', bindings: {} }],
  };
  const ids = (l: Layout) => l.layers.map((x) => x.id);

  it('moves a layer, and keeps the base layer first', () => {
    expect(ids(moveLayer(three, 2, 1))).toEqual(['base', 'third', 'upper']);
    expect(moveLayer(three, 1, 0)).toBe(three);
    expect(moveLayer(three, 0, 2)).toBe(three);
    expect(moveLayer(three, 1, 1)).toBe(three);
    expect(moveLayer(three, 1, 3)).toBe(three);
  });

  it('duplicates a layer next to itself under a fresh id', () => {
    const once = duplicateLayer(three, 1);
    expect(once?.id).toBe('upper-copy');
    expect(ids(once?.layout as Layout)).toEqual(['base', 'upper', 'upper-copy', 'third']);
    expect(once?.layout.layers[2].name).toBe('upper copy');
    expect(duplicateLayer(once?.layout as Layout, 1)?.id).toBe('upper-copy-2');
    expect(duplicateLayer(three, 9)).toBeNull();
  });

  it('gives a copy of the base layer the base meaning of an unlisted key', () => {
    const copy = duplicateLayer(three, 0)?.layout.layers[1];
    expect(copy?.bindings['*']).toEqual({ kind: 'none' });
    expect(copy?.bindings.LHM).toEqual({ kind: 'kp', symbol: 'a' });
  });
});

describe('removing a layer', () => {
  const reached: Layout = {
    ...layout,
    layers: [
      {
        id: 'base',
        bindings: { LHM: { kind: 'kp', symbol: 'a' }, L0: { kind: 'mo', layer: 'nav' } },
      },
      { id: 'nav', name: 'Nav', bindings: { LHM: { kind: 'kp', symbol: '←' } } },
      { id: 'sym', name: 'Sym', bindings: { LHI: { kind: 'kp', symbol: '!' } } },
    ],
    combos: [
      {
        id: 'nav-only',
        keys: ['LHM', 'LHI'],
        binding: { kind: 'kp', symbol: 'q' },
        layers: ['sym'],
      },
      {
        id: 'both',
        keys: ['LHR', 'LHI'],
        binding: { kind: 'kp', symbol: 'z' },
        layers: ['base', 'sym'],
      },
    ],
    features: {
      adaptiveKeys: [
        {
          id: 'magic',
          default: { kind: 'kp', symbol: 'h' },
          triggers: [{ afterAny: ['a'], binding: { kind: 'sl', layer: 'sym' } }],
          at: [{ layer: 'sym', key: 'LHM' }],
        },
      ],
    },
    typingPaths: { '!': [{ producer: 'direct:sym/LHI' }, { producer: 'combo:both' }] },
  };

  it('names what still reaches a layer, so it is not removed out from under a key', () => {
    expect(layerReachedFrom(reached, 'nav')).toEqual(['base L0']);
    expect(layerReachedFrom(reached, 'sym')).toEqual(['magic']);
    expect(layerReachedFrom(layout, 'upper')).toEqual([]);
  });

  it('takes along what only exists on that layer', () => {
    const next = removeLayer(reached, 'sym');
    expect(next.layers.map((l) => l.id)).toEqual(['base', 'nav']);
    expect(next.combos?.map((c) => [c.id, c.layers])).toEqual([['both', ['base']]]);
    expect(next.features?.adaptiveKeys?.[0].at).toEqual([]);
    expect(next.typingPaths?.['!']).toEqual([{ producer: 'combo:both' }]);
    // The base layer stays, and an unknown layer changes nothing.
    expect(removeLayer(reached, 'base')).toBe(reached);
    expect(removeLayer(reached, 'nowhere')).toBe(reached);
  });
});
