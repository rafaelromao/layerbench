import { describe, expect, it } from 'vitest';
import { GEOMETRY_PRESET_IDS, getGeometryPreset } from '../geometry/presets.js';
import { layoutLanguageCoverage, producibleSymbols } from '../lang/coverage.js';
import { LANGUAGE_PROFILES } from '../lang/profiles.js';
import { layoutCategory } from '../layout/categories.js';
import { compileLayout } from '../layout/compile.js';
import type { Binding, Layout } from '../layout/types.js';
import { blockedThumbs, reachKeys } from '../sim/activators.js';
import { explain } from '../sim/resolver.js';
import { CLASSIC_DEFS, CLASSIC_LAYOUTS } from './classic.js';
import {
  BUNDLED_LAYOUTS,
  bundledLayout,
  DOCUMENT_LAYOUTS,
  SMALL_DEFS,
  SMALL_LAYOUTS,
} from './index.js';
import {
  ACCENTS,
  accentsCombo,
  accentsComboKeys,
  CORE_SPLIT_PAIRS,
  DEFAULT_LAYER_ID_LIST,
  defaultAccentMacros,
  defaultDeadKeys,
  defaultLayerSymbols,
  defaultLayers,
  EXTRAS_CONDITION,
  EXTRAS_ORDER,
  HOME_ROW_MODS,
  mirrorKeyId,
  NUMBERS_CORE,
  NUMBERS_OUTER,
  primeKeys,
  SYMBOL_PAIRS,
  SYMBOLS_CORE,
  SYMBOLS_OUTER,
  vowelsOnLeft,
  withDefaultLayers,
  withHomeRowMods,
} from './templates.js';

const magicRomak = bundledLayout('magic-romak')!;

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

  it('put on Extras what a board has no key for: pairs whole and the rest on the prime keys, accents beside their place', () => {
    const extras = (preset: string) =>
      defaultLayers(getGeometryPreset(preset)).layers.find((l) => l.id === 'extras')?.bindings;
    const kps = (table: Record<string, string>) =>
      Object.fromEntries(Object.entries(table).map(([id, s]) => [id, { kind: 'kp', symbol: s }]));
    const macro = (symbols: string): Binding => ({ kind: 'macro', symbols });
    const dead = (diacritic: string): Binding => ({ kind: 'dead_key', diacritic });
    // No outer keys at all: the four pairs on the home rows, `: ;` on the cheapest two, the symbols
    // on their own on the next cheapest, and eight of the ten accents past the 24 keys. Extras' thumbs
    // are both holding: `^` and `î`, with no finger key left, are on Accents' right thumbs.
    expect(extras('1333+2')).toEqual({
      '*': { kind: 'trans' },
      ...kps({ RHI: ':', RHM: ';', LHM: '«', LHI: '»', RHR: '¿', RHP: '?', LHP: '¡', LHR: '!' }),
      ...kps({ RTM: '£', LTM: 'ª', RBI: 'ı', LBI: '§', LTI: 'æ' }),
      ...{ LTR: dead('`'), LBM: dead('´'), LBR: dead('¨'), RBM: dead('~') },
      ...{ RTI: macro('ù'), RTR: macro('ì'), RBR: macro('ú') },
    });
    const accents = defaultLayers(getGeometryPreset('1333+2')).layers.find(
      (l) => l.id === 'accents',
    )?.bindings;
    expect([accents?.R0, accents?.R1]).toEqual([dead('^'), macro('î')]);
    // No pinky bottom and no inner top: `«` and `»`, and the symbols and the accents those keys had.
    expect(extras('23332+2')).toEqual({
      '*': { kind: 'trans' },
      ...kps({ RHI: '«', RHM: '»', RHR: 'ª', LHI: 'ı', LTI: 'æ' }),
      ...{ LBR: dead('¨'), RTI: macro('ù'), RBR: macro('î') },
    });
    expect(defaultLayers(getGeometryPreset('1333+2')).conditionalLayers).toEqual([
      EXTRAS_CONDITION,
    ]);
  });

  it('give a key a pair left on Symbols to the most used symbol with no key of its own', () => {
    const sym = defaultLayers(getGeometryPreset('1333+2')).layers[1].bindings;
    // `?`, `!` and `:` went to Extras with `¿`, `¡` and `;`.
    expect([sym.RHI, sym.RBI, sym.RTR]).toEqual([...'€°º'].map((s) => ({ kind: 'kp', symbol: s })));
  });

  it('bring Extras on by holding Numbers, then Symbols from there', () => {
    const t = trace(boardWithDefaults('1333+2'), '£ 7');
    expect(t.out).toBe('£ 7');
    expect(t.keys).toEqual(['L0', 'R0', 'RTM', 'L0', 'L0', 'RTI']);
  });

  it('bring Extras on by holding Symbols, then Numbers from there, too', () => {
    // The condition names Symbols first, so that is the order pressed: L0 holds Numbers on Symbols.
    const layout = boardWithDefaults('1333+2');
    const symbolsFirst = { ...layout, conditionalLayers: [{ if: ['sym', 'num'], then: 'extras' }] };
    const t = trace(symbolsFirst, '£');
    expect(t.out).toBe('£');
    expect(t.keys).toEqual(['R0', 'L0', 'RTM']);
  });

  const withExtras = GEOMETRY_PRESET_IDS.filter(
    (preset) =>
      getGeometryPreset(preset).family !== 'rowstagger' &&
      boardWithDefaults(preset).layers.some((l) => l.id === 'extras'),
  );

  it('have boards with Extras to bring on by both inner thumbs', () => {
    expect(withExtras.length).toBeGreaterThan(0);
  });

  for (const preset of withExtras) {
    const layout = boardWithDefaults(preset);
    const extras = layout.layers.find((l) => l.id === 'extras')?.bindings ?? {};
    it(`${preset}: bring Extras on by holding both inner thumbs, in either order`, () => {
      // A symbol only Extras has, typed with each layer held first.
      const [key, binding] = Object.entries(extras).find(([, b]) => b.kind === 'kp') ?? [];
      const symbol = binding?.kind === 'kp' ? (binding.symbol ?? '') : '';
      for (const [order, first] of [
        [['num', 'sym'], 'L0'],
        [['sym', 'num'], 'R0'],
      ] as const) {
        const t = trace(
          { ...layout, conditionalLayers: [{ if: [...order], then: 'extras' }] },
          symbol,
        );
        expect([order, t.out, t.keys]).toEqual([
          order,
          symbol,
          [first, first === 'L0' ? 'R0' : 'L0', key],
        ]);
      }
    });
  }

  it('give a board with no bottom row Extras for what that row held', () => {
    const d = defaultLayers(getGeometryPreset('1222+2'));
    expect(d.layers.map((l) => l.id)).toEqual(['num', 'sym', 'extras', 'accents']);
    // `;` beside `:` where `=` was. The left thumbs are free on Symbols, the right one holding it:
    // `=` on the space key, which holds Numbers there too, and `ı` beside it, every finger key of the
    // four layers being taken.
    expect(d.layers[1].bindings.RTM).toEqual({ kind: 'kp', symbol: ';' });
    expect(d.layers[1].bindings.L0).toEqual({
      kind: 'hold_tap',
      tap: { kind: 'kp', symbol: '=' },
      hold: { kind: 'mo', layer: 'num' },
    });
    expect(d.layers[1].bindings.L1).toEqual({ kind: 'kp', symbol: 'ı' });
    expect(d.layers[1].bindings.R1).toBeUndefined();
    // What has no room on Extras is on Accents.
    const t = trace(boardWithDefaults('1222+2'), '[ * « 3 ; € § ¿ = | ı º £');
    expect(t.out).toBe('[ * « 3 ; € § ¿ = | ı º £');
    expect(t.coverage.unproducible.size).toBe(0);
    // A Special layout there, Ben Vallack Piano, its space on L1 and Numbers on the inner L0, as on
    // the defaults: `=` on Symbols' L0, holding Numbers, `ı` on L1 beside it, the right ones blocked,
    // one holding Symbols.
    const piano = bundledLayout('ben-vallack-piano') as Layout;
    const sym = piano.layers.find((l) => l.id === 'sym')?.bindings ?? {};
    expect([sym.L0, sym.L1, sym.R1]).toEqual([
      d.layers[1].bindings.L0,
      { kind: 'kp', symbol: 'ı' },
      undefined,
    ]);
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

  it("put each of Symbols' outer marks beside its look-alike, and « beside »", () => {
    const keyOf = (s: string) => Object.entries(SYMBOLS_CORE).find(([, x]) => x === s)?.[0];
    const outer = (s: string) => Object.entries(SYMBOLS_OUTER).find(([, x]) => x === s)?.[0];
    const g = getGeometryPreset('3x5+2');
    for (const [mark, like] of [
      [';', ':'],
      ['¿', '?'],
      ['¡', '!'],
    ])
      expect([mark, sideBySide(g, outer(mark) ?? '', keyOf(like) ?? '')]).toEqual([mark, true]);
    expect(sideBySide(g, outer('«') ?? '', outer('»') ?? '')).toBe(true);
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

  // Magic Romak has no Accents. A document the list does not name, as one a Library request adds,
  // carries its own Accents in its JSON: it is held to the rule alone.
  const documents = new Set(DOCUMENT_LAYOUTS.map((l) => l.id));
  for (const layout of BUNDLED_LAYOUTS.filter((l) => l.id !== 'magic-romak')) {
    const id = layout.id ?? '';
    const left =
      vowelsLeft.includes(id) || (documents.has(id) && vowelsOnLeft(layout.layers[0].bindings));
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
        .filter((s) => !EXTRAS_ORDER.flat().includes(s) && s !== '')
        .sort();
    // The board lacks the same keys on both hands, so mirrored the same accents are past it.
    expect(onExtras(true)).toEqual(onExtras(false));
  });
});

/** The thumb keys of each layer that have a binding though a held thumb blocks them. */
function onBlockedThumbs(layout: Layout): string[] {
  const c = compileLayout(layout);
  return c.layers.flatMap((l) =>
    blockedThumbs(c, l.idx)
      .filter((pos) => !['trans', 'none'].includes(l.bindings[pos].kind))
      .map((pos) => `${l.id}/${c.keys[pos].id}`),
  );
}

describe('a thumb holding a layer leaves its hand no thumb key to type there', () => {
  for (const preset of GEOMETRY_PRESET_IDS)
    it(`${preset}: the default layers, Accents mirrored or not`, () => {
      expect(onBlockedThumbs(boardWithDefaults(preset))).toEqual([]);
      expect(onBlockedThumbs(boardWithDefaults(preset, true))).toEqual([]);
    });

  for (const layout of BUNDLED_LAYOUTS)
    it(`${layout.id}: every layer`, () => {
      expect(onBlockedThumbs(layout)).toEqual([]);
    });
});

describe("Accents keys a board lacks are on Extras, or past its finger keys on Accents' thumbs", () => {
  it("on Extras' finger keys, and past them on Accents' thumbs, whichever thumbs hold Numbers and Symbols", () => {
    // A Special layout on the 24 keys with space on the left outer thumb and a tap-hold of its own
    // on the inner one, which cannot hold Numbers too: the space key does.
    const geometry = getGeometryPreset('1333+2');
    const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });
    const free = geometry.keys.filter((k) => !k.thumb).map((k) => k.id);
    const letters = Object.fromEntries(BASE_LETTERS.map((c, i) => [free[i], kp(c)]));
    const ctrlOrRepeat: Binding = {
      kind: 'hold_tap',
      tap: { kind: 'key_repeat' },
      hold: { kind: 'mod', mod: 'LCTRL' },
    };
    const layout = withDefaultLayers(
      {
        format: 'layerbench/layout@1',
        name: 'Space on L1',
        hostLocale: 'symbols',
        geometry: { preset: '1333+2' },
        keys: { space: 'L1' },
        layers: [{ id: 'base', bindings: { ...letters, L1: kp(' '), L0: ctrlOrRepeat } }],
      },
      geometry,
    );
    const extras = layout.layers.find((l) => l.id === 'extras')?.bindings ?? {};
    const base = layout.layers[0].bindings;
    const held = ['L1', 'L0', 'R0', 'R1'].filter((id) => {
      const b = base[id];
      return b?.kind === 'mo' || (b?.kind === 'hold_tap' && b.hold.kind === 'mo');
    });
    expect(held).toEqual(['L1', 'R0']);
    expect(base.L0).toEqual(ctrlOrRepeat);
    // Both thumbs hold: Extras has none to give. `^` and `î`, which no finger key of Extras has room
    // for, are on Accents' thumbs, one-shot.
    expect(Object.keys(extras).filter((id) => /\d/.test(id))).toEqual([]);
    const accents = layout.layers.find((l) => l.id === 'accents')?.bindings ?? {};
    const onThumbs = Object.entries(accents)
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

describe("Magic Romak's layers: the defaults' Numbers, its keymap's Symbols, and no Extras or Accents", () => {
  const layer = (id: string) => magicRomak.layers.find((l) => l.id === id)?.bindings ?? {};
  const typed = (b: Binding | undefined): string | undefined =>
    b?.kind === 'kp' ? b.symbol : b?.kind === 'hold_tap' ? typed(b.tap) : undefined;

  it('Numbers and Symbols type what the core tables say', () => {
    for (const [id, s] of Object.entries(NUMBERS_CORE)) expect(typed(layer('num')[id])).toBe(s);
    for (const [id, s] of Object.entries(SYMBOLS_CORE)) expect(typed(layer('sym')[id])).toBe(s);
  });

  it('has neither Extras nor Accents, nor anything that reached them', () => {
    expect(magicRomak.layers.map((l) => l.id)).toEqual([
      'alpha1',
      'alpha2',
      'ccedil',
      'num',
      'sym',
    ]);
    expect(magicRomak.conditionalLayers ?? []).toEqual([]);
    expect(Object.keys(magicRomak.activators ?? {})).not.toContain('accents');
    // Alpha 2's right outer thumb is the keymap's apostrophe again.
    expect(layer('alpha2').R1).toEqual({ kind: 'kp', symbol: "'" });
    const named = JSON.stringify([magicRomak.layers, magicRomak.combos]);
    expect(named).not.toMatch(/"(extras|accents)"/);
  });

  it("types €, ° and º or ª by its keymap's combos", () => {
    const combos = magicRomak.combos ?? [];
    expect(combos.filter((c) => ['euro', 'degree', 'ordinal'].includes(c.id ?? ''))).toEqual([
      expect.objectContaining({ id: 'euro', keys: ['RTR', 'RTM', 'RTI'], layers: ['sym'] }),
      expect.objectContaining({ id: 'degree', keys: ['RBR', 'RBM', 'RBI'], layers: ['num'] }),
      expect.objectContaining({ id: 'ordinal', keys: ['RHR', 'RHM', 'RHI'], layers: ['num'] }),
    ]);
    const t = trace(magicRomak, '€ ° º ª');
    expect(t.out).toBe('€ ° º ª');
    expect(t.keys).toEqual([
      ...['R0', 'combo:euro', 'L0'],
      // Numbers held from space through the rest, which taps it for the spaces between them, as the
      // engine models a held space key.
      ...['L0', 'combo:degree', 'L0', 'combo:ordinal', 'L0', 'combo:ordinal'],
    ]);
  });

  it('still types the accents by the dead keys on the combos of Alpha 2', () => {
    const t = trace(magicRomak, 'ñ è ü');
    expect(t.out).toBe('ñ è ü');
    expect(t.keys).toEqual([
      ...['R0', 'combo:tilde', 'LHR', 'L0'],
      ...['R0', 'combo:grave', 'RHR', 'L0'],
      ...['R0', 'combo:diaeresis', 'RTR'],
    ]);
  });
});

describe('Romak types every accent through Accents, one-shot from its right outer thumb', () => {
  const romak = bundledLayout('romak') as Layout;

  it('has one alpha layer and the default layers, and no combos', () => {
    expect(romak.layers.map((l) => l.id)).toEqual(['alpha1', 'num', 'sym', 'accents']);
    expect(romak.combos).toBeUndefined();
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

/**
 * What Magic Romak cannot type: it has no Extras or Accents, and its keymap has no other way to these.
 * French loses `œ`, `æ` and its quotes, German its `ß`.
 */
const MAGIC_ROMAK_UNTYPED = [...'£§«»ıßœæ'];
const MAGIC_ROMAK_MISSING: Record<string, string[][]> = {
  fr: [['œ'], ['æ'], ['«', '»']],
  de: [['ß'], [], []],
};

describe('the default layers on every bundled layout', () => {
  const before = new Map([...CLASSIC_LAYOUTS, ...SMALL_LAYOUTS].map((l) => [l.id, l]));

  for (const layout of BUNDLED_LAYOUTS) {
    describe(layout.name, () => {
      const compiled = compileLayout(layout);
      const producible = producibleSymbols(compiled);

      it('has Accents, Numbers and Symbols, and Extras only where the board needs it, but Magic Romak', () => {
        const ids = layout.layers
          .map((l) => l.id)
          .filter((id) => DEFAULT_LAYER_ID_LIST.includes(id));
        const preset = 'preset' in layout.geometry ? layout.geometry.preset : '';
        const extras = defaultLayers(getGeometryPreset(preset)).layers.some(
          (l) => l.id === 'extras',
        );
        expect(ids).toEqual(
          layout.id === 'magic-romak'
            ? ['num', 'sym']
            : ['num', 'sym', ...(extras ? ['extras'] : []), 'accents'],
        );
        expect(layout.layers.some((l) => ['dead', 'sym2'].includes(l.id))).toBe(false);
      });

      it("types every digit and symbol of the default layers, and German's letters, but what Magic Romak cannot", () => {
        const missing = [...'0123456789', ...defaultLayerSymbols(), ...'ßäöü'].filter(
          (c) => !producible.has(c),
        );
        const untyped = layout.id === 'magic-romak' ? MAGIC_ROMAK_UNTYPED : [];
        expect([...new Set(missing)].sort()).toEqual([...untyped].sort());
      });

      it('writes all six languages, every letter and mark, but what Magic Romak cannot', () => {
        for (const tag of Object.keys(LANGUAGE_PROFILES)) {
          const c = layoutLanguageCoverage(compiled, tag);
          const missing = (layout.id === 'magic-romak' && MAGIC_ROMAK_MISSING[tag]) || [[], [], []];
          expect([tag, c?.missingRequired, c?.missingOptional, c?.missingPunctuation]).toEqual([
            tag,
            ...missing,
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
      // A layout that brings its own Numbers and Symbols keeps them, and gets no default layers.
      const takesDefaults = !original?.layers.some((l) => DEFAULT_LAYER_ID_LIST.includes(l.id));
      if (original && takesDefaults && layoutCategory(original) === 'special') {
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

  const heldBy = (b: Binding | undefined) =>
    b?.kind === 'mo'
      ? b.layer
      : b?.kind === 'hold_tap' && b.hold.kind === 'mo'
        ? b.hold.layer
        : undefined;

  it('hold Numbers on the inner left thumb and Symbols on the inner right one, on every layout', () => {
    for (const layout of BUNDLED_LAYOUTS) {
      const b = layout.layers[0].bindings;
      expect([layout.id, heldBy(b.L0), heldBy(b.R0)]).toEqual([layout.id, 'num', 'sym']);
    }
  });

  it('bring Extras on by holding both inner thumbs, whichever goes down first', () => {
    const withExtras = BUNDLED_LAYOUTS.filter((l) => l.layers.some((x) => x.id === 'extras'));
    expect(withExtras.length).toBeGreaterThan(0);
    for (const layout of withExtras) {
      const layer = (id: string) => layout.layers.find((l) => l.id === id)?.bindings ?? {};
      expect([layout.id, heldBy(layer('sym').L0), heldBy(layer('num').R0)]).toEqual([
        layout.id,
        'num',
        'sym',
      ]);
      expect(layout.conditionalLayers).toContainEqual(EXTRAS_CONDITION);
    }
  });

  it('hold Numbers on the space key where it is the inner left thumb, as on Qwerty', () => {
    expect(base('qwerty').L0).toEqual(holds('num', space));
    expect(base('qwerty').R0).toEqual(holdSymbols);
    expect(num('qwerty').R0).toEqual(holds('sym', space));
    expect(num('qwerty').R1).toEqual({ kind: 'kp', symbol: '0' });
  });

  it('hold Numbers on the inner left thumb where space is on the outer one, still typing what it typed', () => {
    expect(base('bird').L0).toEqual(holds('num', { kind: 'kp', symbol: 'q' }));
    expect(base('bird').L1).toEqual(space);
    expect(base('ben-vallack-piano').L0).toEqual(holds('num', { kind: 'sk', mod: 'LSHIFT' }));
    expect(base('ben-vallack-piano').L1).toEqual(space);
    const t = trace(bundledLayout('bird') as Layout, 'q 7 q');
    expect(t.out).toBe('q 7 q');
  });

  it('hold Symbols on the inner right thumb past a free outer one, still a magic key when tapped', () => {
    const nordrassil = base('nordrassil');
    expect([nordrassil.L0?.kind, heldBy(nordrassil.L0)]).toEqual(['hold_tap', 'num']);
    expect(nordrassil.L0?.kind === 'hold_tap' && nordrassil.L0.tap.kind).toBe('adaptive');
    expect([nordrassil.R0?.kind, heldBy(nordrassil.R0)]).toEqual(['hold_tap', 'sym']);
    expect(nordrassil.R0?.kind === 'hold_tap' && nordrassil.R0.tap.kind).toBe('adaptive');
    expect(nordrassil.L1).toEqual(space);
    expect(nordrassil.R1).toEqual({ kind: 'kp', symbol: 't' });
    expect(heldBy(nordrassil.R2)).toBeUndefined();
    expect(num('nordrassil').R0).toEqual(holds('sym', space));
    expect(num('nordrassil').R1).toEqual({ kind: 'kp', symbol: '0' });
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

  it('hold Symbols on the innermost free thumb where the inner one is a tap-hold already', () => {
    const geometry = getGeometryPreset('3x5+3');
    const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });
    const free = geometry.keys.filter((k) => !k.thumb).map((k) => k.id);
    const letters = Object.fromEntries(BASE_LETTERS.map((c, i) => [free[i], kp(c)]));
    const ctrlOrRepeat: Binding = {
      kind: 'hold_tap',
      tap: { kind: 'key_repeat' },
      hold: { kind: 'mod', mod: 'RCTRL' },
    };
    const layout = withDefaultLayers(
      {
        format: 'layerbench/layout@1',
        name: 'Tap-hold on R0',
        hostLocale: 'symbols',
        geometry: { preset: '3x5+3' },
        keys: { space: 'L0' },
        layers: [
          { id: 'base', bindings: { ...letters, L0: space, R0: ctrlOrRepeat, R1: kp('t') } },
        ],
      },
      geometry,
    );
    const b = layout.layers[0].bindings;
    const numbers = layout.layers.find((l) => l.id === 'num')?.bindings ?? {};
    // Past R0, a tap-hold, and R1, which types `t`, to R2, which types nothing.
    expect([b.L0, b.R0, b.R1, b.R2]).toEqual([
      holds('num', space),
      ctrlOrRepeat,
      kp('t'),
      holdSymbols,
    ]);
    expect([numbers.R2, numbers.R0]).toEqual([holds('sym', space), kp('0')]);
  });

  it('hold Numbers on a free inner left thumb, on the base layer and on Symbols, with nothing to tap', () => {
    // On the 24 keys, which have Extras, with space on the outer left thumb and nothing on the inner.
    const geometry = getGeometryPreset('1333+2');
    const free = geometry.keys.filter((k) => !k.thumb).map((k) => k.id);
    const letters = Object.fromEntries(
      BASE_LETTERS.map((c, i) => [free[i], { kind: 'kp', symbol: c } as Binding]),
    );
    const layout = withDefaultLayers(
      {
        format: 'layerbench/layout@1',
        name: 'Free L0',
        hostLocale: 'symbols',
        geometry: { preset: '1333+2' },
        keys: { space: 'L1' },
        layers: [{ id: 'base', bindings: { ...letters, L1: space } }],
      },
      geometry,
    );
    const holdNumbers: Binding = { kind: 'mo', layer: 'num' };
    const sym = layout.layers.find((l) => l.id === 'sym')?.bindings ?? {};
    expect([layout.layers[0].bindings.L0, layout.layers[0].bindings.L1, sym.L0]).toEqual([
      holdNumbers,
      space,
      holdNumbers,
    ]);
  });

  it('hold Numbers on the left inner thumb when no thumb types space', () => {
    expect(base('uno').L0).toEqual(holds('num', { kind: 'kp', symbol: 'a' }));
    expect(base('uno').R0).toEqual(holds('sym', { kind: 'kp', symbol: 'r' }));
  });
});

describe('home row mods: Gui, Ctrl, Alt and Shift from each pinky in, unless a layout gives its own', () => {
  const KEYS = ['LHP', 'LHR', 'LHM', 'LHI', 'RHI', 'RHM', 'RHR', 'RHP'];
  const MODS = ['LGUI', 'LCTRL', 'LALT', 'LSHIFT', 'LSHIFT', 'LALT', 'LCTRL', 'LGUI'];
  const heldMod = (b: Binding | undefined) =>
    b?.kind === 'hold_tap' && b.hold.kind === 'mod' ? b.hold.mod : undefined;
  const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });

  it('mirror the left hand on the right, both holding the left modifiers', () => {
    expect(Object.keys(HOME_ROW_MODS)).toEqual(KEYS);
    expect(Object.values(HOME_ROW_MODS)).toEqual(MODS);
  });

  // A definition may give its own, as its author's keymap has them; a document carries its own in
  // its JSON, as Magic Romak's would once a change made it one: it holds a modifier on a key off the
  // home row, as Magic Romak's bottom row holds Gui. Any other is held to the standard ones, so one
  // that loses a home row mod fails.
  const standard = (l: Layout) =>
    KEYS.every((k, i) => heldMod(l.layers[0].bindings[k]) === MODS[i]);
  const holdsOffHome = (l: Layout) =>
    Object.entries(l.layers[0].bindings).some(
      ([k, b]) => !KEYS.includes(k) && heldMod(b) !== undefined,
    );
  const own = new Set([
    ...[...CLASSIC_DEFS, ...SMALL_DEFS].filter((d) => d.homeRowMods !== undefined).map((d) => d.id),
    ...DOCUMENT_LAYOUTS.filter((l) => !standard(l) && holdsOffHome(l)).map((l) => l.id),
  ]);

  it.each(BUNDLED_LAYOUTS.filter((l) => !own.has(l.id ?? '')).map((l) => [l.id, l] as const))(
    '%s holds them on its base layer, each on a key that types, and no other layer holds one',
    (_id, layout) => {
      const base = layout.layers[0].bindings;
      expect(KEYS.map((k) => heldMod(base[k]))).toEqual(MODS);
      for (const k of KEYS) {
        const tap = base[k]?.kind === 'hold_tap' ? base[k].tap : undefined;
        expect([k, tap?.kind]).not.toEqual([k, 'hold_tap']);
        expect([k, tap?.kind]).not.toEqual([k, 'none']);
      }
      // No other layer holds a modifier on a key.
      for (const l of layout.layers.slice(1)) {
        for (const b of Object.values(l.bindings))
          expect(b.kind === 'hold_tap' && b.hold.kind).not.toBe('mod');
      }
    },
  );

  it("give way to a layout's own: Magic Romak holds its keymap's home block mods", () => {
    const base = magicRomak.layers[0].bindings;
    const hold = (k: string) => (base[k]?.kind === 'hold_tap' ? base[k].hold : undefined);
    const gui: Binding = { kind: 'mod', mod: 'LGUI' };
    expect(
      Object.fromEntries(
        ['LHP', 'LHR', 'LHM', 'LHI', 'LBR', 'LBM', 'LBI', 'RHI', 'RHM', 'RHR', 'RHP', 'RBI'].map(
          (k) => [k, hold(k)],
        ),
      ),
    ).toEqual({
      // The pinkies hold a layer of shortcuts, which types nothing: left out.
      LHP: undefined,
      LHR: { kind: 'mod', mod: 'LCTRL' },
      LHM: { kind: 'mod', mod: 'LALT' },
      LHI: { kind: 'mod', mod: 'LSHIFT' },
      LBR: { ...gui, also: ['LSHIFT'] },
      LBM: { ...gui, also: ['LSHIFT'] },
      LBI: gui,
      RHI: { kind: 'mod', mod: 'LSHIFT' },
      RHM: { kind: 'mod', mod: 'LALT' },
      RHR: { kind: 'mod', mod: 'LCTRL' },
      RHP: undefined,
      RBI: gui,
    });
    // Each still types what it typed; the magic key is still the magic key.
    expect(base.RBI?.kind === 'hold_tap' && base.RBI.tap.kind).toBe('adaptive');
    expect(base.LHP).toEqual(kp('d'));
    // The keymap's , and . hold to move the cursor, which is editing, and are left as they were.
    expect(base.RBM).toEqual(kp(','));
    expect(base.RBR).toEqual(kp('.'));
  });

  it('go on any key that types: a letter, a mark, space, Repeat or an adaptive key', () => {
    const at = (id: string, key: string) => bundledLayout(id)?.layers[0].bindings[key];
    const mod = (tap: Binding, m: string): Binding => ({
      kind: 'hold_tap',
      tap,
      hold: { kind: 'mod', mod: m as 'LGUI' },
    });
    expect(at('qwerty', 'LHP')).toEqual(mod(kp('a'), 'LGUI'));
    expect(at('qwerty', 'RHP')).toEqual(mod(kp(';'), 'LGUI'));
    expect(at('uno', 'RHM')).toEqual(mod(kp(' '), 'LALT'));
    expect(at('t-34', 'RHP')).toEqual(mod({ kind: 'key_repeat' }, 'LGUI'));
    expect(at('uno', 'LHR')?.kind === 'hold_tap' && at('uno', 'LHR')).toMatchObject({
      tap: { kind: 'adaptive' },
      hold: { kind: 'mod', mod: 'LCTRL' },
    });
  });

  it('pass over a key with nothing on it or holding something already, and every other layer', () => {
    const layout: Layout = {
      format: 'layerbench/layout@1',
      name: 'Bare',
      geometry: { preset: '3x5+2' },
      keys: { space: 'L0' },
      layers: [
        {
          id: 'base',
          bindings: {
            LHP: kp('a'),
            LHR: { kind: 'none' },
            LHM: { kind: 'mo', layer: 'up' },
            LHI: { kind: 'lt', layer: 'up', tap: kp('t') },
            RHI: { kind: 'hold_tap', tap: kp('n'), hold: { kind: 'mo', layer: 'up' } },
            RHM: { kind: 'mod', mod: 'LCTRL' },
          },
        },
        { id: 'up', bindings: { LHP: kp('1') } },
      ],
    };
    const done = withHomeRowMods(layout);
    expect(done.layers[0].bindings).toEqual({
      ...layout.layers[0].bindings,
      LHP: { kind: 'hold_tap', tap: kp('a'), hold: { kind: 'mod', mod: 'LGUI' } },
    });
    expect(done.layers[1]).toBe(layout.layers[1]);
  });

  it('leave Ben Vallack Piano a one-shot Shift where its keymap has Repeat, the Shift for capitals', () => {
    const piano = bundledLayout('ben-vallack-piano') as Layout;
    expect(piano.keys.shift).toEqual({ key: 'L0', kind: 'sk' });
    const r = explain(compileLayout(piano), 'Tin', { caseMode: 'model', crossWord: 'reset' });
    expect(r.steps.map((s) => s.symbols).join('')).toBe('Tin');
    expect(r.steps.filter((s) => s.kind !== 'hold_release').map((s) => s.key)).toEqual([
      'L0',
      'LHI',
      'LHP',
      'RHI',
    ]);
  });
});

/** What a key types on a default layer: its symbol, or its tap's. */
function typedOn(b: Binding | undefined): string | undefined {
  if (b?.kind === 'hold_tap') return typedOn(b.tap);
  return b?.kind === 'kp' ? b.symbol : undefined;
}

/** Where each symbol of the default layers is typed: layer and key, every key that types it. */
function symbolKeys(layers: readonly { id: string; bindings: Record<string, Binding> }[]) {
  const out = new Map<string, { layer: string; key: string }[]>();
  for (const l of layers) {
    if (!DEFAULT_LAYER_ID_LIST.includes(l.id)) continue;
    for (const [key, b] of Object.entries(l.bindings)) {
      const s = typedOn(b);
      if (s === undefined || s === ' ') continue;
      out.set(s, [...(out.get(s) ?? []), { layer: l.id, key }]);
    }
  }
  return out;
}

/** Whether two finger keys of one hand are neighbours, in a row or in a column. */
function sideBySide(geometry: ReturnType<typeof getGeometryPreset>, a: string, b: string) {
  const ka = geometry.keys.find((k) => k.id === a);
  const kb = geometry.keys.find((k) => k.id === b);
  if (!ka || !kb || ka.thumb || kb.thumb || ka.hand !== kb.hand) return false;
  return Math.abs(ka.col - kb.col) + Math.abs(ka.row - kb.row) === 1;
}

/** Each pair's halves: on one layer, side by side, else what is wrong. */
function pairsApart(
  geometry: ReturnType<typeof getGeometryPreset>,
  layers: readonly { id: string; bindings: Record<string, Binding> }[],
) {
  const at = symbolKeys(layers);
  const apart: string[] = [];
  for (const [a, b] of SYMBOL_PAIRS) {
    const together = (at.get(a) ?? []).some((x) =>
      (at.get(b) ?? []).some((y) => x.layer === y.layer && sideBySide(geometry, x.key, y.key)),
    );
    if (!together) apart.push(`${a}${b}`);
  }
  return apart;
}

/** cyanophage's Effort for a finger key, as the Effort rule charges it. */
function effortOf(geometry: ReturnType<typeof getGeometryPreset>, id: string): number {
  const grid = [
    [5, 3, 2, 1, 2, 7],
    [5, 1, 0, 0, 0, 5],
    [7, 3, 2, 2, 1, 8],
  ];
  const k = geometry.keys.find((x) => x.id === id);
  return k && !k.thumb ? grid[k.row][k.col] : Number.POSITIVE_INFINITY;
}

describe('symbol pairs share a layer, side by side', () => {
  it('are the brackets and the look-alikes, past the three the keymap keeps apart', () => {
    expect(SYMBOL_PAIRS.map((p) => p.join('')).sort()).toEqual(
      ['()', '[]', '{}', '<>', '«»', ':;', '¿?', '¡!'].sort(),
    );
    // Magic Romak's keymap has `\` on Numbers and `/` on Symbols, and `+` between `-` and `_`.
    expect(CORE_SPLIT_PAIRS.map((p) => p.join(''))).toEqual(['/\\', '-_', '+=']);
    const keyOf = (s: string) =>
      [...Object.entries(NUMBERS_CORE), ...Object.entries(SYMBOLS_CORE)].find(
        ([, x]) => x === s,
      )?.[0];
    const g = getGeometryPreset('1333+2');
    for (const [a, b] of CORE_SPLIT_PAIRS)
      expect([a, b, sideBySide(g, keyOf(a) ?? '', keyOf(b) ?? '')]).toEqual([a, b, false]);
  });

  for (const preset of GEOMETRY_PRESET_IDS) {
    it(`${preset}: every pair together, and every symbol on one key`, () => {
      const geometry = getGeometryPreset(preset);
      const { layers } = defaultLayers(geometry);
      expect(pairsApart(geometry, layers)).toEqual([]);
      const twice = [...symbolKeys(layers)].filter(([, at]) => at.length > 1).map(([s]) => s);
      expect(twice).toEqual([]);
      for (const l of layers)
        expect([l.id, Object.keys(l.bindings).filter((id) => id !== '*').length <= 34]).toEqual([
          l.id,
          true,
        ]);
    });
  }

  // Magic Romak keeps its keymap's Symbols, which splits `; :`, `? ¿` and `! ¡`, and has no `« »`.
  for (const layout of BUNDLED_LAYOUTS.filter((l) => l.id !== 'magic-romak')) {
    it(`${layout.name}: every pair together`, () => {
      const preset = 'preset' in layout.geometry ? layout.geometry.preset : '';
      expect(pairsApart(getGeometryPreset(preset), layout.layers)).toEqual([]);
    });
  }

  it('move to Extras whole when one half has no key: ¿ and ¡ take ? and ! with them', () => {
    const d = defaultLayers(getGeometryPreset('1333+2'));
    const sym = d.layers.find((l) => l.id === 'sym')?.bindings ?? {};
    const extras = d.layers.find((l) => l.id === 'extras')?.bindings ?? {};
    const on = (layer: Record<string, Binding>) =>
      Object.values(layer).map(typedOn).filter(Boolean);
    for (const s of [...'¿?¡!:;«»']) {
      expect([s, on(extras).includes(s)]).toEqual([s, true]);
      expect([s, on(sym).includes(s)]).toEqual([s, false]);
    }
  });
});

describe('Extras starts on the prime keys', () => {
  it('ranks the keys by Effort, the home row first among keys that cost the same', () => {
    for (const preset of GEOMETRY_PRESET_IDS) {
      const geometry = getGeometryPreset(preset);
      const ranked = primeKeys(geometry);
      expect(ranked.length).toBe(geometry.keys.filter((k) => !k.thumb).length);
      for (let i = 1; i < ranked.length; i++) {
        const [a, b] = [ranked[i - 1], ranked[i]];
        const [ca, cb] = [effortOf(geometry, a), effortOf(geometry, b)];
        expect([a, b, ca <= cb]).toEqual([a, b, true]);
        if (ca === cb && b[1] === 'H') expect([a, b, a[1]]).toEqual([a, b, 'H']);
      }
    }
    // Then the right hand first, inner column first; and among equal costs, top before bottom.
    expect(primeKeys(getGeometryPreset('1333+2')).slice(0, 12)).toEqual([
      ...['RHI', 'RHM', 'RHR', 'LHI', 'LHM', 'LHR'],
      ...['RHP', 'LHP', 'RTM', 'LTM', 'RBI', 'LBI'],
    ]);
  });

  for (const preset of GEOMETRY_PRESET_IDS) {
    const geometry = getGeometryPreset(preset);
    const extras = defaultLayers(geometry).layers.find((l) => l.id === 'extras')?.bindings;
    if (!extras) continue;
    it(`${preset}: the most used symbols on the cheapest keys, the accents after them`, () => {
      const ordered = EXTRAS_ORDER.flat();
      const symbols = Object.entries(extras).filter(([, b]) => ordered.includes(typedOn(b) ?? ''));
      const first = ordered.find((s) => symbols.some(([, b]) => typedOn(b) === s));
      const firstKey = symbols.find(([, b]) => typedOn(b) === first)?.[0] ?? '';
      // The most used of them on the home row, on a key that costs nothing.
      expect([first, firstKey[1], effortOf(geometry, firstKey)]).toEqual([first, 'H', 0]);
      // No finger key left to the accents, or empty, costs less than one with a symbol.
      const symbolCost = Math.max(
        ...symbols.filter(([id]) => !/\d/.test(id)).map(([id]) => effortOf(geometry, id)),
      );
      const symbolIds = new Set(symbols.map(([id]) => id));
      const cheaper = primeKeys(geometry).filter(
        (id) => !symbolIds.has(id) && effortOf(geometry, id) < symbolCost,
      );
      expect(cheaper).toEqual([]);
    });
  }
});

/**
 * A binding and every binding inside it, however deep: what it holds, taps, chooses among, or
 * steps through. Its parts, in the glossary's sense, and itself.
 */
function* bindingsIn(b: Binding | undefined): Generator<Binding> {
  if (!b) return;
  yield b;
  switch (b.kind) {
    case 'hold_tap':
      yield* bindingsIn(b.tap);
      yield* bindingsIn(b.hold);
      break;
    case 'lt':
      yield* bindingsIn(b.tap);
      break;
    case 'mod_morph':
      yield* bindingsIn(b.default);
      yield* bindingsIn(b.morphed);
      break;
    case 'layer_morph':
      yield* bindingsIn(b.active);
      yield* bindingsIn(b.inactive);
      break;
    case 'tap_dance':
      for (const x of b.bindings) yield* bindingsIn(x);
      break;
    case 'macro':
      for (const x of [...(b.steps ?? []), ...(b.then ?? [])]) yield* bindingsIn(x);
      break;
    case 'adaptive':
      yield* bindingsIn(b.default);
      for (const t of b.triggers ?? []) yield* bindingsIn(t.binding);
      break;
  }
}

describe('layers that type nothing', () => {
  // A layer of functions, media or macros types nothing in a text: no layout reaches one, and no
  // key holds an imported key.
  it.each(BUNDLED_LAYOUTS.map((l) => [l.id, l] as const))(
    '%s reaches none, and no key of it holds an imported key',
    (_id, layout) => {
      const bindings = [
        ...layout.layers.flatMap((l) => Object.values(l.bindings)),
        ...(layout.combos ?? []).map((c) => c.binding),
      ];
      for (const b of bindings) {
        for (const p of bindingsIn(b)) {
          if (p.kind === 'hold_tap') expect(p.hold.kind).not.toBe('raw');
          if (p.kind === 'raw') expect(p.source ?? '').not.toMatch(/^&(mo|lt|sl|to|tog)\b/);
        }
      }
    },
  );
});
