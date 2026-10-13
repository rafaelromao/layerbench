import { describe, expect, it } from 'vitest';
import { bundledLayout } from '../layouts/index.js';
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
      from: 'base',
      to: 'upper',
      keys: ['LHI'],
      mode: 'move',
    });
    expect(moved.layout.layers[1].bindings.LHI).toEqual(kp('b'));
    expect('LHI' in moved.layout.layers[0].bindings).toBe(false);
    expect(moved.at).toEqual({ layer: 'upper', keys: ['LHI'] });

    const copied = landed(layout, {
      kind: 'send',
      from: 'base',
      to: 'upper',
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
      from: 'upper',
      to: 'base',
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
    const repeat = landed(layout, { kind: 'setKeys', repeat: 'tapTwice' }).layout;
    expect(repeat.repeatPolicy).toEqual({ doubledLetters: 'tapTwice' });
  });

  it('sets the details given and leaves the others', () => {
    const o = landed(layout, { kind: 'setMeta', author: 'Me', languages: [] });
    expect(o.layout).toMatchObject({ name: 'Test', author: 'Me', languages: [] });
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
  it('is refused with the compile error when the layout it would leave cannot be drawn', () => {
    const o = applyEdit(layout, {
      kind: 'bind',
      layer: 'base',
      keys: ['LHM'],
      binding: { kind: 'mo', layer: 'nowhere' },
    });
    expect(o).toMatchObject({
      status: 'refused',
      before: layout,
      message: expect.stringMatching(/nowhere/),
    });
  });

  it('leaves the layout it was given as it was', () => {
    const before = JSON.stringify(layout);
    landed(layout, { kind: 'send', from: 'base', to: 'upper', keys: ['LHM'], mode: 'move' });
    landed(layout, { kind: 'removeLayer', layer: 'upper' });
    expect(JSON.stringify(layout)).toBe(before);
  });

  it.each<Edit>([
    { kind: 'bind', layer: 'base', keys: [], binding: kp('x') },
    { kind: 'bind', layer: 'nowhere', keys: ['LHM'], binding: kp('x') },
    { kind: 'swap', layer: 'base', from: 'LHM', to: 'LHM' },
    { kind: 'copy', layer: 'base', from: 'LHM', to: 'LHM' },
    { kind: 'send', from: 'base', to: 'base', keys: ['LHM'], mode: 'move' },
    { kind: 'send', from: 'base', to: 'nowhere', keys: ['LHM'], mode: 'move' },
    { kind: 'removeLayer', layer: 'nowhere' },
    { kind: 'duplicateLayer', layer: 'nowhere' },
    { kind: 'renameLayer', layer: 'upper', name: ' Upper ' },
    { kind: 'renameLayer', layer: 'upper', name: '  ' },
    { kind: 'colorLayer', layer: 'upper', color: undefined },
    { kind: 'moveLayer', layer: 'base', to: 1 },
    { kind: 'moveLayer', layer: 'upper', to: 0 },
    { kind: 'moveLayer', layer: 'upper', to: 1 },
    { kind: 'removeCombo', combo: 0 },
    { kind: 'toggleComboRole', combo: 0 },
  ])('changes nothing when there is nothing to change: %o', (edit) => {
    const o: EditOutcome = applyEdit(layout, edit);
    expect(o).toEqual({ edit, before: layout, status: 'unchanged' });
  });
});
