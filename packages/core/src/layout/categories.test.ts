import { describe, expect, it } from 'vitest';
import { getGeometryPreset } from '../geometry/presets.js';
import { bundledLayout, goldenLayouts, withNewLayoutDefaults } from '../layouts/index.js';
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

/**
 * Qwerty with the default layers but Accents, which leaves its Numbers and Symbols its own, as an
 * author's are, after `edit` changes them by id.
 */
function withOwn(edit: (layers: Record<string, Layout['layers'][number]>) => void): Layout {
  const l = qwerty();
  const own = { ...l, layers: l.layers.filter((x) => x.id !== DEFAULT_LAYER_IDS.accents) };
  edit(Object.fromEntries(own.layers.map((x) => [x.id, x])));
  return own;
}

/** Qwerty as a user would copy it and give the default layers. */
function qwerty(): Layout {
  const l = bundledLayout('qwerty');
  if (!l) throw new Error('no Qwerty');
  return structuredClone(withNewLayoutDefaults(l, getGeometryPreset('3x5+2')));
}

/** Qwerty with `b` on its base layer's key `id`. */
function withKey(id: string, b: Binding, base: Layout = qwerty()): Layout {
  const [first, ...rest] = base.layers;
  return { ...base, layers: [{ ...first, bindings: { ...first.bindings, [id]: b } }, ...rest] };
}

const EXPECTED: Record<LayoutCategory, string[]> = {
  special: [
    'magic-romak',
    'magic-sturdy',
    // Their author's Symbols has `z` `q` (a second alpha layer); a combo types `œu` (a macro).
    'hands-down-gold',
    'hands-down-promethium',
    'hands-down-vibranium',
    // Its author's Symbols types three backticks (a macro), and its Numbers letters.
    'enthium',
    'nordrassil',
    't-34',
    'finch',
    'uno',
    'ben-vallack-piano',
    'bird',
    'caksoylar',
    // Its Alpha 2 and Ç extension type `qu`, `ç`, `ão` and `ões` as macros.
    'romak',
  ],
  thumb_alpha: ['hands-down-neu', 'night', 'dusk', 'snth', 'engram', 'sunlight', 'aptmak', 'rsthd'],
  standard: [
    'qwerty',
    'dvorak',
    'colemak',
    'colemak-dh',
    'graphite',
    'gallium',
    'canary',
    'nerps',
    'sturdy',
    'aptv3',
    'recurva',
    'focal',
    'bird-30',
  ],
};

describe('the bundled layouts', () => {
  // The list pins the design of each layout written in code. A layout a change proposed in the app
  // made a document is its file, whose category follows the rules from what it has, so a change
  // that edits what makes it Special, or deletes it, leaves the list as it is, and nothing fails.
  const written = goldenLayouts();

  it('each fall in the category the rules give, those written in code', () => {
    const named = new Set(Object.values(EXPECTED).flat());
    const got: Record<LayoutCategory, string[]> = { special: [], thumb_alpha: [], standard: [] };
    for (const l of written) {
      if (named.has(l.id ?? '')) got[layoutCategory(l)].push(l.id ?? l.name);
    }
    const ids = new Set(written.map((l) => l.id));
    for (const c of Object.keys(EXPECTED) as LayoutCategory[])
      expect(got[c].sort()).toEqual(EXPECTED[c].filter((id) => ids.has(id)).sort());
  });

  it('are all in the list, those written in code: a new one is placed in a category here', () => {
    const named = new Set(Object.values(EXPECTED).flat());
    expect(written.filter((l) => !named.has(l.id ?? '')).map((l) => l.id)).toEqual([]);
  });
});

describe('a custom copy of Qwerty', () => {
  it('is Standard', () => {
    expect(layoutCategory(qwerty())).toBe('standard');
  });

  it('is Special once one of its keys is adaptive', () => {
    const l = withKey('LHP', { kind: 'adaptive', default: kp('a'), triggers: [] });
    expect(layoutCategory(l)).toBe('special');
    expect(specialFeatures(l)).toMatchObject([
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
    const l = withKey('LHP', {
      kind: 'macro',
      steps: [kp('q'), { kind: 'adaptive', default: kp('x') }],
      then: [{ kind: 'mod_morph', mods: ['LSHIFT'], default: kp('u'), morphed: kp('U') }],
    });
    expect(specialFeatures(l).map((f) => f.feature)).toEqual(['macro', 'adaptive', 'mod_morph']);
    expect(alphaLayers(l)).toEqual(['base']);
  });

  it('is Special with a feature on a combo', () => {
    const l: Layout = {
      ...qwerty(),
      combos: [{ id: 'qu', keys: ['LTP', 'LTR'], binding: { kind: 'macro', symbols: 'qu' } }],
    };
    expect(specialFeatures(l)).toMatchObject([
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

  it('gives an alt repeat one use, and lists no macro among its branches', () => {
    const macro: Binding = { kind: 'macro', symbols: 'ões' };
    const altRepeat: Binding = {
      kind: 'adaptive',
      default: { kind: 'key_repeat' },
      triggers: [
        { afterAny: ['LHM'], binding: macro },
        { afterAny: ['LHI'], binding: { kind: 'macro', symbols: 'ê' } },
      ],
    };
    const l = withKey('LHP', altRepeat);
    const uses = specialFeatures(l);
    expect(uses.map((f) => [f.feature, f.key])).toEqual([['alt_repeat', 'LHP']]);
    // The use is the key's own binding, and the key is as special as it was.
    expect(uses[0].binding).toBe(altRepeat);
    expect(layoutCategory(l)).toBe('special');
  });

  it("lists no macro among an adaptive key's branches, whatever its default", () => {
    const l = withKey('LHP', {
      kind: 'adaptive',
      default: kp('a'),
      triggers: [{ afterAny: ['LHM'], binding: { kind: 'macro', symbols: 'ent' } }],
    });
    expect(specialFeatures(l).map((f) => f.feature)).toEqual(['adaptive']);
  });

  it("still lists the other features inside an adaptive key's branches, and a macro's steps", () => {
    const morph: Binding = {
      kind: 'mod_morph',
      mods: ['LSHIFT'],
      default: kp('u'),
      morphed: kp('U'),
    };
    const l = withKey('LHP', {
      kind: 'adaptive',
      default: kp('a'),
      triggers: [
        { afterAny: ['LHM'], binding: morph },
        // A macro in a branch is left out, but what its steps use is not.
        { afterAny: ['LHI'], binding: { kind: 'macro', steps: [morph] } },
      ],
    });
    expect(specialFeatures(l).map((f) => f.feature)).toEqual([
      'adaptive',
      'mod_morph',
      'mod_morph',
    ]);
  });

  it('keeps a macro on its own key as a use, wrapped or not, and in a morph, with its binding', () => {
    const macro: Binding = { kind: 'macro', symbols: 'qu' };
    for (const b of [
      macro,
      { kind: 'hold_tap', tap: macro, hold: { kind: 'mod', mod: 'LCTRL' } } as Binding,
      { kind: 'lt', layer: 'num', tap: macro } as Binding,
      { kind: 'tap_dance', bindings: [kp('a'), macro] } as Binding,
    ]) {
      const uses = specialFeatures(withKey('LHP', b));
      expect(uses.map((f) => f.feature)).toEqual(['macro']);
      expect(uses[0].binding).toBe(macro);
    }
    // A mod morph's branches are its two outputs, not a group: its macro is still a use of its own.
    const morph: Binding = {
      kind: 'mod_morph',
      mods: ['LSHIFT'],
      default: kp('a'),
      morphed: macro,
    };
    const uses = specialFeatures(withKey('LHP', morph));
    expect(uses.map((f) => f.feature)).toEqual(['mod_morph', 'macro']);
    expect(uses[0].binding).toBe(morph);
    expect(uses[1].binding).toBe(macro);
  });

  it('names a combo with no id by its place', () => {
    const l: Layout = {
      ...qwerty(),
      combos: [{ keys: ['LTP', 'LTR'], binding: { kind: 'macro' } }],
    };
    expect(specialFeatures(l)).toMatchObject([
      { feature: 'macro', combo: '#1', comboIndex: 0, label: 'Macro' },
    ]);
  });

  it('is Special with a sentence space on a key, once, named Sentence case', () => {
    const key = qwerty().keys.space;
    const sentence = withKey(key, { kind: 'sentence_space' });
    expect(specialFeatures(sentence)).toMatchObject([
      { feature: 'adaptive', layer: 'base', key, label: 'Sentence case' },
    ]);
    expect(layoutCategory(sentence)).toBe('special');
    expect(layoutCategory(qwerty())).toBe('standard');
  });

  it('counts caps word on the shift key as the mod morph it is, and caps word alone as nothing', () => {
    const morph: Binding = {
      kind: 'mod_morph',
      mods: ['LSHIFT', 'RSHIFT'],
      default: { kind: 'sk', mod: 'LSHIFT' },
      morphed: { kind: 'caps_word' },
    };
    const caps = withKey('R1', morph);
    expect(specialFeatures(caps)).toMatchObject([
      { feature: 'mod_morph', layer: 'base', key: 'R1', label: 'Mod morph' },
    ]);
    expect(layoutCategory(caps)).toBe('special');
    expect(specialFeatures(withKey('R1', { kind: 'caps_word' }))).toEqual([]);
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

  it("counts a layout's own Numbers and Symbols where it keeps its author's in place of the defaults", () => {
    // Qwerty without Accents has no default layers: its Numbers and Symbols are its own.
    const l = qwerty();
    const num = l.layers.find((x) => x.id === DEFAULT_LAYER_IDS.numbers);
    if (!num) throw new Error('no Numbers');
    num.bindings.RHI = { kind: 'macro', symbols: 'xyz' };
    expect(layoutCategory(l)).toBe('standard');
    const own = { ...l, layers: l.layers.filter((x) => x.id !== DEFAULT_LAYER_IDS.accents) };
    expect(specialFeatures(own)).toMatchObject([
      { feature: 'macro', layer: 'num', key: 'RHI', label: 'Macro “xyz”' },
    ]);
    expect(layoutCategory(own)).toBe('special');
  });

  // What some authors' layers have, built here: a change proposed in the app moves a bundled
  // layout's keys, and these are tests of the rules, not of those layouts.
  it('reads a macro of three backticks on its own Symbols by its text', () => {
    const l = withOwn((layers) => {
      layers[DEFAULT_LAYER_IDS.symbols].bindings.RHI = { kind: 'macro', symbols: '```' };
    });
    expect(specialFeatures(l).map((f) => f.label)).toEqual(['Macro “```”']);
  });

  it('counts a second alpha layer where its own Numbers or Symbols type letters', () => {
    const onNumbers = withOwn((layers) => {
      layers[DEFAULT_LAYER_IDS.numbers].bindings.RHM = kp('e');
    });
    expect(alphaLayers(onNumbers)).toEqual(['base', 'num']);
    expect(layoutCategory(onNumbers)).toBe('special');
    const onSymbols = withOwn((layers) => {
      layers[DEFAULT_LAYER_IDS.symbols].bindings.LHI = kp('z');
      layers[DEFAULT_LAYER_IDS.symbols].bindings.LHM = kp('q');
    });
    expect(alphaLayers(onSymbols)).toEqual(['base', 'sym']);
    expect(layoutCategory(onSymbols)).toBe('special');
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

  it('counts a letter typed by keycode or as unicode', () => {
    const l = qwerty();
    l.layers.splice(
      1,
      0,
      { id: 'codes', bindings: { LHP: { kind: 'kp', keycode: 'A' } } },
      {
        id: 'unicode',
        bindings: { LHP: { kind: 'unicode', symbol: 'é' }, LHR: { kind: 'unicode', symbol: 'e' } },
      },
    );
    expect(alphaLayers(l)).toEqual(['base', 'codes', 'unicode']);
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
