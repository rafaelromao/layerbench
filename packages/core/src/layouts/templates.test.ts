import { describe, expect, it } from 'vitest';
import { GEOMETRY_PRESET_IDS, getGeometryPreset } from '../geometry/presets.js';
import { layoutLanguageCoverage, producibleSymbols } from '../lang/coverage.js';
import { LANGUAGE_PROFILES } from '../lang/profiles.js';
import { layoutCategory } from '../layout/categories.js';
import { compileLayout } from '../layout/compile.js';
import type { Binding, Layout } from '../layout/types.js';
import { reachKeys } from '../sim/activators.js';
import { explain } from '../sim/resolver.js';
import { CLASSIC_LAYOUTS } from './classic.js';
import { BUNDLED_LAYOUTS, bundledLayout, SMALL_LAYOUTS } from './index.js';
import { magicRomak } from './romak.js';
import {
  ACCENTS,
  accentsCombo,
  accentsComboKeys,
  DEFAULT_LAYER_ID_LIST,
  defaultAccentMacros,
  defaultDeadKeys,
  defaultLayerSymbols,
  defaultLayers,
  EXTRAS_CONDITION,
  EXTRAS_CORE,
  mirrorKeyId,
  NUMBERS_CORE,
  NUMBERS_OUTER,
  SYMBOLS_CORE,
  SYMBOLS_OUTER,
  vowelsOnLeft,
  withDefaultLayers,
} from './templates.js';

/** The chord that one-shots Accents, as `explain` names its step. */
const ACCENTS_COMBO = 'combo:accents';

/**
 * A base layer with the letters every accent composes with, on whatever keys the board has. A
 * Qwerty import would not do: the small boards drop half its letters.
 */
const BASE_LETTERS = [...'aeiouycn'];

function boardWithDefaults(preset: string, mirrorAccents = false): Layout {
  const geometry = getGeometryPreset(preset);
  const defaults = defaultLayers(geometry, { mirrorAccents });
  const free = geometry.keys.filter((k) => !k.thumb).map((k) => k.id);
  const letters: Record<string, Binding> = {};
  BASE_LETTERS.forEach((c, i) => {
    letters[free[i]] = { kind: 'kp', symbol: c };
  });
  return {
    format: 'layerbench/layout@1',
    name: `Defaults on ${preset}`,
    hostLocale: 'symbols',
    geometry: { preset },
    keys: { space: defaults.spaceKey },
    layers: [{ id: 'base', bindings: { ...letters, ...defaults.base } }, ...defaults.layers],
    combos: [accentsCombo('base', geometry)],
    conditionalLayers: defaults.conditionalLayers,
  };
}

function trace(layout: Layout, text: string) {
  const r = explain(compileLayout(layout), text, { caseMode: 'fold', crossWord: 'reset' });
  return {
    ...r,
    keys: r.steps.filter((s) => s.kind !== 'hold_release').map((s) => s.key),
    out: r.steps.map((s) => s.symbols).join(''),
  };
}

describe('the default layers on every board', () => {
  for (const preset of GEOMETRY_PRESET_IDS) {
    describe(preset, () => {
      const layout = boardWithDefaults(preset);
      const compiled = compileLayout(layout);
      const producible = producibleSymbols(compiled);

      it("types every digit and symbol of the default layers, and German's letters", () => {
        const missing = [...'0123456789', ...defaultLayerSymbols(), ...'ßäöü'].filter(
          (c) => !producible.has(c),
        );
        expect(missing).toEqual([]);
      });

      it('writes all six languages', () => {
        for (const tag of Object.keys(LANGUAGE_PROFILES)) {
          const c = layoutLanguageCoverage(compiled, tag);
          expect([tag, c?.missingRequired, c?.missingOptional, c?.missingPunctuation]).toEqual([
            tag,
            [],
            [],
            [],
          ]);
        }
      });

      it('writes all six languages with Accents mirrored too', () => {
        const mirrored = compileLayout(boardWithDefaults(preset, true));
        for (const tag of Object.keys(LANGUAGE_PROFILES))
          expect([tag, layoutLanguageCoverage(mirrored, tag)?.missingRequired]).toEqual([tag, []]);
      });

      it('types an accent, a digit and a symbol through the analysis', () => {
        const t = trace(layout, 'ñ 7 % è');
        expect(t.out).toBe('ñ 7 % è');
        expect(t.coverage.unproducible.size).toBe(0);
      });
    });
  }
});

describe('the default layers, board by board', () => {
  it('reach Accents with three presses for an accent it has no key for: the combo, the accent, the letter', () => {
    const t = trace(boardWithDefaults('3x5+2'), 'û');
    expect(t.keys).toEqual([ACCENTS_COMBO, 'RBC', 'LTC']);
  });

  it('type the most frequent accented letters, ñ, ç and ß with a key each', () => {
    expect(trace(boardWithDefaults('3x5+2'), 'é ã ñ ç ß').keys).toEqual([
      ...[ACCENTS_COMBO, 'RHM', 'L0'],
      ...[ACCENTS_COMBO, 'LBI', 'L0'],
      ...[ACCENTS_COMBO, 'LHI', 'L0'],
      ...[ACCENTS_COMBO, 'LBM', 'L0'],
      ...[ACCENTS_COMBO, 'LTR'],
    ]);
    // With no bottom row ñ is on the right pinky's home key, and an accented letter is two presses.
    expect(trace(boardWithDefaults('1222+2'), 'ñ é').keys).toEqual([
      ...[ACCENTS_COMBO, 'RHP', 'L0'],
      ...[ACCENTS_COMBO, 'RHI', 'LTM'],
    ]);
  });

  it("carry the accented letters the corpora use most, German's among them, and qu", () => {
    expect(defaultAccentMacros().sort()).toEqual([...'éóáãàíèêúõùôòìâîäöü', 'qu'].sort());
  });

  it('hold only Symbols on the right inner thumb: nothing there taps Accents', () => {
    expect(defaultLayers(getGeometryPreset('3x5+2')).base.R0).toEqual({ kind: 'mo', layer: 'sym' });
  });

  it('put 0 on the right outer thumb, or on the inner one when there is none', () => {
    const zero = (preset: string) => {
      const num = defaultLayers(getGeometryPreset(preset)).layers[0].bindings;
      return Object.entries(num)
        .filter(([, b]) => JSON.stringify(b).includes('"0"'))
        .map(([id]) => id);
    };
    expect(zero('1333+2')).toEqual(['R1']);
    expect(zero('3x6+3')).toEqual(['R1']);
    expect(zero('13332+1')).toEqual(['R0']);
    expect(zero('ansi')).toEqual(['RTO']);
  });

  it('spread Numbers and Symbols over 34 keys, with no Extras on a board that has them all', () => {
    const d = defaultLayers(getGeometryPreset('3x5+2'));
    expect(d.layers.map((l) => l.id)).toEqual(['num', 'sym', 'accents']);
    expect(d.conditionalLayers).toEqual([]);
    const [num, sym] = d.layers;
    for (const [id, s] of Object.entries({ ...NUMBERS_CORE, ...NUMBERS_OUTER }))
      expect(num.bindings[id]).toEqual({ kind: 'kp', symbol: s });
    for (const [id, s] of Object.entries({ ...SYMBOLS_CORE, ...SYMBOLS_OUTER }))
      expect(sym.bindings[id]).toEqual({ kind: 'kp', symbol: s });
  });

  it('put on Extras what a board has no outer key for: symbols where Dead keys had them, accents beside their place', () => {
    const extras = (preset: string) =>
      defaultLayers(getGeometryPreset(preset)).layers.find((l) => l.id === 'extras')?.bindings;
    const kps = (table: Record<string, string>) =>
      Object.fromEntries(Object.entries(table).map(([id, s]) => [id, { kind: 'kp', symbol: s }]));
    const macro = (symbols: string): Binding => ({ kind: 'macro', symbols });
    const dead = (diacritic: string): Binding => ({ kind: 'dead_key', diacritic });
    // No outer keys at all: every symbol, and the ten accents past the 24 keys, two on the thumbs.
    expect(extras('1333+2')).toEqual({
      '*': { kind: 'trans' },
      ...kps(EXTRAS_CORE),
      ...{ LTR: dead('`'), LTI: { kind: 'kp', symbol: 'æ' }, LHI: dead('´'), LBI: dead('¨') },
      LHR: dead('~'),
      ...{ RHM: macro('ù'), RHR: macro('ì'), RBM: macro('ú'), L1: dead('^'), R1: macro('î') },
    });
    // No pinky bottom and no inner top: the symbols and the accents those keys had.
    expect(extras('23332+2')).toEqual({
      '*': { kind: 'trans' },
      ...kps({ LHP: 'ª', LHM: '£', LBR: '«', RTM: 'ı', LTI: 'æ' }),
      ...{ LBM: dead('¨'), RTI: macro('ù'), RBR: macro('î') },
    });
    expect(defaultLayers(getGeometryPreset('1333+2')).conditionalLayers).toEqual([
      EXTRAS_CONDITION,
    ]);
  });

  it('bring Extras on by holding Numbers, then Symbols from there', () => {
    const t = trace(boardWithDefaults('1333+2'), '€ 7');
    expect(t.out).toBe('€ 7');
    expect(t.keys).toEqual(['L0', 'R0', 'LTM', 'L0', 'L0', 'RTI']);
  });

  it('give a board with no bottom row Extras for what that row held', () => {
    const d = defaultLayers(getGeometryPreset('1222+2'));
    expect(d.layers.map((l) => l.id)).toEqual(['num', 'sym', 'extras', 'accents']);
    // Symbols' last mark on the left outer thumb, beside the one holding Numbers, and `ı` on the
    // right one, beside the one holding Symbols.
    expect(d.layers[1].bindings.L1).toEqual({ kind: 'kp', symbol: ';' });
    expect(d.layers[1].bindings.R1).toEqual({ kind: 'kp', symbol: 'ı' });
    const t = trace(boardWithDefaults('1222+2'), '[ * « 3 ; € §');
    expect(t.out).toBe('[ * « 3 ; € §');
  });

  it('hold Numbers on the space bar of a row-stagger board, and arm Symbols from there', () => {
    const d = defaultLayers(getGeometryPreset('ansi'));
    expect(Object.keys(d.base).sort()).toEqual(['L0', 'R0']);
    expect(d.layers[0].bindings.RHO).toEqual({ kind: 'sl', layer: 'sym' });
    expect(d.layers[0].bindings.RTO).toEqual({ kind: 'kp', symbol: '0' });
    // One space bar for both thumbs: Accents is the left ring and middle fingers' chord.
    expect(accentsComboKeys(getGeometryPreset('ansi'))).toEqual(['LHR', 'LHM']);
    const t = trace(boardWithDefaults('ansi'), 'ñ');
    expect(t.out).toBe('ñ');
    expect(t.keys).toEqual([ACCENTS_COMBO, 'LHI']);
  });

  it('carry each dead key the six languages need', () => {
    expect(defaultDeadKeys().sort()).toEqual(['^', '`', '~', '¨', '´'].sort());
  });

  it("put each of Symbols' outer marks on the row of its look-alike", () => {
    const keyOf = (s: string) => Object.entries(SYMBOLS_CORE).find(([, x]) => x === s)?.[0];
    for (const [mark, like] of [
      [';', ':'],
      ['¿', '?'],
      ['¡', '!'],
      ['«', '<'],
      ['»', '>'],
    ]) {
      const id = Object.entries(SYMBOLS_OUTER).find(([, x]) => x === mark)?.[0] ?? '';
      expect([mark, id.slice(0, 2)]).toEqual([mark, keyOf(like)?.slice(0, 2)]);
    }
  });

  it('type the accents on a board with no bottom row too', () => {
    expect(trace(boardWithDefaults('1222+2'), 'ã é ê ü').out).toBe('ã é ê ü');
  });
});

/** What a key of Accents types, or the accent it is the dead key of. */
function typedBy(b: Binding | undefined): string {
  if (b?.kind === 'dead_key') return b.diacritic ?? '';
  if (b?.kind === 'macro') return b.symbols ?? '';
  return b?.kind === 'kp' ? (b.symbol ?? '') : '';
}

/** A row of Accents as drawn: the left hand pinky to inner, or the right hand inner to pinky. */
function accentsRow(row: string, hand: 'L' | 'R'): string[] {
  const columns = hand === 'L' ? 'PRMIC' : 'CIMRP';
  return [...columns].map((c) => typedBy(ACCENTS[`${hand}${row}${c}`]));
}

describe('Accents, on the 30 main keys in groups to remember', () => {
  it('fills all 30 keys, and nothing past them', () => {
    expect(Object.keys(ACCENTS)).toHaveLength(30);
    for (const id of Object.keys(ACCENTS)) expect(id).toMatch(/^[LR][THB][PRMIC]$/);
  });

  it('types the accented vowels with the right hand: a row per accent, a column per vowel', () => {
    // Inner column out: u a e o i. Grave on top, acute on home, circumflex below, `^` where `û` is.
    expect(accentsRow('T', 'R')).toEqual([...'ùàèòì']);
    expect(accentsRow('H', 'R')).toEqual([...'úáéóí']);
    expect(accentsRow('B', 'R')).toEqual(['^', ...'âêôî']);
  });

  it("has German's letters, the tilde's and the ligatures in a row each on the left", () => {
    expect(accentsRow('T', 'L')).toEqual(['`', 'ß', 'qu', 'œ', 'æ']);
    expect(accentsRow('H', 'L')).toEqual([...'öäüñ', '´']);
    expect(accentsRow('B', 'L')).toEqual(['¨', ...'õçã', '~']);
  });
});

describe('Accents mirrored for a layout that types its vowels with the left hand', () => {
  const vowelsLeft = ['dvorak', 'engram', 'enthium', 'nordrassil', 'uno'];

  it('counts the vowels each hand types on the base layer, a thumb tap among them', () => {
    const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });
    expect(vowelsOnLeft({ LHP: kp('a'), LTM: kp('e'), RTI: kp('i') })).toBe(true);
    expect(vowelsOnLeft({ LHP: kp('a'), RTI: kp('i'), RTR: kp('o') })).toBe(false);
    expect(
      vowelsOnLeft({
        LHP: kp('a'),
        R0: { kind: 'hold_tap', tap: kp('e'), hold: { kind: 'mo', layer: 'sym' } },
      }),
    ).toBe(false);
  });

  for (const layout of BUNDLED_LAYOUTS) {
    const left = vowelsLeft.includes(layout.id ?? '');
    it(`${layout.name}: ${left ? 'mirrored' : 'as drawn'}`, () => {
      const preset = 'preset' in layout.geometry ? layout.geometry.preset : '';
      const accents = layout.layers.find((l) => l.id === 'accents')?.bindings ?? {};
      const defaults = defaultLayers(getGeometryPreset(preset), { mirrorAccents: left });
      expect(vowelsOnLeft(layout.layers[0].bindings)).toBe(left);
      expect(accents).toEqual(defaults.layers.find((l) => l.id === 'accents')?.bindings);
    });
  }

  it('mirrors key for key, and the keys it puts on Extras with it', () => {
    const geometry = getGeometryPreset('23332+2');
    const layer = (mirror: boolean, id: string) =>
      defaultLayers(geometry, { mirrorAccents: mirror }).layers.find((l) => l.id === id)
        ?.bindings ?? {};
    for (const [id, b] of Object.entries(layer(false, 'accents')))
      expect([id, layer(true, 'accents')[mirrorKeyId(id)]]).toEqual([id, b]);
    const onExtras = (mirror: boolean) =>
      Object.values(layer(mirror, 'extras'))
        .map(typedBy)
        .filter((s) => !Object.values(EXTRAS_CORE).includes(s) && s !== '')
        .sort();
    // The board lacks the same keys on both hands, so mirrored the same accents are past it.
    expect(onExtras(true)).toEqual(onExtras(false));
  });
});

describe('Accents keys a board lacks are on Extras', () => {
  it('on a thumb free while Numbers and Symbols are held, whichever thumbs hold them', () => {
    // A Special layout on the 24 keys with space, and so Numbers, on the left outer thumb.
    const geometry = getGeometryPreset('1333+2');
    const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });
    const free = geometry.keys.filter((k) => !k.thumb).map((k) => k.id);
    const letters = Object.fromEntries(BASE_LETTERS.map((c, i) => [free[i], kp(c)]));
    const layout = withDefaultLayers(
      {
        format: 'layerbench/layout@1',
        name: 'Space on L1',
        hostLocale: 'symbols',
        geometry: { preset: '1333+2' },
        keys: { space: 'L1' },
        layers: [{ id: 'base', bindings: { ...letters, L1: kp(' ') } }],
      },
      geometry,
    );
    const extras = layout.layers.find((l) => l.id === 'extras')?.bindings ?? {};
    const base = layout.layers[0].bindings;
    const held = ['L1', 'L0', 'R0', 'R1'].filter((id) => {
      const b = base[id];
      return b?.kind === 'mo' || (b?.kind === 'hold_tap' && b.hold.kind === 'mo');
    });
    expect(held).toContain('L1');
    for (const id of held) expect([id, extras[id]]).toEqual([id, undefined]);
    // `^` and `î`, which no finger key of Extras has room for, are still there, on the free thumbs.
    const onThumbs = Object.entries(extras)
      .filter(([id]) => /\d/.test(id))
      .map(([, b]) => typedBy(b))
      .sort();
    expect(onThumbs).toEqual(['^', 'î'].sort());
    const compiled = compileLayout(layout);
    for (const tag of Object.keys(LANGUAGE_PROFILES))
      expect([tag, layoutLanguageCoverage(compiled, tag)?.missingRequired]).toEqual([tag, []]);
    expect(trace(layout, 'û î').out).toBe('û î');
  });

  for (const preset of GEOMETRY_PRESET_IDS) {
    const geometry = getGeometryPreset(preset);
    if (geometry.family === 'rowstagger') continue;
    it(`${preset}: every key of Accents is on Accents or on Extras`, () => {
      const d = defaultLayers(geometry);
      const layer = (id: string) => d.layers.find((l) => l.id === id)?.bindings ?? {};
      const noBottom = !geometry.keys.some((k) => k.id === 'LBI');
      if (noBottom) return;
      const typed = new Set(
        [...Object.values(layer('accents')), ...Object.values(layer('extras'))].map(typedBy),
      );
      expect(
        Object.values(ACCENTS)
          .map(typedBy)
          .filter((s) => !typed.has(s)),
      ).toEqual([]);
    });
  }
});

describe("Magic Romak's layers are the defaults on its board", () => {
  const layer = (id: string) => magicRomak.layers.find((l) => l.id === id)?.bindings ?? {};
  const typed = (b: Binding | undefined): string | undefined =>
    b?.kind === 'kp' ? b.symbol : b?.kind === 'hold_tap' ? typed(b.tap) : undefined;

  it('Numbers and Symbols type what the core tables say', () => {
    for (const [id, s] of Object.entries(NUMBERS_CORE)) expect(typed(layer('num')[id])).toBe(s);
    for (const [id, s] of Object.entries(SYMBOLS_CORE)) expect(typed(layer('sym')[id])).toBe(s);
  });

  it('Accents and Extras are the default layers, Accents reached from Alpha 2', () => {
    const defaults = defaultLayers(getGeometryPreset('1333+2')).layers;
    for (const id of ['accents', 'extras'])
      expect(layer(id)).toEqual(defaults.find((l) => l.id === id)?.bindings);
    expect(magicRomak.conditionalLayers).toEqual([EXTRAS_CONDITION]);
    expect(layer('alpha2').R1).toEqual({ kind: 'sl', layer: 'accents' });
    expect(magicRomak.combos?.some((c) => c.id === 'accents')).toBe(false);
    // An accent is still a combo on Alpha 2; £ is on Extras, Numbers and Symbols held.
    const t = trace(magicRomak, 'ñ è £');
    expect(t.out).toBe('ñ è £');
    expect(t.keys).toEqual([
      ...['R0', 'combo:tilde', 'LHR', 'L0'],
      ...['R0', 'combo:grave', 'RHR', 'L0'],
      ...['L0', 'R0', 'LHM'],
    ]);
  });
});

describe('Romak types every accent through Accents, one-shot from its right outer thumb', () => {
  const romak = bundledLayout('romak') as Layout;

  it('has one alpha layer and the default layers, and no combos', () => {
    expect(romak.layers.map((l) => l.id)).toEqual(['alpha1', 'num', 'sym', 'accents']);
    expect(romak.combos).toBeUndefined();
    expect(romak.behaviors).toBeUndefined();
  });

  it('writes the six languages: ñ ü and œ on Accents, ¿ and ¡ on Symbols', () => {
    const t = trace(romak, 'ñ ü ¿ ¡ œ');
    expect(t.out).toBe('ñ ü ¿ ¡ œ');
    expect(t.keys).toEqual([
      ...['R1', 'LHI', 'L0'],
      ...['R1', 'LHM', 'L0'],
      // Symbols held through the space between them, which it types too.
      ...['R0', 'RHC', 'L0', 'RBC', 'L0'],
      ...['R1', 'LTI'],
    ]);
    const compiled = compileLayout(romak);
    for (const tag of Object.keys(LANGUAGE_PROFILES)) {
      expect([tag, layoutLanguageCoverage(compiled, tag)?.missingRequired]).toEqual([tag, []]);
    }
  });
});

describe("Magic Romak types `;` as the keymap's combo", () => {
  it('RBM and RBR together, on Alpha 1 and on Numbers', () => {
    expect(magicRomak.combos?.find((c) => c.id === 'semicolon')).toMatchObject({
      keys: ['RBM', 'RBR'],
      binding: { kind: 'kp', symbol: ';' },
      layers: ['alpha1', 'num'],
      role: 'typing',
    });
    // Numbers held for the digits, the combo between them.
    const t = trace(magicRomak, '7;8');
    expect(t.out).toBe('7;8');
    expect(t.keys).toEqual(['L0', 'RTI', 'combo:semicolon', 'RTM']);
  });

  it('the combo, where it had to go through Dead keys', () => {
    expect(trace(magicRomak, ';').keys).toEqual(['combo:semicolon']);
  });
});

describe('the default layers on every bundled layout', () => {
  const before = new Map([...CLASSIC_LAYOUTS, ...SMALL_LAYOUTS].map((l) => [l.id, l]));

  for (const layout of BUNDLED_LAYOUTS) {
    describe(layout.name, () => {
      const compiled = compileLayout(layout);
      const producible = producibleSymbols(compiled);

      it('has Accents, Numbers and Symbols, and Extras only where the board needs it', () => {
        const ids = layout.layers
          .map((l) => l.id)
          .filter((id) => DEFAULT_LAYER_ID_LIST.includes(id));
        const preset = 'preset' in layout.geometry ? layout.geometry.preset : '';
        const extras = defaultLayers(getGeometryPreset(preset)).layers.some(
          (l) => l.id === 'extras',
        );
        expect(ids).toEqual(['num', 'sym', ...(extras ? ['extras'] : []), 'accents']);
        expect(layout.layers.some((l) => ['dead', 'sym2'].includes(l.id))).toBe(false);
      });

      it("types every digit and symbol of the default layers, and German's letters", () => {
        const missing = [...'0123456789', ...defaultLayerSymbols(), ...'ßäöü'].filter(
          (c) => !producible.has(c),
        );
        expect(missing).toEqual([]);
      });

      it('writes all six languages, every letter and mark', () => {
        for (const tag of Object.keys(LANGUAGE_PROFILES)) {
          const c = layoutLanguageCoverage(compiled, tag);
          expect([tag, c?.missingRequired, c?.missingOptional, c?.missingPunctuation]).toEqual([
            tag,
            [],
            [],
            [],
          ]);
        }
      });

      const original = layout.id ? before.get(layout.id) : undefined;
      if (original && layoutCategory(original) !== 'special') {
        it('reaches Accents by its right outer thumb on its base layer, and nothing else', () => {
          const base = layout.layers[0].id;
          expect(layout.combos?.some((c) => c.id === 'accents') ?? false).toBe(false);
          const accents = compiled.layerIndex.get('accents') as number;
          const reach = reachKeys(compiled, accents).map((k) => ({
            key: compiled.keys[k.pos].id,
            from: k.routes.map((r) => compiled.layers[r.via].id),
          }));
          expect(reach).toEqual([{ key: 'R1', from: [base] }]);
        });
      }
      if (original && layoutCategory(original) === 'special') {
        it('reaches Accents by two thumbs pressed together on its base layer, and nothing else', () => {
          const base = layout.layers[0].id;
          const preset = 'preset' in layout.geometry ? layout.geometry.preset : '';
          const geometry = getGeometryPreset(preset);
          const [left, right] = accentsComboKeys(geometry);
          expect(layout.combos).toContainEqual(accentsCombo(base, geometry));
          // The outer main thumbs, or the inner ones on a board with one thumb a hand.
          expect([left, right]).toEqual(
            geometry.keys.some((k) => k.id === 'L1') ? ['L1', 'R1'] : ['L0', 'R0'],
          );
          const accents = compiled.layerIndex.get('accents') as number;
          const reach = reachKeys(compiled, accents)
            .map((k) => ({
              key: compiled.keys[k.pos].id,
              from: k.routes.map((r) => compiled.layers[r.via].id),
            }))
            .sort((a, b) => a.key.localeCompare(b.key));
          expect(reach).toEqual([
            { key: left, from: [base] },
            { key: right, from: [base] },
          ]);
        });

        it('keeps every key it had, a thumb holding a layer still typing what it typed', () => {
          const base = layout.layers[0].bindings;
          for (const [id, b] of Object.entries(original.layers[0].bindings)) {
            const now = base[id];
            expect([id, now?.kind === 'hold_tap' ? now.tap : now]).toEqual([id, b]);
          }
          expect(layout.layers.slice(0, original.layers.length)).toEqual([
            { ...original.layers[0], bindings: base },
            ...original.layers.slice(1),
          ]);
        });
      }
    });
  }
});

describe('the default layers, layout by layout', () => {
  const base = (id: string) => bundledLayout(id)?.layers[0].bindings ?? {};
  const num = (id: string) => bundledLayout(id)?.layers.find((l) => l.id === 'num')?.bindings ?? {};
  const holds = (layer: string, tap: Binding) => ({
    kind: 'hold_tap',
    tap,
    hold: { kind: 'mo', layer },
  });
  const space: Binding = { kind: 'kp', symbol: ' ' };
  const holdSymbols: Binding = { kind: 'mo', layer: 'sym' };

  it('hold Numbers on the space key and Symbols on the inner thumb of the other hand', () => {
    expect(base('qwerty').L0).toEqual(holds('num', space));
    expect(base('qwerty').R0).toEqual(holdSymbols);
    expect(num('qwerty').R0).toEqual(holds('sym', space));
    expect(num('qwerty').R1).toEqual({ kind: 'kp', symbol: '0' });
  });

  it('take the innermost free thumb for Symbols, past one with a letter', () => {
    expect(base('nordrassil').R1).toEqual({ kind: 'kp', symbol: 't' });
    expect(base('nordrassil').R2).toEqual(holdSymbols);
  });

  it('type on Symbols what the Numbers thumb taps, where it does not tap space', () => {
    const sym = bundledLayout('hands-down-gold')?.layers.find((l) => l.id === 'sym')?.bindings;
    expect(sym?.L0).toBeUndefined();
    const t = trace(bundledLayout('hands-down-gold') as Layout, 'at% t');
    expect(t.out).toBe('at% t');
  });

  it('hold Symbols on a thumb that types where every thumb does, and keep 0 by the keypad', () => {
    expect(base('finch').R0).toEqual(holds('sym', { kind: 'kp', symbol: 'e' }));
    expect(num('finch').R0).toEqual(holds('sym', space));
    expect(num('finch').RBC).toEqual({ kind: 'kp', symbol: '0' });
    const t = trace(bundledLayout('finch') as Layout, 'ñ');
    expect(t.out).toBe('ñ');
    expect(t.keys).toEqual([ACCENTS_COMBO, 'LHI']);
  });

  it('hold Numbers on the left inner thumb when no thumb types space', () => {
    expect(base('uno').L0).toEqual(holds('num', { kind: 'kp', symbol: 'a' }));
    expect(base('uno').R0).toEqual(holds('sym', { kind: 'kp', symbol: 'r' }));
  });
});
