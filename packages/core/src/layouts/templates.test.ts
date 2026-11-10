import { describe, expect, it } from 'vitest';
import { eighteenKeys, HOME_ROW_MODS } from '../fixtures/boards.js';
import { GEOMETRY_PRESET_IDS, getGeometryPreset } from '../geometry/presets.js';
import { layoutLanguageCoverage, producibleSymbols } from '../lang/coverage.js';
import { LANGUAGE_PROFILES } from '../lang/profiles.js';
import { compileLayout } from '../layout/compile.js';
import type { Binding, Layout } from '../layout/types.js';
import { blockedThumbs, reachKeys } from '../sim/activators.js';
import { explain } from '../sim/resolver.js';
import { CLASSIC_DEFS, CLASSIC_LAYOUTS, classicLayout } from './classic.js';
import { BUNDLED_LAYOUTS, bundledLayout, SMALL_DEFS, SMALL_LAYOUTS } from './index.js';
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
  hasDefaultLayers,
  mirrorKeyId,
  NUMBERS_CORE,
  NUMBERS_OUTER,
  primeKeys,
  SYMBOL_PAIRS,
  SYMBOLS_CORE,
  SYMBOLS_OUTER,
  vowelsOnLeft,
  withHomeRowMods,
  withNewLayoutDefaults,
} from './templates.js';

const magicRomak = bundledLayout('magic-romak')!;

/** Each layout written in code as its definition builds it, before its home row mods. */
const BEFORE = new Map([...CLASSIC_LAYOUTS, ...SMALL_LAYOUTS].map((l) => [l.id, l]));

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
    expect(defaultLayers(getGeometryPreset('3x5+2')).base.R0).toEqual({
      kind: 'hold_tap',
      tap: { kind: 'none' },
      hold: { kind: 'mo', layer: 'sym' },
    });
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
    // A layout there is given them as the board has them: its space on the inner L0, which holds
    // Numbers, and Symbols held on the right one.
    const eighteen = eighteenKeys();
    expect(eighteen.keys.space).toBe('L0');
    expect(eighteen.layers.slice(1)).toEqual(d.layers);
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

  // A layout written in code is its author's design and has no Accents. A document that has the
  // default layers carries its own Accents in its JSON, mirrored when its vowels are on the left.
  for (const layout of BUNDLED_LAYOUTS.filter(hasDefaultLayers)) {
    const left = vowelsOnLeft(layout.layers[0].bindings);
    it(`${layout.name}: ${left ? 'mirrored' : 'as drawn'}`, () => {
      const preset = 'preset' in layout.geometry ? layout.geometry.preset : '';
      const accents = layout.layers.find((l) => l.id === 'accents')?.bindings ?? {};
      const defaults = defaultLayers(getGeometryPreset(preset), { mirrorAccents: left });
      expect(accents).toEqual(defaults.layers.find((l) => l.id === 'accents')?.bindings);
    });
  }

  it('is given to a new layout that types its vowels with the left hand, and not to one that does not', () => {
    const geometry = getGeometryPreset('3x5+2');
    const accentsOf = (id: string) =>
      withNewLayoutDefaults(bundledLayout(id) as Layout, geometry).layers.find(
        (l) => l.id === 'accents',
      )?.bindings;
    for (const [id, mirrorAccents] of [
      ['dvorak', true],
      ['engram', true],
      ['qwerty', false],
    ] as const) {
      const base = (bundledLayout(id) as Layout).layers[0].bindings;
      expect([id, vowelsOnLeft(base)]).toEqual([id, mirrorAccents]);
      expect(accentsOf(id)).toEqual(
        defaultLayers(geometry, { mirrorAccents }).layers.find((l) => l.id === 'accents')?.bindings,
      );
    }
  });

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

  it("has €, ° and º or ª on its keymap's combos, which type", () => {
    const combos = magicRomak.combos ?? [];
    // The keys in the order the keymap's file draws them.
    const named = (id: string) => combos.find((c) => c.id === id);
    expect(named('euro')).toMatchObject({ keys: ['RTI', 'RTM', 'RTR'], layers: ['sym'] });
    expect(named('degree')).toMatchObject({ keys: ['RBI', 'RBM', 'RBR'], layers: ['num'] });
    expect(named('ordinal')).toMatchObject({ keys: ['RHI', 'RHM', 'RHR'], layers: ['num'] });
    for (const id of ['euro', 'degree', 'ordinal']) expect(named(id)?.role).toBeUndefined();
    const made = producibleSymbols(compileLayout(magicRomak));
    for (const s of '€°ºª') expect(made.has(s)).toBe(true);
    // Held, the ordinal combo types the feminine one.
    expect(named('ordinal')?.binding).toMatchObject({ kind: 'hold_tap', hold: { symbol: 'ª' } });
  });

  it('has no ¿ or ¡: the keymap draws no hold on ? and !', () => {
    const combos = magicRomak.combos ?? [];
    for (const id of ['question', 'exclamation'])
      expect(combos.find((c) => c.id === id)?.binding.kind).toBe('kp');
    const made = producibleSymbols(compileLayout(magicRomak));
    expect(made.has('¿')).toBe(false);
    expect(made.has('¡')).toBe(false);
  });

  it('has the dead keys on the combos of Alpha 2, which type what no key does', () => {
    const dead = (magicRomak.combos ?? []).filter((c) => c.binding.kind === 'dead_key');
    expect(dead.map((c) => c.id)).toEqual(['diaeresis', 'circumflex', 'acute', 'grave', 'tilde']);
    for (const c of dead) expect(c.role).toBeUndefined();
    // Alpha 2 has `é` and `ã`, and the dead keys the rest: the cheapest way types each.
    expect(trace(magicRomak, 'ñ è ü').out).toBe('ñ è ü');
    expect(trace(magicRomak, 'ñ').keys).toContain('combo:tilde');
    expect(trace(magicRomak, 'é').keys.join(' ')).not.toContain('combo:');
  });

  it('types with ten of its combos: `;`, `à`, the dead keys, `€`, `°` and `º`', () => {
    const typing = (magicRomak.combos ?? []).filter((c) => c.role !== 'command');
    expect(typing.map((c) => c.id).sort()).toEqual(
      [
        'acute',
        'agrave',
        'circumflex',
        'degree',
        'diaeresis',
        'euro',
        'grave',
        'ordinal',
        'semicolon',
        'tilde',
      ].sort(),
    );
    // The rest are the keyboard's: the letters of Alpha 1's chords, `- ? ! :` and Numbers' `g j k |`.
    const commands = (magicRomak.combos ?? []).filter((c) => c.role === 'command');
    expect(commands.length).toBe((magicRomak.combos ?? []).length - 10);
  });
});

describe("Magic Romak types `;` as the keymap's combo", () => {
  it('RBM and RBR together, on Alpha 1 and on Numbers', () => {
    expect(magicRomak.combos?.find((c) => c.id === 'semicolon')).toMatchObject({
      keys: ['RBM', 'RBR'],
      binding: { kind: 'kp', symbol: ';' },
      layers: ['alpha1', 'num'],
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
 * What each layout with layers past its base cannot type of the digits, the default layers'
 * symbols and German's letters: its author's layers and combos type what they type, and these are
 * what they leave out, for an edit in the app to add. Magic Romak's keymap has no way to
 * `£ § « » ı ß œ æ`, and its file draws no `¿` or `¡`, so French and German lack a letter, and
 * Spanish its two marks. Romak has Magic Romak's Numbers and Symbols and no dead key, so it lacks
 * those and `ñ ä ö ü` too. RSTHD's Special layer types symbols and no digit.
 */
const UNTYPED: Record<string, string> = {
  'magic-romak': '¡£§«»¿ßæıœ',
  romak: '¡£§«»¿ßæıœñäöü',
  'hands-down-gold': '\\ªº«»ı¿¡ß',
  'hands-down-promethium': '\\ªº«»ı¿¡ß',
  'hands-down-vibranium': '\\ªº«»ı¿¡ß',
  rsthd: "'0123456789=\\`£§ªº°«»ı¿¡ßœæñçäöü€",
  't-34': '€£§ªº°«»ı¿¡ßœæ',
  'magic-sturdy': '€£§ªº°?«»ı¿¡ßœæñçäöü',
  enthium: '&()€£§ªº°«»ı¿¡ßœæñçäöü',
  finch: '€£§ªº°~^"?«»ı¿¡ßœæñçäöü',
  caksoylar: '{}|€£§ªº°~"<>:?«»ı¡ßœæñçäöü',
  'ben-vallack-piano': '€§ªº°_«»ı¿¡ßœæñçäöü',
};

/** A language's letters and marks, all of them: what a layout with no accent of its own lacks. */
function everyLetter(tag: string): string[][] {
  const p = LANGUAGE_PROFILES[tag];
  return [p.required, p.optional ?? [], p.punctuation ?? []];
}

/**
 * The marks each layout with no Numbers or Symbols types: those its author places on its keys, and
 * on its second alpha layer where it has one, and nothing else. Digits, accents
 * and every other symbol are left to an edit in the app.
 */
const TYPES: Record<string, string> = {
  qwerty: ',./;',
  dvorak: "',.;",
  colemak: ',./;',
  'colemak-dh': ',./;',
  graphite: "'-./",
  gallium: "',.;",
  canary: "',./",
  sturdy: "',.;",
  aptv3: "',./",
  'hands-down-neu': '\',-./"',
  night: "',./;",
  dusk: "',./_",
  recurva: "',.;",
  focal: "',.;",
  nerps: "',.;",
  engram: '"\',-.?',
  sunlight: ',-./;=',
  snth: "',./=",
  aptmak: "',.",
  bird: "',.",
  'bird-30': "',./",
  nordrassil: "',-./;",
  uno: "',-./",
};

/** Every language but English, lacked whole: by a layout whose layers have no accents. */
const ACCENTLESS = Object.fromEntries(
  Object.keys(LANGUAGE_PROFILES)
    .filter((tag) => tag !== 'en')
    .map((tag) => [tag, everyLetter(tag)]),
);

/**
 * What each layout with layers past its base lacks of each language, where it lacks anything: its
 * required letters, its optional ones and its punctuation. Magic Romak's lack what its keymap has no
 * way to: `ß`, `œ` and `æ`, the French quotes, `¿` and `¡`. Romak's lack what its write-up and
 * Magic Romak's Numbers and Symbols have no way to: it types Portuguese in full but for `ü`, and none
 * of the other languages' own.
 */
const LACKS: Record<string, Record<string, string[][]>> = {
  romak: {
    pt: [[], ['ü'], []],
    es: [['ñ', 'ü'], [], ['¿', '¡']],
    fr: [['è', 'ë', 'î', 'ï', 'ù', 'û', 'ü', 'ÿ', 'œ'], ['æ'], ['«', '»']],
    it: [['è', 'ì', 'î', 'ò', 'ù'], [], []],
    de: [['ä', 'ö', 'ü', 'ß'], [], []],
  },
  'magic-romak': {
    es: [[], [], ['¿', '¡']],
    fr: [['œ'], ['æ'], ['«', '»']],
    de: [['ß'], [], []],
  },
  ...Object.fromEntries(
    ['hands-down-gold', 'hands-down-promethium', 'hands-down-vibranium'].map((id) => [
      id,
      { es: [[], [], ['¿', '¡']], fr: [[], [], ['«', '»']], de: [['ß'], [], []] },
    ]),
  ),
  rsthd: ACCENTLESS,
  't-34': { es: [[], [], ['¿', '¡']], fr: [['œ'], ['æ'], ['«', '»']], de: [['ß'], [], []] },
  'magic-sturdy': ACCENTLESS,
  enthium: ACCENTLESS,
  finch: ACCENTLESS,
  caksoylar: { ...ACCENTLESS, es: [everyLetter('es')[0], [], ['¡']] },
  'ben-vallack-piano': ACCENTLESS,
};

describe('which bundled layouts have the default layers', () => {
  it('is none: every bundled layout is its author’s design', () => {
    expect(
      BUNDLED_LAYOUTS.filter((l) => hasDefaultLayers(l))
        .map((l) => l.id)
        .sort(),
    ).toEqual([]);
  });

  it('names every layout written in code in exactly one of UNTYPED and TYPES', () => {
    const written = [...BEFORE.keys()].sort();
    expect([...Object.keys(UNTYPED), ...Object.keys(TYPES)].sort()).toEqual(written);
  });
});

describe("every bundled layout is its author's design, with what its layers leave out", () => {
  for (const layout of BUNDLED_LAYOUTS) {
    describe(layout.name, () => {
      const compiled = compileLayout(layout);
      const producible = producibleSymbols(compiled);
      const original = layout.id ? BEFORE.get(layout.id) : undefined;
      const everyDefault = [...new Set([...'0123456789', ...defaultLayerSymbols(), ...'ßäöü'])];
      const missing = () => everyDefault.filter((c) => !producible.has(c)).sort();
      const types = TYPES[layout.id ?? ''];
      const lacks = (tag: string) =>
        LACKS[layout.id ?? '']?.[tag] ?? (types === undefined ? undefined : ACCENTLESS[tag]);

      if (!hasDefaultLayers(layout)) {
        it("has no default layer nor anything that reached one, and keeps its author's layers", () => {
          expect(layout.layers.some((l) => ['accents', 'extras'].includes(l.id))).toBe(false);
          expect(layout.conditionalLayers ?? []).toEqual([]);
          expect(layout.combos?.some((c) => c.id === 'accents') ?? false).toBe(false);
          expect(JSON.stringify([layout.layers, layout.combos])).not.toMatch(/"(extras|accents)"/);
        });

        if (original)
          it("is its definition as it builds it, with its author's home row mods and nothing more", () => {
            const def = [...CLASSIC_DEFS, ...SMALL_DEFS].find((d) => d.id === layout.id);
            const built = def?.homeRowMods ? withHomeRowMods(original, def.homeRowMods) : original;
            expect(layout).toEqual({ ...built, languages: [...(def?.languages ?? ['en'])] });
          });

        it(
          types === undefined
            ? "types every digit, and of the default layers' symbols all its author's layers carry"
            : 'types the marks its author places and nothing else',
          () => {
            expect(missing()).toEqual(
              types === undefined
                ? [...(UNTYPED[layout.id ?? ''] ?? '')].sort()
                : everyDefault.filter((c) => !types.includes(c)).sort(),
            );
          },
        );

        it("writes each language but what its author's layers lack", () => {
          for (const tag of Object.keys(LANGUAGE_PROFILES)) {
            const c = layoutLanguageCoverage(compiled, tag);
            expect([tag, c?.missingRequired, c?.missingOptional, c?.missingPunctuation]).toEqual([
              tag,
              ...(lacks(tag) ?? [[], [], []]),
            ]);
          }
        });
        return;
      }

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
        expect(missing()).toEqual([]);
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
    });
  }
});

describe('layouts whose sources define no layer that types: their letters, thumbs and marks alone', () => {
  const layout = (id: string) => bundledLayout(id) as Layout;
  const base = (id: string) => layout(id).layers[0].bindings;
  const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });

  it.each(['bird', 'nordrassil', 'uno'])(
    '%s has one layer, no combo and no key that holds a layer',
    (id) => {
      expect(layout(id).layers.map((l) => l.id)).toEqual(['base']);
      expect(layout(id).combos).toBeUndefined();
      expect(layout(id).conditionalLayers).toBeUndefined();
      const kinds = new Set(Object.values(base(id)).map((b) => b.kind));
      for (const kind of ['hold_tap', 'lt', 'mo', 'sl', 'sk', 'tog'])
        expect([id, kind, kinds.has(kind as Binding['kind'])]).toEqual([id, kind, false]);
    },
  );

  it('give Bird space and q, v and z on its four thumbs', () => {
    expect([base('bird').L1, base('bird').L0, base('bird').R0, base('bird').R1]).toEqual([
      kp(' '),
      kp('q'),
      kp('v'),
      kp('z'),
    ]);
  });

  it("gives Nordrassil space, an arcane key on each hand's inner thumb and t on the right", () => {
    const b = base('nordrassil');
    expect([b.L1, b.R1]).toEqual([kp(' '), kp('t')]);
    expect([b.L0?.kind, b.R0?.kind]).toEqual(['adaptive', 'adaptive']);
  });

  it('gives Uno the thumbs of its QMK keymap, i a under the left hand and r l under the right', () => {
    const b = base('uno');
    expect([b.L1, b.L0, b.R0, b.R1]).toEqual([kp('i'), kp('a'), kp('r'), kp('l')]);
    // Space is under the right middle finger, as the author draws it.
    expect(b.RHM).toEqual(kp(' '));
  });
});

describe("RSTHD's Symbols layer: the Special layer of its author's keymap", () => {
  const rsthd = bundledLayout('rsthd') as Layout;
  const layer = rsthd.layers.find((l) => l.id === 'sym')?.bindings ?? {};
  const typed = (b: Binding | undefined) => (b?.kind === 'kp' ? b.symbol : undefined);
  const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });

  it('types the marks of the keymap on the keys the board has: brackets and angle brackets on the left, the number row’s marks on the home row', () => {
    expect(
      Object.fromEntries(
        Object.entries(layer)
          .filter(([, b]) => b.kind === 'kp')
          .map(([id, b]) => [id, typed(b)]),
      ),
    ).toEqual({
      ...{ LTP: '<', LTR: '>', LTM: '[', LTI: ']', RTI: ':', RTR: '{', RTP: '}' },
      ...{ LHP: '!', LHR: '@', LHM: '#', LHI: '$', LHC: '%' },
      ...{ RHC: '^', RHI: '&', RHM: '*', RHR: '(', RHP: ')' },
      ...{ LBR: '~', LBM: '_', LBI: '"', LBC: '|', RBC: '?', RBI: '+' },
    });
  });

  it('types no digit, and no symbol twice', () => {
    const symbols = Object.values(layer).flatMap((b) => typed(b) ?? []);
    expect(symbols.filter((s) => /\d/.test(s))).toEqual([]);
    expect(new Set(symbols).size).toBe(symbols.length);
    expect(symbols).toHaveLength(23);
  });

  it('lets the keys its keymap leaves transparent show the base layer, and types nothing on its Alt-Backspace keys', () => {
    for (const id of ['LBP', 'RTM', 'RBM', 'RBR', 'RBP'])
      expect(layer[id]).toEqual({ kind: 'trans' });
    // What a layer leaves out types nothing, the Alt-Backspace keys of `LTC` and `RTC` among them.
    expect(layer['*']).toEqual({ kind: 'none' });
    for (const id of ['LTC', 'RTC']) expect(layer[id]).toBeUndefined();
  });

  it('is held on the inner thumbs, each still typing what it typed, and leaves the outer ones transparent', () => {
    const base = rsthd.layers[0].bindings;
    const holdsSym = { kind: 'mo', layer: 'sym' };
    expect(base.L0).toEqual({ kind: 'hold_tap', tap: kp('e'), hold: holdsSym });
    expect(base.R0).toEqual({ kind: 'hold_tap', tap: kp(' '), hold: holdsSym });
    expect([base.L1, base.R1]).toEqual([{ kind: 'trans' }, { kind: 'trans' }]);
    const compiled = compileLayout(rsthd);
    const reach = reachKeys(compiled, compiled.layerIndex.get('sym') as number).map(
      (k) => compiled.keys[k.pos].id,
    );
    expect(reach.sort()).toEqual(['L0', 'R0']);
  });

  it('types its symbols with one thumb held, and a digit not at all', () => {
    const t = trace(rsthd, 'a < ( ?');
    expect(t.out).toBe('a < ( ?');
    expect(t.coverage.unproducible.size).toBe(0);
    expect(trace(rsthd, '7').coverage.unproducible.get('7')).toBe(1);
  });
});

describe("home row mods: held only where an author's keymap holds them", () => {
  const heldMod = (b: Binding | undefined) =>
    b?.kind === 'hold_tap' && b.hold.kind === 'mod' ? b.hold.mod : undefined;
  const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });

  // A layout written in code holds the mods its definition gives, which are its author's: those it
  // writes on its keys and those of `homeRowMods`. A document carries its own in its JSON.
  const heldBy = (layout: Layout, thumbs: ReadonlySet<string>) =>
    Object.fromEntries(
      Object.entries(layout.layers[0].bindings)
        .filter(([key]) => !thumbs.has(key))
        .map(([key, b]) => [key, heldMod(b)] as const)
        .filter(([, mod]) => mod !== undefined),
    );

  it.each([...CLASSIC_DEFS, ...SMALL_DEFS].map((d) => [d.id, d] as const))(
    '%s holds the modifiers its definition gives on its finger keys, and no others',
    (id, def) => {
      const layout = bundledLayout(id) as Layout;
      const g = layout.geometry;
      if (!('preset' in g)) throw new Error(`${layout.name} is not on a preset board`);
      const thumbs = new Set(
        getGeometryPreset(g.preset)
          .keys.filter((k) => k.thumb)
          .map((k) => k.id),
      );
      const written = classicLayout(def);
      const authored = def.homeRowMods ? withHomeRowMods(written, def.homeRowMods) : written;
      expect(heldBy(layout, thumbs)).toEqual(heldBy(authored, thumbs));
    },
  );

  it('are given by the definitions of Magic Sturdy, the three Hands Down and Ben Vallack Piano only', () => {
    expect(
      [...CLASSIC_DEFS, ...SMALL_DEFS]
        .filter((d) => d.homeRowMods !== undefined)
        .map((d) => d.id)
        .sort(),
    ).toEqual([
      'ben-vallack-piano',
      'hands-down-gold',
      'hands-down-promethium',
      'hands-down-vibranium',
      'magic-sturdy',
    ]);
  });

  it.each([...CLASSIC_DEFS, ...SMALL_DEFS].map((d) => [d.id] as const))(
    '%s holds a modifier on its base layer only',
    (id) => {
      for (const l of (bundledLayout(id) as Layout).layers.slice(1)) {
        for (const b of Object.values(l.bindings))
          expect(b.kind === 'hold_tap' && b.hold.kind).not.toBe('mod');
      }
    },
  );

  it("Magic Romak holds its keymap's home block mods", () => {
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
    const mod = (tap: Binding, m: string): Binding => ({
      kind: 'hold_tap',
      tap,
      hold: { kind: 'mod', mod: m as 'LGUI' },
    });
    const layout: Layout = {
      format: 'layerbench/layout@1',
      name: 'Types',
      geometry: { preset: '3x5+2' },
      keys: { space: 'L0' },
      layers: [
        {
          id: 'base',
          bindings: {
            LHP: kp('a'),
            RHP: kp(';'),
            RHM: kp(' '),
            LHM: { kind: 'key_repeat' },
            LHR: { kind: 'adaptive', default: kp('h'), triggers: [] },
          },
        },
      ],
    };
    const done = withHomeRowMods(layout, HOME_ROW_MODS).layers[0].bindings;
    expect(done.LHP).toEqual(mod(kp('a'), 'LGUI'));
    expect(done.RHP).toEqual(mod(kp(';'), 'LGUI'));
    expect(done.RHM).toEqual(mod(kp(' '), 'LALT'));
    expect(done.LHM).toEqual(mod({ kind: 'key_repeat' }, 'LALT'));
    expect(done.LHR).toMatchObject({
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
    const done = withHomeRowMods(layout, HOME_ROW_MODS);
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

  // A layout with layers of its own keeps them as they are: Magic Romak's Symbols splits `; :`,
  // `? ¿` and `! ¡`, and has no `« »`. Only one with the default layers is held to the rule.
  for (const layout of BUNDLED_LAYOUTS.filter(hasDefaultLayers)) {
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

describe('layers that type nothing', () => {
  // No bundled layout has a layer of functions, media or macros: a key or a combo on each of its
  // layers types something.
  const types = (b: Binding | undefined): boolean => {
    switch (b?.kind) {
      case 'kp':
        return !!b.symbol;
      case 'macro':
      case 'dead_key':
      case 'unicode':
      case 'key_repeat':
      case 'adaptive':
        return true;
      case 'hold_tap':
      case 'lt':
        return types(b.tap);
      case 'mod_morph':
        return types(b.default) || types(b.morphed);
      case 'layer_morph':
        return types(b.active) || types(b.inactive);
      case 'tap_dance':
        return b.bindings.some(types);
      default:
        return false;
    }
  };
  it.each(BUNDLED_LAYOUTS.map((l) => [l.id, l] as const))('%s has none', (_id, layout) => {
    for (const l of layout.layers) {
      const onCombos = (layout.combos ?? []).some(
        (c) => (!c.layers || c.layers.includes(l.id)) && types(c.binding),
      );
      expect(Object.values(l.bindings).some(types) || onCombos, l.id).toBe(true);
    }
  });
});

describe('thumbs that only hold', () => {
  // Drawn as every other tap-hold is: what the thumb holds along its bottom, nothing above it.
  it.each(BUNDLED_LAYOUTS.map((l) => [l.id, l] as const))(
    '%s holds with a tap-hold that taps nothing, never with a bare hold',
    (_id, layout) => {
      const geometry = getGeometryPreset((layout.geometry as { preset: string }).preset);
      const thumbs = geometry.keys.filter((k) => k.thumb).map((k) => k.id);
      for (const l of layout.layers)
        for (const id of thumbs) {
          const b = l.bindings[id];
          expect(['mo', 'mod'], `${l.id} ${id}`).not.toContain(b?.kind);
          // Nor is a tap-hold's tap transparent: it taps nothing.
          if (b?.kind === 'hold_tap' || b?.kind === 'lt')
            expect(b.tap.kind, `${l.id} ${id}`).not.toBe('trans');
        }
      expect(defaultLayers(geometry).base.R0 ?? { kind: 'hold_tap' }).toMatchObject({
        kind: 'hold_tap',
      });
    },
  );
});

describe('keys the analysis does not simulate', () => {
  const base = (id: string) => bundledLayout(id)?.layers[0].bindings ?? {};
  const trans: Binding = { kind: 'trans' };
  const nothing: Binding = { kind: 'none' };

  it("are transparent, as a key left unset is: T-34's Shortcuts, Escape, Enter, Tab", () => {
    expect(base('t-34').L1).toEqual(trans);
    expect(base('magic-sturdy').R1).toEqual(trans);
    expect([base('caksoylar').L1, base('caksoylar').R1]).toEqual([trans, trans]);
    expect(base('enthium').R1).toEqual(trans);
  });

  it('tap nothing under a hold: Backspace and Tab held for Numbers', () => {
    for (const id of ['hands-down-gold', 'enthium'])
      expect(base(id).L1).toEqual({
        kind: 'hold_tap',
        tap: nothing,
        hold: { kind: 'mo', layer: 'num' },
      });
  });
});
