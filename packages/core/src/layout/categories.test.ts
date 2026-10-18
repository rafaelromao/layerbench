import { describe, expect, it } from 'vitest';
import { BUNDLED_LAYOUTS, bundledLayout } from '../layouts/index.js';
import { DEFAULT_LAYER_ID_LIST, DEFAULT_LAYER_IDS } from '../layouts/templates.js';
import {
  alphaLayers,
  type LayoutCategory,
  layoutCategory,
  physicalKeyCount,
  specialFeatures,
  thumbAlphas,
} from './categories.js';
import { buildGeometry } from './compile.js';
import type { Binding, Layout } from './types.js';

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });

function qwerty(): Layout {
  const l = bundledLayout('qwerty');
  if (!l) throw new Error('no Qwerty');
  return structuredClone(l);
}

/** Qwerty with `b` on its base layer's key `id`. */
function withKey(id: string, b: Binding, base: Layout = qwerty()): Layout {
  const [first, ...rest] = base.layers;
  return { ...base, layers: [{ ...first, bindings: { ...first.bindings, [id]: b } }, ...rest] };
}

const EXPECTED: Record<LayoutCategory, string[]> = {
  special: [
    'magic-romak',
    'romak-34',
    'magic-sturdy',
    'nordrassil',
    't-34',
    'finch',
    'uno',
    'ben-vallack-piano',
    'bird',
    'caksoylar',
  ],
  thumb_alpha: [
    'hands-down-neu',
    'hands-down-gold',
    'hands-down-promethium',
    'hands-down-vibranium',
    'night',
    'dusk',
    'snth',
    'nerps',
    'sunlight',
    'aptmak',
    'rsthd',
    'enthium',
  ],
  standard: [
    'qwerty',
    'dvorak',
    'colemak',
    'colemak-dh',
    'graphite',
    'gallium',
    'canary',
    'sturdy',
    'aptv3',
    'recurva',
    'focal',
    'engram',
    'bird-30',
  ],
};

describe('the bundled layouts', () => {
  it('each fall in the category the rules give', () => {
    const got: Record<LayoutCategory, string[]> = { special: [], thumb_alpha: [], standard: [] };
    for (const l of BUNDLED_LAYOUTS) got[layoutCategory(l)].push(l.id ?? l.name);
    for (const c of Object.keys(EXPECTED) as LayoutCategory[])
      expect(got[c].sort()).toEqual([...EXPECTED[c]].sort());
  });
});

describe('a custom copy of Qwerty', () => {
  it('is Standard', () => {
    expect(layoutCategory(qwerty())).toBe('standard');
  });

  it('is Special once one of its keys is adaptive', () => {
    const l = withKey('LHP', { kind: 'adaptive', default: kp('a'), triggers: [] });
    expect(layoutCategory(l)).toBe('special');
    expect(specialFeatures(l)).toEqual([
      { feature: 'adaptive', layer: 'base', key: 'LHP', label: 'Adaptive key' },
    ]);
  });

  it('is Special with a macro, a mod morph or an alt repeat on a key', () => {
    const keys: [Binding, string][] = [
      [{ kind: 'macro', symbols: 'qu' }, 'macro'],
      [{ kind: 'mod_morph', mods: ['LSHIFT'], default: kp('a'), morphed: kp('b') }, 'mod_morph'],
      [{ kind: 'adaptive', default: { kind: 'key_repeat' } }, 'alt_repeat'],
    ];
    for (const [b, feature] of keys) {
      const l = withKey('LHP', b);
      expect(layoutCategory(l)).toBe('special');
      expect(specialFeatures(l).map((f) => f.feature)).toEqual([feature]);
    }
  });

  it('is Special with a feature inside a tap-hold, a layer-tap, a morph or a tap dance', () => {
    const adaptive: Binding = { kind: 'adaptive', default: kp('a') };
    const keys: Binding[] = [
      { kind: 'hold_tap', tap: adaptive, hold: { kind: 'mod', mod: 'LCTRL' } },
      { kind: 'lt', layer: 'num', tap: adaptive },
      { kind: 'layer_morph', layers: ['num'], active: kp('b'), inactive: adaptive },
      { kind: 'tap_dance', bindings: [kp('a'), adaptive] },
    ];
    for (const b of keys)
      expect(specialFeatures(withKey('LHP', b)).map((f) => f.feature)).toEqual(['adaptive']);
  });

  it("lists the features a macro's steps use, after the macro", () => {
    const l = withKey(
      'LHP',
      {
        kind: 'macro',
        steps: [kp('q'), { kind: 'ref', ref: 'helper' }],
        then: [{ kind: 'mod_morph', mods: ['LSHIFT'], default: kp('u'), morphed: kp('U') }],
      },
      { ...qwerty(), behaviors: { helper: kp('x') } },
    );
    expect(specialFeatures(l).map((f) => f.feature)).toEqual([
      'macro',
      'custom_behaviour',
      'mod_morph',
    ]);
    expect(alphaLayers(l)).toEqual(['base']);
  });

  it('takes an adaptive key whose default names the repeat key for an alt repeat', () => {
    const l = withKey(
      'LHP',
      { kind: 'adaptive', default: { kind: 'ref', ref: 'repeat' } },
      { ...qwerty(), behaviors: { repeat: { kind: 'key_repeat' } } },
    );
    expect(specialFeatures(l).map((f) => f.feature)).toEqual(['alt_repeat', 'custom_behaviour']);
  });

  it('is Special with a feature on a combo', () => {
    const l: Layout = {
      ...qwerty(),
      combos: [{ id: 'qu', keys: ['LTP', 'LTR'], binding: { kind: 'macro', symbols: 'qu' } }],
    };
    expect(specialFeatures(l)).toEqual([
      { feature: 'macro', combo: 'qu', comboIndex: 0, label: 'Macro “qu”' },
    ]);
    expect(layoutCategory(l)).toBe('special');
  });

  it('leaves out a combo that fires on no layer', () => {
    const l: Layout = {
      ...qwerty(),
      combos: [{ id: 'off', keys: ['LTP', 'LTR'], binding: { kind: 'macro' }, layers: [] }],
    };
    expect(specialFeatures(l)).toEqual([]);
    expect(layoutCategory(l)).toBe('standard');
  });

  it('tells two combos of one id apart by their place in the list', () => {
    const l = withKey('LTP', { kind: 'kp', keycode: 'A', symbol: 'a' });
    l.combos = [
      { id: 'twin', keys: ['LTP', 'LTR'], binding: { kind: 'macro', symbols: 'x' } },
      { id: 'twin', keys: ['LHP', 'LHR'], binding: { kind: 'macro', symbols: 'y' } },
    ];
    expect(specialFeatures(l).map((f) => [f.combo, f.comboIndex])).toEqual([
      ['twin', 0],
      ['twin', 1],
    ]);
  });

  it('names a combo with no id by its place', () => {
    const l: Layout = {
      ...qwerty(),
      combos: [{ keys: ['LTP', 'LTR'], binding: { kind: 'macro' } }],
    };
    expect(specialFeatures(l)).toEqual([
      { feature: 'macro', combo: '#1', comboIndex: 0, label: 'Macro' },
    ]);
  });

  it('is Special with a named behaviour of its own, used on a key or not used at all', () => {
    const used = withKey(
      'LHP',
      { kind: 'ref', ref: 'aa' },
      {
        ...qwerty(),
        behaviors: { aa: { kind: 'adaptive', default: kp('a') } },
      },
    );
    expect(specialFeatures(used)).toEqual([
      { feature: 'custom_behaviour', layer: 'base', key: 'LHP', label: 'Behaviour aa' },
      { feature: 'adaptive', layer: 'base', key: 'LHP', label: 'Adaptive key' },
    ]);
    const unused: Layout = { ...qwerty(), behaviors: { ht: { kind: 'kp', symbol: 'x' } } };
    expect(specialFeatures(unused)).toEqual([
      { feature: 'custom_behaviour', label: 'Behaviour ht' },
    ]);
    expect(layoutCategory(unused)).toBe('special');
  });

  it('reports an unused behaviour another unused one names once, through it', () => {
    const l: Layout = {
      ...qwerty(),
      behaviors: {
        inner: kp('x'),
        outer: { kind: 'tap_dance', bindings: [{ kind: 'ref', ref: 'inner' }] },
      },
    };
    expect(specialFeatures(l).map((f) => f.label)).toEqual(['Behaviour outer', 'Behaviour inner']);
    const loop: Layout = {
      ...qwerty(),
      behaviors: { a: { kind: 'ref', ref: 'b' }, b: { kind: 'ref', ref: 'a' } },
    };
    // Each reference written is a use, the one `b` makes back to `a` too; the loop is walked once.
    expect(specialFeatures(loop).map((f) => f.label)).toEqual([
      'Behaviour a',
      'Behaviour b',
      'Behaviour a',
    ]);
  });

  it('reads a binding that builds on a behaviour with its own fields over it', () => {
    const l = qwerty();
    l.behaviors = {
      base: { kind: 'macro', steps: [{ kind: 'ref', ref: 'helper' }] },
      helper: kp('x'),
    };
    const num = l.layers.find((x) => x.id === DEFAULT_LAYER_IDS.numbers);
    if (!num) throw new Error('no Numbers');
    // Its own steps replace the ones `base` has, so nothing uses `helper`.
    num.bindings.RHI = { kind: 'macro', ref: 'base', steps: [] };
    expect(specialFeatures(l).map((f) => f.label)).toEqual(['Behaviour helper']);
    const own = withKey(
      'LHP',
      { kind: 'adaptive', ref: 'aa', default: kp('b') },
      { ...qwerty(), behaviors: { aa: { kind: 'adaptive', default: { kind: 'key_repeat' } } } },
    );
    expect(specialFeatures(own).map((f) => f.feature)).toEqual(['custom_behaviour', 'adaptive']);
  });

  it('follows a binding that builds on a named behaviour into it', () => {
    const l = withKey(
      'LHP',
      { kind: 'adaptive', ref: 'aa' },
      {
        ...qwerty(),
        behaviors: {
          aa: { kind: 'adaptive', default: kp('a'), triggers: [{ binding: { kind: 'macro' } }] },
        },
      },
    );
    expect(specialFeatures(l).map((f) => f.feature)).toEqual([
      'custom_behaviour',
      'adaptive',
      'macro',
    ]);
  });

  it('follows a behaviour that names itself once, however many times it does', () => {
    const self: Binding = { kind: 'ref', ref: 'loop' };
    const l = withKey('LHP', self, {
      ...qwerty(),
      behaviors: { loop: { kind: 'tap_dance', bindings: [self, self, self, kp('a')] } },
    });
    expect(specialFeatures(l)).toHaveLength(4);
    expect(alphaLayers(l)).toEqual(['base']);
  });

  it('is Special with caps word or sentence case declared, each once on the key it wraps', () => {
    const caps: Layout = { ...qwerty(), keys: { space: 'L0', shift: { key: 'R0', kind: 'sk' } } };
    caps.features = { capsWord: {} };
    expect(specialFeatures(caps)).toEqual([
      { feature: 'mod_morph', layer: 'base', key: 'R0', label: 'Caps word' },
    ]);
    expect(layoutCategory(caps)).toBe('special');
    const sentence: Layout = { ...qwerty(), features: { sentenceCase: {} } };
    expect(specialFeatures(sentence)).toEqual([
      { feature: 'adaptive', layer: 'base', key: sentence.keys.space, label: 'Sentence case' },
    ]);
    const off: Layout = { ...qwerty(), features: { sentenceCase: { enabled: false } } };
    expect(layoutCategory(off)).toBe('standard');
  });

  it('reports caps word and sentence case on the same key as two uses', () => {
    const l: Layout = {
      ...qwerty(),
      features: { sentenceCase: { key: 'R0' }, capsWord: { key: 'R0' } },
    };
    expect(specialFeatures(l).map((f) => f.label)).toEqual(['Caps word', 'Sentence case']);
  });

  it('leaves a behaviour a macro on a default layer uses to the default layers', () => {
    const l = qwerty();
    l.behaviors = { pct: kp('%') };
    const num = l.layers.find((x) => x.id === DEFAULT_LAYER_IDS.numbers);
    if (!num) throw new Error('no Numbers');
    num.bindings.RHI = { kind: 'macro', steps: [{ kind: 'ref', ref: 'pct' }] };
    expect(specialFeatures(l)).toEqual([]);
  });

  it('leaves a behaviour only the default layers use to them', () => {
    const l = qwerty();
    l.behaviors = { pct: kp('%') };
    const num = l.layers.find((x) => x.id === DEFAULT_LAYER_IDS.numbers);
    if (!num) throw new Error('no Numbers');
    num.bindings.RHI = { kind: 'ref', ref: 'pct' };
    expect(specialFeatures(l)).toEqual([]);
    expect(layoutCategory(l)).toBe('standard');
  });

  it('leaves the default layers and the combos only they have out', () => {
    const l = qwerty();
    const num = l.layers.find((x) => x.id === DEFAULT_LAYER_IDS.numbers);
    if (!num) throw new Error('no Numbers');
    num.bindings.RHI = { kind: 'macro', symbols: 'xyz' };
    l.combos = [
      ...(l.combos ?? []),
      {
        id: 'on-num',
        keys: ['RHI', 'RHM'],
        binding: { kind: 'macro' },
        layers: [DEFAULT_LAYER_IDS.numbers],
      },
    ];
    expect(specialFeatures(l)).toEqual([]);
    expect(alphaLayers(withKey('RHI', kp('a'), l))).toEqual(['base']);
    expect(layoutCategory(l)).toBe('standard');
  });

  it('is Thumb Alpha once a thumb types a letter, through a tap-hold too', () => {
    const l = withKey('R0', { kind: 'hold_tap', tap: kp('e'), hold: { kind: 'mo', layer: 'sym' } });
    expect(thumbAlphas(l)).toEqual([{ layer: 'base', key: 'R0', letter: 'e' }]);
    expect(layoutCategory(l)).toBe('thumb_alpha');
  });

  it('reads an unlisted thumb as its layer default', () => {
    const l = qwerty();
    const [base, ...rest] = l.layers;
    const bindings: Record<string, Binding> = { ...base.bindings, '*': kp('e') };
    for (const id of ['L0', 'R0']) delete bindings[id];
    const wild: Layout = { ...l, layers: [{ ...base, bindings }, ...rest] };
    expect(thumbAlphas(wild).map((t) => t.key)).toEqual(expect.arrayContaining(['L0', 'R0']));
    expect(layoutCategory(wild)).toBe('thumb_alpha');
  });

  it('does not count a layer default no key of the board is left to', () => {
    const l = qwerty();
    const every = Object.fromEntries(
      buildGeometry(l).keys.map((k) => [k.id, { kind: 'none' } as Binding]),
    );
    l.layers.splice(1, 0, { id: 'covered', bindings: { '*': kp('a'), ...every } });
    expect(alphaLayers(l)).toEqual(['base']);
    l.layers[1].bindings['*'] = { kind: 'macro', symbols: 'qu' };
    expect(specialFeatures(l)).toEqual([]);
  });

  it('is Standard with no alpha layer at all, as everything else is', () => {
    const l = qwerty();
    const [base, ...rest] = l.layers;
    const empty: Layout = { ...l, layers: [{ ...base, bindings: {} }, ...rest] };
    expect(alphaLayers(empty)).toEqual([]);
    expect(layoutCategory(empty)).toBe('standard');
  });

  it('is Special with a second alpha layer', () => {
    const l = qwerty();
    l.layers.splice(1, 0, { id: 'alpha2', bindings: { LHP: kp('ç'), LHR: kp('Z') } });
    expect(alphaLayers(l)).toEqual(['base', 'alpha2']);
    expect(layoutCategory(l)).toBe('special');
  });

  it('does not count a letter a macro types toward an alpha layer', () => {
    const l = qwerty();
    l.layers.splice(1, 0, { id: 'words', bindings: { LHP: { kind: 'macro', symbols: 'the' } } });
    expect(alphaLayers(l)).toEqual(['base']);
  });

  it('counts a letter typed by keycode, as unicode, or through a named behaviour', () => {
    const l = qwerty();
    l.behaviors = { ee: kp('e') };
    l.layers.splice(
      1,
      0,
      { id: 'codes', bindings: { LHP: { kind: 'kp', keycode: 'A' } } },
      {
        id: 'unicode',
        bindings: { LHP: { kind: 'unicode', symbol: 'é' }, LHR: { kind: 'unicode', symbol: 'e' } },
      },
      { id: 'named', bindings: { LHP: { kind: 'ref', ref: 'ee' } } },
    );
    expect(alphaLayers(l)).toEqual(['base', 'codes', 'unicode', 'named']);
  });
});

describe('the key count', () => {
  it('is the physical keys of the board, thumbs included', () => {
    const count = (preset: string) => physicalKeyCount({ ...qwerty(), geometry: { preset } });
    expect(count('3x5+2')).toBe(34);
    expect(count('23332+2')).toBe(30);
    expect(count('13332+1')).toBe(26);
    expect(count('1333+2')).toBe(24);
    expect(count('1222+2')).toBe(18);
    expect(count('3x6+3')).toBe(42);
  });

  it('counts a row-stagger space bar once', () => {
    // The row-stagger presets model the letter block and the bar: ANSI's 33 keys make any layout on
    // it Special by size, as the rule says.
    const count = (preset: string) => physicalKeyCount({ ...qwerty(), geometry: { preset } });
    expect(count('ansi')).toBe(33);
    expect(count('iso')).toBe(34);
    const custom = (family: 'rowstagger' | 'columnar') =>
      physicalKeyCount({
        ...qwerty(),
        geometry: {
          family,
          custom: ['L0', 'R0'].map((id) => ({
            id,
            hand: id[0] as 'L' | 'R',
            finger: id[0] === 'L' ? 'LT' : 'RT',
            row: 3,
            col: 0,
            x: 0,
            y: 3,
            w: 6,
            h: 1,
            rotation: 0,
            home: false,
            thumb: true,
            inner: false,
          })),
        },
      });
    expect(custom('rowstagger')).toBe(1);
    expect(custom('columnar')).toBe(2);
    const split = physicalKeyCount({
      ...qwerty(),
      geometry: {
        family: 'rowstagger',
        custom: ['L0', 'R0'].map((id, i) => ({
          id,
          hand: id[0] as 'L' | 'R',
          finger: id[0] === 'L' ? 'LT' : 'RT',
          row: 3,
          col: 0,
          x: 4 + 5 * i,
          y: 3,
          w: 3,
          h: 1,
          rotation: 0,
          home: false,
          thumb: true,
          inner: false,
        })),
      },
    });
    expect(split).toBe(2);
    const stacked = physicalKeyCount({
      ...qwerty(),
      geometry: {
        family: 'rowstagger',
        custom: ['L0', 'R0'].map((id, i) => ({
          id,
          hand: id[0] as 'L' | 'R',
          finger: id[0] === 'L' ? 'LT' : 'RT',
          row: 3,
          col: 0,
          x: 6,
          y: 3,
          w: 2 + i,
          h: 1,
          rotation: 0,
          home: false,
          thumb: true,
          inner: false,
        })),
      },
    });
    expect(stacked).toBe(2);
  });
});

it('lists every default layer', () => {
  expect([...DEFAULT_LAYER_ID_LIST].sort()).toEqual(Object.values(DEFAULT_LAYER_IDS).sort());
});
