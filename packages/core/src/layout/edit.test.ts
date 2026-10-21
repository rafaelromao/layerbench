import { describe, expect, it } from 'vitest';
import { bundledLayout } from '../layouts/index.js';
import { enumerateProducers } from '../sim/producers.js';
import { compileLayout } from './compile.js';
import { applyEdit, type Edit, type EditOutcome } from './edit.js';
import { keyBinding } from './ops.js';
import type { Binding, Layout } from './types.js';

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });

const layout: Layout = {
  format: 'layerbench/layout@1',
  name: 'Test',
  geometry: { preset: '3x5+2' },
  keys: { space: 'L0' },
  layers: [
    { id: 'base', name: 'Base', bindings: { LHM: kp('a'), LHI: kp('b') } },
    { id: 'upper', name: 'Upper', bindings: { '*': { kind: 'trans' }, LHM: kp('1') } },
  ],
};

/** The outcome of an edit that has to land, so a test reads what it landed on. */
function landed(before: Layout, edit: Edit) {
  const o = applyEdit(before, edit);
  if (o.status !== 'landed') {
    throw new Error(`${edit.kind} was ${o.status}${'message' in o ? `: ${o.message}` : ''}`);
  }
  return o;
}

const ids = (l: Layout) => l.layers.map((x) => x.id);

describe('the binding a key carries as authored', () => {
  it('is its own entry, not the one the layer falls through to', () => {
    expect(keyBinding(layout, 0, 'LHM')).toEqual(kp('a'));
    expect(keyBinding(layout, 1, 'LHI')).toBeUndefined();
    expect(keyBinding(layout, 9, 'LHM')).toBeUndefined();
  });
});

describe('edits to keys', () => {
  it('binds every key listed, and lands on them without disturbing the other layers', () => {
    const o = landed(layout, {
      kind: 'bind',
      layer: 'upper',
      keys: ['LHI', 'LHR'],
      binding: kp('2'),
    });
    expect(o.layout.layers[1].bindings).toMatchObject({ LHI: kp('2'), LHR: kp('2') });
    expect(o.layout.layers[0]).toBe(layout.layers[0]);
    expect(o.at).toEqual({ keys: ['LHI', 'LHR'] });
  });

  it('swaps an explicit key with an implicit one by moving, not duplicating', () => {
    const o = landed(layout, { kind: 'swap', layer: 'upper', from: 'LHM', to: 'LHI' });
    expect(o.layout.layers[1].bindings.LHI).toEqual(kp('1'));
    expect('LHM' in o.layout.layers[1].bindings).toBe(false);
    expect(o.at).toEqual({ keys: ['LHI'] });
  });

  it('copies onto a key, overwriting what was there and leaving the source alone', () => {
    const o = landed(layout, { kind: 'copy', layer: 'base', from: 'LHM', to: 'LHI' });
    expect(o.layout.layers[0].bindings).toMatchObject({ LHM: kp('a'), LHI: kp('a') });
    expect(o.at).toEqual({ keys: ['LHI'] });
  });

  it('copying an implicit key makes the target implicit too', () => {
    const o = landed(layout, { kind: 'copy', layer: 'upper', from: 'LHI', to: 'LHM' });
    expect('LHM' in o.layout.layers[1].bindings).toBe(false);
  });

  it('sends keys to another layer, clearing them behind only when moving, and lands there', () => {
    const moved = landed(layout, {
      kind: 'send',
      layer: 'base',
      toLayer: 'upper',
      keys: ['LHI'],
      mode: 'move',
    });
    expect(moved.layout.layers[1].bindings.LHI).toEqual(kp('b'));
    expect('LHI' in moved.layout.layers[0].bindings).toBe(false);
    expect(moved.at).toEqual({ layer: 'upper', keys: ['LHI'] });

    const copied = landed(layout, {
      kind: 'send',
      layer: 'base',
      toLayer: 'upper',
      keys: ['LHM', 'LHI'],
      mode: 'copy',
    });
    expect(copied.layout.layers[1].bindings).toMatchObject({ LHM: kp('a'), LHI: kp('b') });
    expect(copied.layout.layers[0].bindings).toMatchObject({ LHM: kp('a'), LHI: kp('b') });
  });
});

describe('adaptive keys move as the bindings they are', () => {
  const adaptiveKey: Binding = {
    kind: 'adaptive',
    default: kp('h'),
    triggers: [{ afterAny: ['a'], binding: kp('v') }],
  };
  const altRepeat: Binding = { kind: 'adaptive', default: { kind: 'key_repeat' }, triggers: [] };
  const withAdaptive: Layout = {
    ...layout,
    layers: [
      { ...layout.layers[0], bindings: { ...layout.layers[0].bindings, LHM: adaptiveKey } },
      { ...layout.layers[1], bindings: { ...layout.layers[1].bindings, LHI: altRepeat } },
    ],
    features: { sentenceCase: {} },
  };

  it('carries an adaptive key along when its key is swapped', () => {
    const o = landed(withAdaptive, { kind: 'swap', layer: 'base', from: 'LHM', to: 'LHI' });
    expect(o.layout.layers[0].bindings.LHI).toBe(adaptiveKey);
    expect(o.layout.layers[0].bindings.LHM).toEqual(kp('b'));
    // A feature that follows a role is left where it was.
    expect(o.layout.features).toBe(withAdaptive.features);
  });

  it('copies an adaptive key onto another key as a copy of its own', () => {
    const o = landed(withAdaptive, { kind: 'copy', layer: 'base', from: 'LHM', to: 'LHI' });
    expect(o.layout.layers[0].bindings.LHI).toEqual(adaptiveKey);
    expect(o.layout.layers[0].bindings.LHM).toBe(adaptiveKey);
  });

  it('sends an alt repeat to another layer, keeping it only when copying', () => {
    const send = (mode: 'move' | 'copy'): Edit => ({
      kind: 'send',
      layer: 'upper',
      toLayer: 'base',
      keys: ['LHI'],
      mode,
    });
    const moved = landed(withAdaptive, send('move'));
    expect(moved.layout.layers[0].bindings.LHI).toBe(altRepeat);
    expect('LHI' in moved.layout.layers[1].bindings).toBe(false);
    expect(landed(withAdaptive, send('copy')).layout.layers[1].bindings.LHI).toBe(altRepeat);
  });
});

describe('layers', () => {
  const three: Layout = {
    ...layout,
    layers: [...layout.layers, { id: 'third', name: 'Third', bindings: {} }],
  };

  it('adds a layer under an unused id, and lands on it with no keys', () => {
    const once = landed(layout, { kind: 'addLayer', name: 'Nav' });
    expect(once.layout.layers[2]).toEqual({
      id: 'nav',
      name: 'Nav',
      bindings: { '*': { kind: 'trans' } },
    });
    expect(once.at).toEqual({ layer: 'nav', keys: [] });
    expect(landed(once.layout, { kind: 'addLayer', name: 'Nav' }).at.layer).toBe('nav-2');
  });

  // Numbered by how many layers there were, this one came out as nav-3 and would not compile.
  it('never numbers a new layer onto an id still in use', () => {
    const gapped: Layout = {
      ...layout,
      layers: [layout.layers[0], { id: 'nav', bindings: {} }, { id: 'nav-3', bindings: {} }],
    };
    expect(landed(gapped, { kind: 'addLayer', name: 'Nav' }).at.layer).toBe('nav-2');
  });

  it('names a layer without a name by its place, and one with nothing to spell as `layer`', () => {
    const unnamed = landed(layout, { kind: 'addLayer', name: '  ' });
    expect(unnamed.layout.layers[2]).toMatchObject({ id: 'layer-3', name: 'Layer 3' });
    expect(landed(layout, { kind: 'addLayer', name: '数字' }).at.layer).toBe('layer');
  });

  it('moves a layer, and keeps the base layer first', () => {
    expect(ids(landed(three, { kind: 'moveLayer', layer: 'third', to: 1 }).layout)).toEqual([
      'base',
      'third',
      'upper',
    ]);
  });

  it('duplicates a layer next to itself under an unused id, and lands on the copy', () => {
    const once = landed(three, { kind: 'duplicateLayer', layer: 'upper' });
    expect(ids(once.layout)).toEqual(['base', 'upper', 'upper-copy', 'third']);
    expect(once.layout.layers[2].name).toBe('Upper copy');
    expect(once.at).toEqual({ layer: 'upper-copy' });
    expect(landed(once.layout, { kind: 'duplicateLayer', layer: 'upper' }).at.layer).toBe(
      'upper-copy-2',
    );
  });

  it('gives a copy of the base layer the base meaning of an unlisted key', () => {
    const copy = landed(three, { kind: 'duplicateLayer', layer: 'base' }).layout.layers[1];
    expect(copy.bindings['*']).toEqual({ kind: 'none' });
    expect(copy.bindings.LHM).toEqual(kp('a'));
  });

  it('renames a layer to the name trimmed, and colours it or gives it back its automatic colour', () => {
    const renamed = landed(layout, { kind: 'renameLayer', layer: 'upper', name: ' Shifted ' });
    expect(renamed.layout.layers[1].name).toBe('Shifted');
    const red = landed(layout, { kind: 'colorLayer', layer: 'upper', color: 'red' }).layout;
    expect(red.layers[1].color).toBe('red');
    const automatic = landed(red, { kind: 'colorLayer', layer: 'upper', color: undefined });
    expect('color' in automatic.layout.layers[1]).toBe(false);
  });
});

describe("a layer's id", () => {
  const linked: Layout = {
    ...layout,
    layers: [
      {
        id: 'base',
        bindings: {
          LHM: kp('a'),
          L0: { kind: 'hold_tap', tap: kp(' '), hold: { kind: 'mo', layer: 'upper' } },
          R0: { kind: 'macro', symbols: 'ç', then: [{ kind: 'sl', layer: 'upper' }] },
        },
      },
      { id: 'upper', name: 'Upper', bindings: { '*': { kind: 'trans' }, LHM: kp('1') } },
    ],
    combos: [
      {
        id: 'up',
        keys: ['LHM', 'LHI'],
        binding: { kind: 'sl', layer: 'upper' },
        layers: ['upper'],
      },
    ],
    conditionalLayers: [{ if: ['base', 'upper'], then: 'upper' }],
    activators: { upper: [{ from: 'base', via: 'key:base/L0' }] },
    features: { sentenceCase: { on: ['base'] } },
    typingPaths: { '1': [{ producer: 'direct:upper/LHM' }] },
  };

  it('changes, and every key, combo, condition, way in, feature and typing path that names it follows', () => {
    const next = landed(linked, { kind: 'setLayerId', layer: 'base', id: 'alpha1' }).layout;
    expect(next.layers.map((l) => l.id)).toEqual(['alpha1', 'upper']);
    expect(next.conditionalLayers).toEqual([{ if: ['alpha1', 'upper'], then: 'upper' }]);
    expect(next.activators).toEqual({ upper: [{ from: 'alpha1', via: 'key:alpha1/L0' }] });
    expect(next.features).toEqual({ sentenceCase: { on: ['alpha1'] } });
    const up = landed(next, { kind: 'setLayerId', layer: 'upper', id: 'alpha2' }).layout;
    expect(up.layers[0].bindings.L0).toEqual({
      kind: 'hold_tap',
      tap: kp(' '),
      hold: { kind: 'mo', layer: 'alpha2' },
    });
    expect(up.layers[0].bindings.R0).toEqual({
      kind: 'macro',
      symbols: 'ç',
      then: [{ kind: 'sl', layer: 'alpha2' }],
    });
    expect(up.combos?.[0]).toMatchObject({
      binding: { kind: 'sl', layer: 'alpha2' },
      layers: ['alpha2'],
    });
    expect(up.typingPaths).toEqual({ '1': [{ producer: 'direct:alpha2/LHM' }] });
    expect(() => compileLayout(up)).not.toThrow();
  });

  it('refuses an id another layer has, or one no layer could have', () => {
    for (const id of ['upper', 'a b', '']) {
      expect(applyEdit(linked, { kind: 'setLayerId', layer: 'base', id }).status).toBe('refused');
    }
    expect(applyEdit(linked, { kind: 'setLayerId', layer: 'base', id: 'base' }).status).toBe(
      'unchanged',
    );
  });
});

describe("what a layer's unlisted keys do", () => {
  it('is to show through or do nothing, and only that layer', () => {
    const none = landed(layout, { kind: 'setLayerFallback', layer: 'upper', fallback: 'none' });
    expect(none.layout.layers[1].bindings['*']).toEqual({ kind: 'none' });
    expect(none.layout.layers[1].bindings.LHM).toEqual(kp('1'));
    const back = landed(none.layout, {
      kind: 'setLayerFallback',
      layer: 'upper',
      fallback: 'trans',
    });
    expect(back.layout.layers[1].bindings['*']).toEqual({ kind: 'trans' });
    expect(
      applyEdit(layout, { kind: 'setLayerFallback', layer: 'upper', fallback: 'trans' }).status,
    ).toBe('unchanged');
  });
});

describe('the release defaults of one-shot layers and keys', () => {
  it('are set for the whole layout, and taken away when empty', () => {
    const sk = { quickRelease: true, ignoreModifiers: true, releaseAfterMs: 1500 };
    const set = landed(layout, { kind: 'setBehaviorDefaults', defaults: { sk } }).layout;
    expect(set.behaviorDefaults).toEqual({ sk });
    const cleared = landed(set, { kind: 'setBehaviorDefaults', defaults: {} }).layout;
    expect('behaviorDefaults' in cleared).toBe(false);
  });
});

describe('removing a layer', () => {
  const reached: Layout = {
    ...layout,
    layers: [
      {
        id: 'base',
        bindings: {
          LHM: kp('a'),
          L0: { kind: 'mo', layer: 'nav' },
          // An adaptive key whose branch reaches a layer reaches it like any key would.
          LHI: {
            kind: 'adaptive',
            default: kp('h'),
            triggers: [{ afterAny: ['a'], binding: { kind: 'sl', layer: 'sym' } }],
          },
        },
      },
      { id: 'nav', name: 'Nav', bindings: { LHM: kp('←') } },
      { id: 'sym', name: 'Sym', bindings: { LHI: kp('!') } },
    ],
    combos: [
      { id: 'sym-only', keys: ['LHM', 'LHI'], binding: kp('q'), layers: ['sym'] },
      { id: 'both', keys: ['LHR', 'LHI'], binding: kp('z'), layers: ['base', 'sym'] },
    ],
    features: { sentenceCase: { on: ['base', 'sym'] } },
    typingPaths: { '!': [{ producer: 'direct:sym/LHI' }, { producer: 'combo:both' }] },
  };

  it('is refused for the base layer, and for a layer something still reaches, naming what', () => {
    expect(applyEdit(reached, { kind: 'removeLayer', layer: 'base' })).toMatchObject({
      status: 'refused',
      message: 'cannot remove the base layer',
    });
    expect(applyEdit(reached, { kind: 'removeLayer', layer: 'nav' })).toMatchObject({
      status: 'refused',
      message: 'Nav is still reached from base L0. Point those at another layer first.',
    });
    expect(applyEdit(reached, { kind: 'removeLayer', layer: 'sym' })).toMatchObject({
      status: 'refused',
      message: 'Sym is still reached from base LHI. Point those at another layer first.',
    });
  });

  it("is refused in Magic Romak for Numbers, which Alpha 1's thumb reaches", () => {
    const magicRomak = bundledLayout('magic-romak') as Layout;
    const o = applyEdit(magicRomak, { kind: 'removeLayer', layer: 'num' });
    expect(o.status).toBe('refused');
    expect('message' in o && o.message).toMatch(/^Numbers is still reached from Alpha 1 L0\b/);
  });

  it('takes along what only exists on that layer', () => {
    const unreached: Layout = {
      ...reached,
      layers: [{ ...reached.layers[0], bindings: { LHM: kp('a') } }, ...reached.layers.slice(1)],
    };
    const o = landed(unreached, { kind: 'removeLayer', layer: 'sym' });
    expect(ids(o.layout)).toEqual(['base', 'nav']);
    expect(o.layout.combos?.map((c) => [c.id, c.layers])).toEqual([['both', ['base']]]);
    expect(o.layout.features?.sentenceCase?.on).toEqual(['base']);
    expect(o.layout.typingPaths?.['!']).toEqual([{ producer: 'combo:both' }]);
    // Whoever shows the layout keeps showing what it can: the edit is about no layer of its own.
    expect(o.at).toEqual({});
  });
});

describe('combos', () => {
  const combo = (keys: string[], layer = 'base'): Edit => ({
    kind: 'addCombo',
    layer,
    keys,
    binding: kp('q'),
    role: 'typing',
  });

  it('adds a combo on the layer given, under an unused id, with the defaults ZMK has', () => {
    const once = landed(layout, combo(['LHM', 'LHI']));
    expect(once.layout.combos).toEqual([
      {
        id: 'lhm-lhi',
        keys: ['LHM', 'LHI'],
        binding: kp('q'),
        layers: ['base'],
        role: 'typing',
        timeoutMs: 50,
        slowRelease: false,
      },
    ]);
    // The same keys on another layer are another combo, not the first one again.
    const twice = landed(once.layout, combo(['LHM', 'LHI'], 'upper'));
    expect(twice.layout.combos?.map((c) => c.id)).toEqual(['lhm-lhi', 'lhm-lhi-2']);
  });

  it('is refused with fewer than two keys', () => {
    expect(applyEdit(layout, combo(['LHM']))).toMatchObject({
      status: 'refused',
      message: 'a combo needs at least two keys and an output',
    });
  });

  // Saved layouts can hold two combos under one id, from before ids were kept apart.
  it('removes and toggles the combo at its place, even when another has its id', () => {
    const twins: Layout = {
      ...layout,
      combos: [
        { id: 'twin', keys: ['LHM', 'LHI'], binding: kp('q'), layers: ['base'], role: 'typing' },
        { id: 'twin', keys: ['LHM', 'LHI'], binding: kp('z'), layers: ['upper'], role: 'typing' },
      ],
    };
    const removed = landed(twins, { kind: 'removeCombo', combo: 1 });
    expect(removed.layout.combos?.map((c) => c.binding)).toEqual([kp('q')]);
    const toggled = landed(twins, { kind: 'toggleComboRole', combo: 0 });
    expect(toggled.layout.combos?.map((c) => c.role)).toEqual(['command', 'typing']);
  });
});

describe('changing a combo', () => {
  const withCombos: Layout = {
    ...layout,
    combos: [
      { id: 'lhm-lhi', keys: ['LHM', 'LHI'], binding: kp('q'), layers: ['base'], role: 'typing' },
      { id: 'lhm-lhr', keys: ['LHM', 'LHR'], binding: kp('z'), layers: ['upper'], role: 'command' },
    ],
    typingPaths: { q: [{ producer: 'combo:lhm-lhi' }] },
  };

  /** Every producer the simulator makes for the layout: the ids a typing path can name. */
  const producerIds = (l: Layout) => [...enumerateProducers(compileLayout(l), 'model').byId.keys()];
  const pathOf = (l: Layout, symbol: string) => l.typingPaths?.[symbol]?.map((e) => e.producer);
  const geoKey = (id: string, x: number) => ({
    id,
    hand: 'L' as const,
    finger: 'LI' as const,
    row: 1 as const,
    col: 4,
    x,
    y: 0,
    w: 1,
    h: 1,
    rotation: 0,
    home: false,
    thumb: false,
    inner: false,
  });
  const update = (change: Omit<Extract<Edit, { kind: 'updateCombo' }>, 'kind' | 'combo'>, at = 0) =>
    applyEdit(withCombos, { kind: 'updateCombo', combo: at, ...change });

  it('changes the output to any binding, keeping the id, the keys and the rest', () => {
    const tapHold: Binding = { kind: 'hold_tap', tap: kp('a'), hold: kp('b') };
    const o = landed(withCombos, { kind: 'updateCombo', combo: 0, binding: tapHold });
    expect(o.layout.combos?.[0]).toEqual({ ...withCombos.combos?.[0], binding: tapHold });
    expect(o.layout.combos?.[1]).toEqual(withCombos.combos?.[1]);
  });

  it('refuses Transparent, or a behaviour that is, on a combo added or changed', () => {
    const named: Layout = { ...withCombos, behaviors: { see: { kind: 'trans' } } };
    for (const binding of [{ kind: 'trans' }, { kind: 'ref', ref: 'see' }] as Binding[]) {
      const changed = applyEdit(named, { kind: 'updateCombo', combo: 0, binding });
      expect(changed).toMatchObject({ status: 'refused', message: /cannot be Transparent/ });
      const added = applyEdit(named, {
        kind: 'addCombo',
        layer: 'base',
        keys: ['LHP', 'LHR'],
        binding,
        role: 'typing',
      });
      expect(added).toMatchObject({ status: 'refused', message: /cannot be Transparent/ });
    }
  });

  it('follows references as deep as the compiler does to find Transparent', () => {
    const behaviors: Record<string, Binding> = { b0: { kind: 'trans' } };
    for (let i = 1; i <= 10; i++) behaviors[`b${i}`] = { kind: 'ref', ref: `b${i - 1}` };
    const deep: Layout = { ...withCombos, behaviors };
    const o = applyEdit(deep, {
      kind: 'updateCombo',
      combo: 0,
      binding: { kind: 'ref', ref: 'b10' },
    });
    expect(o).toMatchObject({ status: 'refused', message: /cannot be Transparent/ });
  });

  it('refuses a behaviour edit that would make a combo referring to it Transparent', () => {
    const named: Layout = {
      ...withCombos,
      behaviors: { inner: kp('q'), outer: { kind: 'ref', ref: 'inner' } },
      combos: [
        {
          ...(withCombos.combos?.[0] as NonNullable<Layout['combos']>[number]),
          binding: { kind: 'ref', ref: 'outer' },
        },
      ],
    };
    const set = applyEdit(named, {
      kind: 'setBehavior',
      name: 'inner',
      binding: { kind: 'trans' },
    });
    expect(set).toMatchObject({ status: 'refused', message: /cannot be Transparent/ });
    const replaced = applyEdit(named, {
      kind: 'replaceBehaviors',
      json: JSON.stringify({ inner: { kind: 'trans' }, outer: { kind: 'ref', ref: 'inner' } }),
    });
    expect(replaced).toMatchObject({ status: 'refused', message: /cannot be Transparent/ });
    // A behaviour no combo refers to may be anything.
    expect(
      applyEdit(named, { kind: 'setBehavior', name: 'loose', binding: { kind: 'trans' } }).status,
    ).toBe('landed');
  });

  it('switches the role and sets the timeout', () => {
    const o = landed(withCombos, { kind: 'updateCombo', combo: 1, role: 'typing', timeoutMs: 80 });
    expect(o.layout.combos?.[1]).toMatchObject({ role: 'typing', timeoutMs: 80, id: 'lhm-lhr' });
  });

  it('changes the layers to those chosen, more than one', () => {
    const o = landed(withCombos, {
      kind: 'updateCombo',
      combo: 0,
      layers: ['base', 'upper', 'base'],
    });
    expect(o.layout.combos?.[0].layers).toEqual(['base', 'upper']);
  });

  it('gives a combo on other keys the id of those keys, kept free, and its typing path follows', () => {
    expect(producerIds(withCombos)).toContain('combo:lhm-lhi');
    const o = landed(withCombos, { kind: 'updateCombo', combo: 0, keys: ['LHR', 'LHI'] });
    expect(o.layout.combos?.[0]).toMatchObject({ id: 'lhr-lhi', keys: ['LHR', 'LHI'] });
    expect(pathOf(o.layout, 'q')).toEqual(['combo:lhr-lhi']);
    expect(producerIds(o.layout)).toContain('combo:lhr-lhi');
    // Another combo already has the id of the keys, though not their layer: the id is numbered.
    const numbered = landed(withCombos, { kind: 'updateCombo', combo: 0, keys: ['LHM', 'LHR'] });
    expect(numbered.layout.combos?.[0].id).toBe('lhm-lhr-2');
  });

  it('follows a twin under one id by the symbol a path is for, and leaves one both make', () => {
    const twins: Layout = {
      ...withCombos,
      combos: [
        { id: 'twin', keys: ['LHM', 'LHI'], binding: kp('q'), layers: ['base'], role: 'typing' },
        { id: 'twin', keys: ['LHM', 'LHR'], binding: kp('z'), layers: ['base'], role: 'typing' },
      ],
      typingPaths: { q: [{ producer: 'combo:twin' }], z: [{ producer: 'combo:twin' }] },
    };
    const o = landed(twins, { kind: 'updateCombo', combo: 0, keys: ['LHR', 'LHI'] });
    expect(o.layout.combos?.[0].id).toBe('lhr-lhi');
    expect(o.layout.typingPaths).toEqual({
      q: [{ producer: 'combo:lhr-lhi' }],
      z: [{ producer: 'combo:twin' }],
    });
    // Both make q: which one a path means cannot be told, so it stays as it was.
    const alike: Layout = {
      ...twins,
      combos: twins.combos?.map((c) => ({ ...c, binding: kp('q') })),
      typingPaths: { q: [{ producer: 'combo:twin' }] },
    };
    const same = landed(alike, { kind: 'updateCombo', combo: 0, keys: ['LHR', 'LHI'] });
    expect(same.layout.typingPaths).toBe(alike.typingPaths);
  });

  it('follows a combo that is the dead key into the paths of the letters it accents', () => {
    const dead: Layout = {
      ...layout,
      combos: [
        {
          id: 'dk',
          keys: ['LHR', 'LHI'],
          binding: { kind: 'dead_key', diacritic: '^' },
          layers: ['base'],
          role: 'typing',
        },
      ],
    };
    const made = producerIds(dead).filter((id) => id.startsWith('deadkey:combo:dk'));
    expect(made).toContain('deadkey:combo:dk+direct:base/LHM');
    const o = landed(
      { ...dead, typingPaths: { â: made.map((producer) => ({ producer })) } },
      { kind: 'updateCombo', combo: 0, keys: ['LHR', 'LHP'] },
    );
    const now = pathOf(o.layout, 'â') ?? [];
    expect(now).toContain('deadkey:combo:lhr-lhp+direct:base/LHM');
    expect(now.every((id) => producerIds(o.layout).includes(id))).toBe(true);
  });

  it('follows a combo that is the letter after a dead key on a key', () => {
    const dead: Layout = {
      ...layout,
      layers: [
        { id: 'base', name: 'Base', bindings: { LTR: { kind: 'dead_key', diacritic: '^' } } },
        layout.layers[1],
      ],
      combos: [
        { id: 'ltr', keys: ['LHM', 'LHI'], binding: kp('a'), layers: ['base'], role: 'typing' },
      ],
    };
    const made = producerIds(dead).filter((id) => id.includes('+combo:ltr'));
    expect(made).toContain('deadkey:base/LTR+combo:ltr');
    const o = landed(
      { ...dead, typingPaths: { â: made.map((producer) => ({ producer })) } },
      { kind: 'updateCombo', combo: 0, keys: ['LHR', 'LHI'] },
    );
    expect(pathOf(o.layout, 'â')).toContain('deadkey:base/LTR+combo:lhr-lhi');
    expect(pathOf(o.layout, 'â')?.every((id) => producerIds(o.layout).includes(id))).toBe(true);
  });

  it('names a combo by its whole id before reading a # in it as a suffix', () => {
    const hashed: Layout = {
      ...layout,
      combos: [
        { id: 'old', keys: ['LHM', 'LHI'], binding: kp('a'), layers: ['base'], role: 'typing' },
        {
          id: 'old#custom',
          keys: ['LHM', 'LHR'],
          binding: kp('b'),
          layers: ['base'],
          role: 'typing',
        },
      ],
      typingPaths: { a: [{ producer: 'combo:old' }], b: [{ producer: 'combo:old#custom' }] },
    };
    expect(producerIds(hashed)).toEqual(expect.arrayContaining(['combo:old', 'combo:old#custom']));
    const o = landed(hashed, { kind: 'updateCombo', combo: 0, keys: ['LHP', 'LHI'] });
    expect(pathOf(o.layout, 'a')).toEqual(['combo:lhp-lhi']);
    expect(pathOf(o.layout, 'b')).toEqual(['combo:old#custom']);
  });

  it('tells which part of a path is the combo even when the ids hold what joins them', () => {
    const custom: Layout = {
      ...layout,
      keys: { space: 'C' },
      geometry: {
        custom: [geoKey('A', 0), geoKey('A+combo:x', 1), geoKey('C', 2), geoKey('D', 3)],
      },
      layers: [
        {
          id: 'base',
          name: 'Base',
          bindings: { '*': { kind: 'trans' }, 'A+combo:x': { kind: 'dead_key', diacritic: '^' } },
        },
      ],
      combos: [
        { id: 'old', keys: ['A', 'C'], binding: kp('a'), layers: ['base'], role: 'typing' },
        { id: 'x+combo:old', keys: ['C', 'D'], binding: kp('b'), layers: ['base'], role: 'typing' },
      ],
    };
    const real = 'deadkey:base/A+combo:x+combo:old';
    expect(producerIds(custom)).toContain(real);
    const o = landed(
      { ...custom, typingPaths: { â: [{ producer: real }] } },
      { kind: 'updateCombo', combo: 0, keys: ['A', 'D'] },
    );
    expect(pathOf(o.layout, 'â')).toEqual(['deadkey:base/A+combo:x+combo:a-d']);
    expect(producerIds(o.layout)).toContain('deadkey:base/A+combo:x+combo:a-d');
  });

  it('drops a typing path the combo no longer makes, and keeps the ones it still does', () => {
    const paths: Layout = {
      ...withCombos,
      typingPaths: {
        q: [{ producer: 'combo:lhm-lhi' }, { producer: 'direct:base/LHM' }],
        z: [{ producer: 'combo:lhm-lhi' }],
        // Not about the combo: left alone, even though nothing makes it.
        w: [{ producer: 'combo:gone' }],
      },
    };
    // Another symbol: the entry under q goes, and z, which is now what it makes, stays out of
    // q's list but is not given an entry it never had.
    const other = landed(paths, { kind: 'updateCombo', combo: 0, binding: kp('z') });
    expect(pathOf(other.layout, 'q')).toEqual(['direct:base/LHM']);
    expect(pathOf(other.layout, 'z')).toEqual(['combo:lhm-lhi']);
    expect(pathOf(other.layout, 'w')).toEqual(['combo:gone']);
    // A list that only named the combo goes with it.
    const gone = landed(
      { ...paths, typingPaths: { q: [{ producer: 'combo:lhm-lhi' }] } },
      { kind: 'updateCombo', combo: 0, binding: kp('x') },
    );
    expect(gone.layout.typingPaths).toEqual({});
    // The same symbol another way: the path stays.
    const same = landed(paths, {
      kind: 'updateCombo',
      combo: 0,
      binding: { kind: 'kp', symbol: 'q', tag: 'x' },
    });
    expect(pathOf(same.layout, 'q')).toEqual(['combo:lhm-lhi', 'direct:base/LHM']);
    // Another case is another symbol: a path for q is not one for Q.
    const upper = landed(paths, { kind: 'updateCombo', combo: 0, binding: kp('Q') });
    expect(pathOf(upper.layout, 'q')).toEqual(['direct:base/LHM']);
    // Taking the combo off the layer it types on takes its paths with it.
    const moved = landed(paths, { kind: 'updateCombo', combo: 0, role: 'command' });
    expect(pathOf(moved.layout, 'q')).toEqual(['direct:base/LHM']);
  });

  it("reads a path among its symbol's producers when one combo's id is another's id and a suffix", () => {
    const clash: Layout = {
      ...layout,
      combos: [
        {
          id: 'old',
          keys: ['LHM', 'LHI'],
          binding: { kind: 'hold_tap', tap: kp('q'), hold: kp('z') },
          layers: ['base'],
          role: 'typing',
        },
        {
          id: 'old#hold',
          keys: ['LHM', 'LHR'],
          binding: kp('b'),
          layers: ['base'],
          role: 'typing',
        },
      ],
      typingPaths: { z: [{ producer: 'combo:old#hold' }], b: [{ producer: 'combo:old#hold' }] },
    };
    expect(producerIds(clash)).toContain('combo:old#hold');
    const o = landed(clash, { kind: 'updateCombo', combo: 0, keys: ['LHP', 'LHI'] });
    // z is what the first combo makes with a hold; b is the other's, and stays as it is.
    expect(pathOf(o.layout, 'z')).toEqual(['combo:lhp-lhi#hold']);
    expect(pathOf(o.layout, 'b')).toEqual(['combo:old#hold']);
  });

  it("never takes an id whose producers would share an id with another combo's", () => {
    const clash: Layout = {
      ...layout,
      combos: [
        {
          id: 'old',
          keys: ['LHM', 'LHI'],
          binding: { kind: 'hold_tap', tap: kp('q'), hold: kp('z') },
          layers: ['base'],
          role: 'typing',
        },
        {
          id: 'lhp-lhi#hold',
          keys: ['LHM', 'LHR'],
          binding: kp('b'),
          layers: ['base'],
          role: 'typing',
        },
      ],
      typingPaths: { z: [{ producer: 'combo:old#hold' }] },
    };
    const o = landed(clash, { kind: 'updateCombo', combo: 0, keys: ['LHP', 'LHI'] });
    expect(o.layout.combos?.[0].id).toBe('lhp-lhi-2');
    expect(pathOf(o.layout, 'z')).toEqual(['combo:lhp-lhi-2#hold']);
    // Adding one on those keys keeps clear of it the same way.
    const added = landed(clash, {
      kind: 'addCombo',
      layer: 'upper',
      keys: ['LHP', 'LHI'],
      binding: kp('x'),
      role: 'typing',
    });
    expect(added.layout.combos?.[2].id).toBe('lhp-lhi-2');
  });

  it("refuses an output that would give it a producer another combo's id already names", () => {
    const imported: Layout = {
      ...layout,
      combos: [
        { id: 'old', keys: ['LHM', 'LHI'], binding: kp('a'), layers: ['base'], role: 'typing' },
        {
          id: 'old#hold',
          keys: ['LHM', 'LHR'],
          binding: kp('b'),
          layers: ['base'],
          role: 'typing',
        },
      ],
    };
    const tapHold: Binding = { kind: 'hold_tap', tap: kp('q'), hold: kp('z') };
    expect(applyEdit(imported, { kind: 'updateCombo', combo: 0, binding: tapHold })).toMatchObject({
      status: 'refused',
      message: expect.stringMatching(/^combo:old#hold would name an output of another combo too/),
    });
    // A clash the layout already had is not this edit's to refuse.
    const already: Layout = {
      ...imported,
      combos: [{ ...imported.combos![0], binding: tapHold }, imported.combos![1]],
    };
    expect(applyEdit(already, { kind: 'updateCombo', combo: 0, role: 'command' }).status).toBe(
      'landed',
    );
  });

  it('refuses an output that would make two dead-key producers share an id', () => {
    const dead: Binding = { kind: 'dead_key', diacritic: '´' };
    const combo = (id: string, keys: string[], binding: Binding) => ({
      id,
      keys,
      binding,
      layers: ['base'],
      role: 'typing' as const,
    });
    const imported: Layout = {
      ...layout,
      combos: [
        combo('a', ['LHM', 'LHI'], kp('x')),
        combo('b+combo:c', ['LHM', 'LHR'], kp('e')),
        combo('a+combo:b', ['LHR', 'LHI'], dead),
        combo('c', ['LHP', 'LHI'], kp('e')),
      ],
    };
    // As the accent before `b+combo:c`, `a` would make the id `a+combo:b` makes before `c`.
    expect(applyEdit(imported, { kind: 'updateCombo', combo: 0, binding: dead })).toMatchObject({
      status: 'refused',
      message: expect.stringMatching(/^deadkey:combo:a\+combo:b\+combo:c would name/),
    });
  });

  it('follows an unnamed combo by the id the compiler gives it', () => {
    const unnamed: Layout = {
      ...withCombos,
      combos: [
        { keys: ['LHM', 'LHI'], binding: kp('q'), layers: ['base'], role: 'typing' },
        { keys: ['LHM', 'LHR'], binding: kp('z'), layers: ['upper'], role: 'typing' },
      ],
      typingPaths: { q: [{ producer: 'combo:combo0' }], z: [{ producer: 'combo:combo1' }] },
    };
    const o = landed(unnamed, { kind: 'updateCombo', combo: 0, keys: ['LHR', 'LHI'] });
    expect(o.layout.combos?.[0].id).toBe('lhr-lhi');
    expect(o.layout.typingPaths).toEqual({
      q: [{ producer: 'combo:lhr-lhi' }],
      z: [{ producer: 'combo:combo1' }],
    });
  });

  it('tells key sets apart by their keys, whatever characters the ids hold', () => {
    const custom: Layout = {
      ...layout,
      keys: { space: 'C' },
      geometry: { custom: [geoKey('A+B', 0), geoKey('A', 1), geoKey('B+C', 2), geoKey('C', 3)] },
      layers: [{ id: 'base', name: 'Base', bindings: { '*': { kind: 'trans' } } }],
      combos: [
        { id: 'one', keys: ['A+B', 'C'], binding: kp('q'), layers: ['base'], role: 'typing' },
        { id: 'two', keys: ['A', 'B+C'], binding: kp('z'), layers: ['base'], role: 'typing' },
      ],
    };
    // 'A+B','C' and 'A','B+C' both read A+B+C when joined, but they are not the same keys.
    landed(custom, { kind: 'updateCombo', combo: 1, layers: ['base'], role: 'command' });
    expect(applyEdit(custom, { kind: 'updateCombo', combo: 1, keys: ['C', 'A+B'] })).toMatchObject({
      status: 'refused',
      message: expect.stringMatching(/already uses/),
    });
  });

  it('leaves the combo as it is when its keys come in another order', () => {
    expect(update({ keys: ['LHI', 'LHM'] }).status).toBe('unchanged');
  });

  it('is refused with a reason when the combo could not be drawn or would clash', () => {
    expect(update({ keys: ['LHM'] })).toMatchObject({
      status: 'refused',
      message: 'a combo needs at least two keys',
    });
    expect(update({ keys: ['LHM', 'LHM'] })).toMatchObject({ status: 'refused' });
    expect(update({ keys: ['LHM', 'NOPE'] })).toMatchObject({
      status: 'refused',
      message: 'the board has no key NOPE',
    });
    expect(update({ layers: [] })).toMatchObject({
      status: 'refused',
      message: 'a combo needs at least one layer',
    });
    expect(update({ layers: ['nowhere'] })).toMatchObject({
      status: 'refused',
      message: 'the layout has no layer nowhere',
    });
    expect(update({ timeoutMs: 0 })).toMatchObject({ status: 'refused' });
    // The same keys as the second combo, once the first is on its layer too.
    expect(update({ keys: ['LHR', 'LHM'], layers: ['upper'] })).toMatchObject({
      status: 'refused',
      message: expect.stringMatching(/already uses LHR\+LHM/),
    });
    // The same keys on another layer are another combo.
    expect(update({ keys: ['LHR', 'LHM'] }).status).toBe('landed');
  });

  it('counts a combo with no layers as on every layer when looking for a clash', () => {
    const everywhere: Layout = {
      ...withCombos,
      combos: [
        { id: 'a', keys: ['LHM', 'LHI'], binding: kp('q'), role: 'typing' },
        { id: 'b', keys: ['LHM', 'LHR'], binding: kp('z'), layers: ['upper'], role: 'typing' },
      ],
    };
    const o = applyEdit(everywhere, { kind: 'updateCombo', combo: 1, keys: ['LHM', 'LHI'] });
    expect(o.status).toBe('refused');
  });

  it('changes nothing when what it says is what the combo has', () => {
    for (const change of [
      {},
      { keys: ['LHM', 'LHI'] },
      { layers: ['base'] },
      { binding: kp('q') },
      { role: 'typing' as const },
    ]) {
      expect(update(change)).toEqual({
        edit: { kind: 'updateCombo', combo: 0, ...change },
        before: withCombos,
        status: 'unchanged',
      });
    }
    expect(update({ role: 'command' }, 7).status).toBe('unchanged');
  });
});

describe('behaviours, typing paths, keys, details and features', () => {
  it('sets one behaviour by name, or replaces them all from JSON', () => {
    const one = landed(layout, { kind: 'setBehavior', name: 'hm', binding: kp('x') });
    expect(one.layout.behaviors).toEqual({ hm: kp('x') });
    const all = landed(one.layout, {
      kind: 'replaceBehaviors',
      json: '{"rep": {"kind": "key_repeat"}}',
    });
    expect(all.layout.behaviors).toEqual({ rep: { kind: 'key_repeat' } });
  });

  it('refuses behaviours that are not JSON, or not an object', () => {
    const json = (text: string) => applyEdit(layout, { kind: 'replaceBehaviors', json: text });
    expect(json('{')).toMatchObject({
      status: 'refused',
      message: expect.stringMatching(/^invalid JSON: /),
    });
    expect(json('[]')).toMatchObject({ status: 'refused', message: 'behaviors must be an object' });
  });

  it("sets one symbol's typing path", () => {
    const entries = [{ producer: 'direct:base/LHM', enabled: false }];
    const o = landed(layout, { kind: 'setTypingPath', symbol: 'a', entries });
    expect(o.layout.typingPaths).toEqual({ a: entries });
  });

  it('sets the shift key, keeping its kind when only the key changes, and takes it away', () => {
    const shift = landed(layout, { kind: 'setKeys', shift: 'R0' }).layout;
    expect(shift.keys.shift).toEqual({ key: 'R0', kind: 'sk' });
    const held = landed(shift, { kind: 'setKeys', shiftKind: 'hold' }).layout;
    expect(landed(held, { kind: 'setKeys', shift: 'R1' }).layout.keys.shift).toEqual({
      key: 'R1',
      kind: 'hold',
    });
    expect(landed(held, { kind: 'setKeys', shift: null }).layout.keys.shift).toBeUndefined();
    expect(landed(layout, { kind: 'setKeys', space: 'R0' }).layout.keys.space).toBe('R0');
    const repeat = landed(layout, { kind: 'setKeys', repeat: 'tapTwice' }).layout;
    expect(repeat.repeatPolicy).toEqual({ doubledLetters: 'tapTwice' });
  });

  it('sets the details given and leaves the others', () => {
    const o = landed(layout, { kind: 'setMeta', author: 'Me', languages: [] });
    expect(o.layout).toMatchObject({ name: 'Test', author: 'Me', languages: [] });
  });

  it('sets the link, takes an empty one away, and refuses one that is no http(s) URL', () => {
    const linked = landed(layout, { kind: 'setMeta', link: ' https://example.com/mine ' }).layout;
    expect(linked.link).toBe('https://example.com/mine');
    expect(landed(linked, { kind: 'setMeta', author: 'Me' }).layout.link).toBe(
      'https://example.com/mine',
    );
    expect('link' in landed(linked, { kind: 'setMeta', link: '' }).layout).toBe(false);
    const wrong = applyEdit(linked, { kind: 'setMeta', link: 'example.com' });
    expect(wrong).toMatchObject({ status: 'refused', before: linked });
  });

  it('changes nothing when the details given are the ones the layout has', () => {
    const linked = landed(layout, { kind: 'setMeta', link: 'https://example.com/mine' }).layout;
    for (const meta of [
      { link: ' https://example.com/mine ' },
      { name: 'Test', languages: linked.languages },
    ]) {
      expect(applyEdit(linked, { kind: 'setMeta', ...meta }).status).toBe('unchanged');
    }
    expect(applyEdit(layout, { kind: 'setMeta', link: '  ' }).status).toBe('unchanged');
  });

  it('takes the features away when none is left in them', () => {
    const on = landed(layout, { kind: 'setFeatures', features: { sentenceCase: {} } }).layout;
    expect(on.features).toEqual({ sentenceCase: {} });
    const off = landed(on, { kind: 'setFeatures', features: { sentenceCase: undefined } });
    expect('features' in off.layout).toBe(false);
  });
});

describe('replacing the whole layout', () => {
  const replace = (json: string) => applyEdit(layout, { kind: 'replaceLayout', json });

  it('lands the layout pasted, about no keys', () => {
    const o = replace(JSON.stringify({ ...layout, name: 'Pasted' }));
    expect(o).toMatchObject({ status: 'landed', at: { keys: [] } });
    expect(o.status === 'landed' && o.layout.name).toBe('Pasted');
  });

  it('refuses text that is not JSON, or not a layout', () => {
    expect(replace('nope')).toMatchObject({
      status: 'refused',
      message: expect.stringMatching(/^invalid JSON: /),
    });
    expect(replace('{"name": "x"}')).toMatchObject({ status: 'refused' });
  });
});

describe('every edit', () => {
  it.each<[Edit, RegExp]>([
    [
      { kind: 'bind', layer: 'base', keys: ['LHM'], binding: { kind: 'mo', layer: 'nowhere' } },
      /nowhere/,
    ],
    [
      { kind: 'addCombo', layer: 'base', keys: ['LHM', 'NOPE'], binding: kp('q'), role: 'typing' },
      /NOPE/,
    ],
    [{ kind: 'setKeys', shift: 'NOPE' }, /NOPE/],
  ])(
    'is refused with the compile error when the layout it would leave cannot be drawn: %o',
    (edit, error) => {
      expect(applyEdit(layout, edit)).toMatchObject({
        status: 'refused',
        before: layout,
        message: expect.stringMatching(error),
      });
    },
  );

  it('leaves the layout it was given as it was', () => {
    const before = JSON.stringify(layout);
    landed(layout, { kind: 'send', layer: 'base', toLayer: 'upper', keys: ['LHM'], mode: 'move' });
    landed(layout, { kind: 'removeLayer', layer: 'upper' });
    expect(JSON.stringify(layout)).toBe(before);
  });

  it.each<Edit>([
    { kind: 'bind', layer: 'base', keys: [], binding: kp('x') },
    { kind: 'bind', layer: 'nowhere', keys: ['LHM'], binding: kp('x') },
    { kind: 'swap', layer: 'base', from: 'LHM', to: 'LHM' },
    { kind: 'copy', layer: 'base', from: 'LHM', to: 'LHM' },
    { kind: 'send', layer: 'base', toLayer: 'base', keys: ['LHM'], mode: 'move' },
    { kind: 'send', layer: 'base', toLayer: 'nowhere', keys: ['LHM'], mode: 'move' },
    { kind: 'removeLayer', layer: 'nowhere' },
    { kind: 'duplicateLayer', layer: 'nowhere' },
    { kind: 'renameLayer', layer: 'upper', name: ' Upper ' },
    { kind: 'renameLayer', layer: 'upper', name: '  ' },
    { kind: 'colorLayer', layer: 'upper', color: undefined },
    { kind: 'moveLayer', layer: 'base', to: 1 },
    { kind: 'moveLayer', layer: 'upper', to: 0 },
    { kind: 'moveLayer', layer: 'upper', to: 1 },
    { kind: 'moveLayer', layer: 'upper', to: 2 },
    { kind: 'removeCombo', combo: 0 },
    { kind: 'toggleComboRole', combo: 0 },
    { kind: 'updateCombo', combo: 0, role: 'typing' },
  ])('changes nothing when there is nothing to change: %o', (edit) => {
    const o: EditOutcome = applyEdit(layout, edit);
    expect(o).toEqual({ edit, before: layout, status: 'unchanged' });
  });
});
