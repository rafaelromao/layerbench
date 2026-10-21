import { expect, it, describe as suite } from 'vitest';
import { bundledLayout } from '../layouts/index.js';
import { compileLayout } from './compile.js';
import { BADGE, describe, LAYER_MODE, legend, legendText, tapLabel } from './labels.js';
import type { Binding, Mod } from './types.js';

const c = compileLayout(bundledLayout('magic-romak')!);
const at = (keyId: string, layer = 0) => c.layers[layer].bindings[c.keyIndex.get(keyId)!];

suite('legends', () => {
  it('puts a layer key’s layer in the centre and how it comes on beneath', () => {
    const cases: [Binding, string][] = [
      [{ kind: 'mo', layer: 'num' }, LAYER_MODE.mo],
      [{ kind: 'sl', layer: 'num' }, LAYER_MODE.sl],
      [{ kind: 'tog', layer: 'num' }, LAYER_MODE.tog],
      [{ kind: 'to', layer: 'num' }, LAYER_MODE.to],
      [{ kind: 'auto_layer', layer: 'num' }, LAYER_MODE.auto_layer],
    ];
    for (const [b, mode] of cases) {
      const l = legend(c, b);
      expect(l.tap).toBe('Numb');
      expect(l.hold).toBe(mode);
      expect(l.holdIsMode).toBe(true);
      expect(l.layer).toBe('num');
      expect(l.layerIn).toBe('tap');
    }
  });

  it('gives a key that does something but has nothing to type a legend all the same', () => {
    // An adaptive key with no default shows its mark in the centre, and not again in the corner.
    const sturdy = compileLayout(bundledLayout('magic-sturdy')!);
    const magic = legend(sturdy, sturdy.layers[0].bindings[sturdy.keyIndex.get('RTI')!]);
    expect([magic.tap, magic.badge]).toEqual([BADGE.adaptive, null]);
    expect(legendText(magic)).toBe(BADGE.adaptive);
    const nordrassil = compileLayout(bundledLayout('nordrassil')!);
    for (const arcane of ['L0', 'R0']) {
      const l = legend(nordrassil, nordrassil.layers[0].bindings[nordrassil.keyIndex.get(arcane)!]);
      expect(l.tap).toBe(BADGE.adaptive);
    }
    // An empty tap dance says it is one. A behaviour of the layout's own, named before compiling
    // puts it in its place, is shown by that name.
    expect(tapLabel(c, { kind: 'tap_dance', bindings: [] })).toBe(BADGE.tapDance);
    expect(legend(c, { kind: 'tap_dance', bindings: [] }).badge).toBeNull();
    expect(tapLabel(c, { kind: 'ref', ref: 'magicShift' })).toBe('magicShift');
    // A key that types its own mark keeps the mark in the corner: only an empty one drops it.
    const typesMark = (symbol: string): Binding => ({ kind: 'kp', symbol });
    const marked: [Binding, string][] = [
      [{ kind: 'adaptive', default: typesMark(BADGE.adaptive) }, BADGE.adaptive],
      [{ kind: 'tap_dance', bindings: [typesMark(BADGE.tapDance)] }, BADGE.tapDance],
      [{ kind: 'macro', symbols: BADGE.macro }, BADGE.macro],
      [{ kind: 'unicode', symbol: BADGE.unicode }, BADGE.unicode],
    ];
    for (const [b, mark] of marked)
      expect([legend(c, b).tap, legend(c, b).badge]).toEqual([mark, mark]);
    // An empty chooser inside a marked one leaves the outer mark in the corner.
    const emptyDance: Binding = { kind: 'tap_dance', bindings: [] };
    const emptyMagic: Binding = { kind: 'adaptive' };
    const nested = legend(c, { kind: 'adaptive', default: emptyDance });
    expect([nested.tap, nested.badge]).toEqual([BADGE.tapDance, BADGE.adaptive]);
    const inverse = legend(c, { kind: 'tap_dance', bindings: [emptyMagic] });
    expect([inverse.tap, inverse.badge]).toEqual([BADGE.adaptive, BADGE.tapDance]);
    // A tap-hold around an empty one is not marked, so the mark still goes.
    const held = legend(c, {
      kind: 'hold_tap',
      tap: emptyMagic,
      hold: { kind: 'mod', mod: 'LSHIFT' },
    });
    expect([held.tap, held.badge]).toEqual([BADGE.adaptive, null]);
    // Nothing still shows nothing.
    expect(tapLabel(c, { kind: 'none' })).toBe('');
  });

  it('draws a hold of several modifiers with each of them, and says each', () => {
    const b: Binding = {
      kind: 'hold_tap',
      tap: { kind: 'kp', symbol: 'f' },
      hold: { kind: 'mod', mod: 'LGUI', also: ['LSHIFT'] },
    };
    expect(legendText(legend(c, b))).toBe('f / ⇧⌘');
    expect(describe(c, b)).toBe('tap: types f; hold: holds left Command and left Shift');
  });

  it('draws a layer tap as its tap, with the layer as what a hold does', () => {
    const l = legend(c, { kind: 'lt', layer: 'num', tap: { kind: 'kp', symbol: 'a' } });
    expect([l.tap, l.hold, l.holdIsMode, l.layerIn]).toEqual(['a', 'Numb', false, 'hold']);
    expect(legendText(l)).toBe('a / Numb');
  });

  it('never reads a layer called like a mode as a mode', () => {
    // `holdIsMode` comes from the kind of key, not from the text drawn.
    const l = legend(c, { kind: 'lt', layer: 'num', tap: { kind: 'kp', symbol: 'a' } });
    expect(l.holdIsMode).toBe(false);
  });

  it('shows an adaptive key by its default, marked, rather than by every alternative', () => {
    const adaptiveLegend = legend(c, at('RBI'));
    expect(adaptiveLegend.tap).toBe('h');
    expect(adaptiveLegend.badge).toBe(BADGE.adaptive);
    expect(adaptiveLegend.detail).toMatch(/^adaptive: types h; after a e i/);
  });

  it('describes alt repeat once, its tagged branches included', () => {
    const d = legend(c, at('L1')).detail;
    expect(d.match(/adaptive:/g)).toHaveLength(1);
    expect(d).toContain('repeats the previous key');
    // A tag is a condition on the previous press, said as one rather than listed as a symbol.
    expect(d).toContain('a key tagged alpha2');
    expect(d).not.toContain('#');
  });

  it('spells a macro out step by step', () => {
    const b: Binding = {
      kind: 'macro',
      steps: [
        { kind: 'kp', symbol: ' ' },
        { kind: 'sk', mod: 'LSHIFT' },
      ],
    };
    expect(describe(c, b)).toBe('types a space, then left Shift for the next key (one-shot)');
  });

  it('reads the letters a macro types one by one as the text they make', () => {
    const b: Binding = {
      kind: 'macro',
      steps: [
        { kind: 'kp', symbol: 'ã' },
        { kind: 'kp', symbol: 'o' },
        { kind: 'sk', mod: 'LSHIFT' },
        { kind: 'kp', symbol: 'x' },
      ],
    };
    expect(describe(c, b)).toBe(
      'types ão, then left Shift for the next key (one-shot), then types x',
    );
  });

  it('says which modifiers change a morph, naming both shifts as Shift', () => {
    const morph = (mods: Mod[]): Binding => ({
      kind: 'mod_morph',
      mods,
      default: { kind: 'kp', symbol: ',' },
      morphed: { kind: 'kp', symbol: ';' },
    });
    expect(describe(c, morph(['LSHIFT', 'RSHIFT']))).toBe('types ,; with Shift: types ;');
    expect(describe(c, morph(['RCTRL']))).toBe('types ,; with right Control: types ;');
    expect(describe(c, morph(['LSHIFT', 'LGUI']))).toBe(
      'types ,; with left Shift or left Command: types ;',
    );
  });

  it('shows what shift types only when it is not the capital', () => {
    expect(legend(c, { kind: 'kp', symbol: 'a', shifted: 'A' }).shifted).toBeNull();
    expect(legend(c, { kind: 'kp', symbol: ',', shifted: ';' }).shifted).toBe(';');
  });

  it('draws a dead key as its spacing accent, which every font has, and marks it dead', () => {
    for (const accent of ['´', '`', '^', '~', '¨', '˘', '¸', '˚']) {
      const l = legend(c, { kind: 'dead_key', diacritic: accent });
      expect(l.tap).toBe(accent);
      expect(l.dead).toBe(true);
      // No combining mark, which a phone's fallback font draws as a box.
      expect(l.tap).not.toMatch(/[\u0300-\u036f\u25cc]/);
    }
    expect(legend(c, { kind: 'kp', symbol: '´' }).dead).toBe(false);
  });

  it('draws a dead key’s shifted accent at the top, as a shifted symbol is', () => {
    const l = legend(c, { kind: 'dead_key', diacritic: '´', shifted: '¨' });
    expect([l.tap, l.shifted]).toEqual(['´', '¨']);
    expect(l.detail).toBe('dead key ´, ¨ with shift: accents the next letter');
  });

  it('marks a dead key under a hold as dead, as its centre is', () => {
    const l = legend(c, {
      kind: 'hold_tap',
      hold: { kind: 'mod', mod: 'LSHIFT' },
      tap: { kind: 'dead_key', diacritic: '~' },
    });
    expect([l.tap, l.dead]).toEqual(['~', true]);
  });

  it('keeps an imported key’s own legend, and says it is not simulated', () => {
    const l = legend(c, { kind: 'raw', label: 'BT1', source: '&bt BT_SEL 1' });
    expect([l.tap, l.kind]).toEqual(['BT1', 'raw']);
    expect(l.detail).toContain('not simulated');
  });
});

suite("a key's legend is read off its Plain part, past either kind of morph", () => {
  const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });
  const byLayer = (inactive: Binding): Binding => ({
    kind: 'layer_morph',
    layers: ['alpha2'],
    inactive,
    active: kp('z'),
  });
  const byShift = (plain: Binding): Binding => ({
    kind: 'mod_morph',
    mods: ['LSHIFT', 'RSHIFT'],
    default: plain,
    morphed: kp('z'),
  });

  it('draws the hold of a tap-hold inside a layer morph, as inside a mod morph', () => {
    const tapHold: Binding = {
      kind: 'hold_tap',
      tap: kp('a'),
      hold: { kind: 'mod', mod: 'LCTRL' },
    };
    expect(legend(c, byLayer(tapHold)).hold).toBe(legend(c, tapHold).hold);
    expect(legend(c, byShift(tapHold)).hold).toBe(legend(c, tapHold).hold);
  });

  it('marks a macro inside a morph as a macro', () => {
    const macro: Binding = { kind: 'macro', symbols: 'qu' };
    expect(legend(c, byLayer(macro)).badge).toBe(BADGE.macro);
    expect(legend(c, byShift(macro)).badge).toBe(BADGE.macro);
  });

  it('draws a sticky key inside a morph the way it draws a sticky key', () => {
    const sticky: Binding = { kind: 'sk', mod: 'LSHIFT' };
    for (const key of [byLayer(sticky), byShift(sticky)]) {
      const l = legend(c, key);
      expect(l.hold).toBe(LAYER_MODE.sl);
      expect(l.holdIsMode).toBe(true);
    }
  });
});
