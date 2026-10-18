import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze } from '../analysis/analyze.js';
import { analysisRun, DEFAULT_SETTINGS, loadText } from '../analysis/settings.js';
import { nodeCorpusLoader } from '../corpus/node-loader.js';
import { GEOMETRY_PRESET_IDS, getGeometryPreset } from '../geometry/presets.js';
import { corporaRoot } from '../golden/paths.js';
import { layoutLanguageCoverage, producibleSymbols } from '../lang/coverage.js';
import { LANGUAGE_PROFILES } from '../lang/profiles.js';
import { compileLayout } from '../layout/compile.js';
import type { Binding, Layout } from '../layout/types.js';
import { defaultEffort } from '../rules/effort.js';
import { getPreset } from '../rules/presets.js';
import { reachKeys } from '../sim/activators.js';
import { explain } from '../sim/resolver.js';
import { CLASSIC_LAYOUTS } from './classic.js';
import { BUNDLED_LAYOUTS, bundledLayout, SMALL_LAYOUTS } from './index.js';
import { magicRomak } from './romak.js';
import {
  ACCENTS,
  accentsCombo,
  DEFAULT_LAYER_ID_LIST,
  defaultAccentMacros,
  defaultDeadKeys,
  defaultLayerSymbols,
  defaultLayers,
  EXTRAS_CONDITION,
  EXTRAS_CORE,
  NUMBERS_CORE,
  NUMBERS_OUTER,
  SYMBOLS_CORE,
  SYMBOLS_OUTER,
} from './templates.js';

/** The chord that one-shots Accents, as `explain` names its step. */
const ACCENTS_COMBO = 'combo:accents';

/**
 * A base layer with the letters every accent composes with, on whatever keys the board has. A
 * Qwerty import would not do: the small boards drop half its letters.
 */
const BASE_LETTERS = [...'aeiouycn'];

function boardWithDefaults(preset: string): Layout {
  const geometry = getGeometryPreset(preset);
  const defaults = defaultLayers(geometry);
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
    combos: [accentsCombo('base')],
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

      it('writes all five languages', () => {
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
    expect(t.keys).toEqual([ACCENTS_COMBO, 'RBM', 'LTC']);
  });

  it('type the most frequent accented letters, ñ, ç and ß with a key each', () => {
    expect(trace(boardWithDefaults('3x5+2'), 'é ã ñ ç ß').keys).toEqual([
      ...[ACCENTS_COMBO, 'RHI', 'L0'],
      ...[ACCENTS_COMBO, 'RHR', 'L0'],
      ...[ACCENTS_COMBO, 'LTM', 'L0'],
      ...[ACCENTS_COMBO, 'LBI', 'L0'],
      ...[ACCENTS_COMBO, 'RTI'],
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

  it('put on Extras what a board has no outer key for, where Dead keys had it', () => {
    const extras = (preset: string) =>
      defaultLayers(getGeometryPreset(preset)).layers.find((l) => l.id === 'extras')?.bindings;
    const kps = (table: Record<string, string>) =>
      Object.fromEntries(Object.entries(table).map(([id, s]) => [id, { kind: 'kp', symbol: s }]));
    // No outer keys at all: every one of them.
    expect(extras('1333+2')).toEqual({ '*': { kind: 'trans' }, ...kps(EXTRAS_CORE) });
    // No pinky bottom and no inner top: the three symbols those keys had.
    expect(extras('23332+2')).toEqual({
      '*': { kind: 'trans' },
      ...kps({ LHP: 'ª', LHM: '£', LBR: '«' }),
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
    // Symbols' last mark on the left outer thumb, beside the one holding Numbers.
    expect(d.layers[1].bindings.L1).toEqual({ kind: 'kp', symbol: ';' });
    const t = trace(boardWithDefaults('1222+2'), '[ * « 3 ; € §');
    expect(t.out).toBe('[ * « 3 ; € §');
  });

  it('hold Numbers on the space bar of a row-stagger board, and arm Symbols from there', () => {
    const d = defaultLayers(getGeometryPreset('ansi'));
    expect(Object.keys(d.base).sort()).toEqual(['L0', 'R0']);
    expect(d.layers[0].bindings.RHO).toEqual({ kind: 'sl', layer: 'sym' });
    expect(d.layers[0].bindings.RTO).toEqual({ kind: 'kp', symbol: '0' });
    const t = trace(boardWithDefaults('ansi'), 'ñ');
    expect(t.out).toBe('ñ');
    expect(t.keys).toEqual([ACCENTS_COMBO, 'LTM']);
  });

  it('carry each dead key the five languages need', () => {
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

/**
 * Presses on each key of Accents, typing each text the app comes with on the default analysis
 * settings, by what the key types: Qwerty for the board with a bottom row, Ben Vallack Piano for the
 * one without. A dead key's are the letters typed through it. Keys no text presses are left out.
 */
const ACCENT_USES: Record<string, Record<string, Record<string, number>>> = {
  qwerty: {
    'en-general': { é: 8, qu: 103, ü: 1, ç: 1, ñ: 1 },
    'pt-br-general': {
      ...{ é: 475, qu: 870, ó: 189, á: 500, ã: 849, í: 301, à: 77, ü: 5, è: 1, ç: 591 },
      ...{ ê: 161, ö: 1, ú: 114, õ: 114, ô: 43 },
    },
    'es-general': {
      ...{ é: 245, qu: 812, ó: 836, á: 404, í: 446, ü: 4, è: 2, ç: 1, ú: 124, ñ: 173 },
      '¨': 1,
    },
    'fr-general': {
      ...{ é: 2569, qu: 876, à: 434, ü: 2, è: 336, ç: 41, ê: 141, ö: 1, ù: 22, ô: 50 },
      ...{ â: 32, î: 28, '¨': 19, '^': 16, œ: 9 },
    },
    'it-general': { é: 39, qu: 435, à: 236, è: 321, ç: 1, ö: 1, ù: 75, ì: 46, ò: 39, â: 1 },
    'de-general': { é: 4, qu: 18, ó: 1, á: 1, ã: 2, ü: 663, ä: 511, ö: 274, ß: 129 },
  },
  'ben-vallack-piano': {
    'en-general': { '´': 8, '¨': 1, ç: 1, ñ: 1 },
    'pt-br-general': { '´': 1579, '`': 78, '¨': 6, '~': 963, ç: 591, '^': 204 },
    'es-general': { '´': 2055, '`': 2, '¨': 5, ç: 1, ñ: 173, '¿': 22, '¡': 1 },
    'fr-general': { '´': 2569, '`': 792, '¨': 22, ç: 41, '^': 267, œ: 9 },
    'it-general': { '´': 39, '`': 717, '¨': 1, ç: 1, '^': 1 },
    'de-general': { '´': 6, '¨': 1448, '~': 2, ß: 129 },
  },
};

/** What a key of Accents types, or the accent it is the dead key of. */
function typedBy(b: Binding): string {
  if (b.kind === 'dead_key') return b.diacritic ?? '';
  if (b.kind === 'macro') return b.symbols ?? '';
  return b.kind === 'kp' ? (b.symbol ?? '') : '';
}

const HOME_FIRST = 'HTB';
/** Strongest first; a thumb by its column, inner first. */
const FINGERS = 'IMRPC';

/**
 * A position's place in the order Accents fills them: by cost, then the home row, the stronger
 * finger, a thumb after the fingers, the top row before the bottom, and the right hand first.
 */
function placeOf(id: string, cost: number): number[] {
  const thumb = /^[LR]\d$/.test(id);
  const row = thumb ? 3 : HOME_FIRST.indexOf(id[1]);
  return [
    cost,
    row === 0 ? 0 : 1,
    thumb ? 1 : 0,
    thumb ? Number(id[1]) : FINGERS.indexOf(id[2]),
    row,
    id[0] === 'R' ? 0 : 1,
  ];
}

function before(a: number[], b: number[]): boolean {
  const i = a.findIndex((x, k) => x !== b[k]);
  return i >= 0 && a[i] < b[i];
}

/** Every key a board with a bottom row has, but for the pinkies' top and bottom and the inner column. */
const CORE = new Set(
  getGeometryPreset('1333+2')
    .keys.filter((k) => !k.thumb)
    .map((k) => k.id),
);

function totalUses(byText: Record<string, Record<string, number>>): Record<string, number> {
  const total: Record<string, number> = {};
  for (const uses of Object.values(byText))
    for (const [s, n] of Object.entries(uses)) total[s] = (total[s] ?? 0) + n;
  return total;
}

/** The keys of a layout's Accents: what each types, where it sits in the order, and on the core. */
function accentKeys(layout: Layout, compiled: ReturnType<typeof compileLayout>) {
  const effort = defaultEffort(compiled);
  const bindings = layout.layers.find((l) => l.id === 'accents')?.bindings ?? {};
  const outerBoard = Object.keys(bindings).some((k) => /^[LR][TB]P$|^[LR].C$/.test(k));
  return Object.entries(bindings)
    .filter(([k]) => k !== '*')
    .map(([k, binding]) => ({
      binding,
      typed: typedBy(binding),
      place: placeOf(k, effort[k]),
      core: !outerBoard || CORE.has(k),
    }));
}

describe('Accents puts the keys used most where they cost least', () => {
  const loader = nodeCorpusLoader(corporaRoot());

  for (const [id, byText] of Object.entries(ACCENT_USES)) {
    const layout = bundledLayout(id) as Layout;
    const compiled = compileLayout(layout);
    const accents = compiled.layers.findIndex((l) => l.id === 'accents');

    for (const [corpus, uses] of Object.entries(byText)) {
      it.skipIf(!existsSync(join(corporaRoot(), corpus, 'sample.txt')))(
        `${id} presses each key as often as recorded, typing ${corpus}`,
        async () => {
          const settings = { ...DEFAULT_SETTINGS, corpus, rules: getPreset('cyanophage') };
          const text = await loadText(settings, (c) => loader.load(c));
          const { stream, options } = analysisRun(settings, text);
          const log = analyze(compiled, stream, options).simulation.presses;
          const unigrams = log.ngrams('no_space', 'unigram');
          const counted: Record<string, number> = {};
          for (let i = 0; i < unigrams.size; i++) {
            const press = log.presses[unigrams.ids[i]];
            if (press.layer !== accents) continue;
            counted[press.label] = (counted[press.label] ?? 0) + unigrams.counts[i];
          }
          expect(counted).toEqual(uses);
        },
        30_000,
      );
    }

    it(`${id}: no key is used more than one on a better position`, () => {
      const total = totalUses(byText);
      const keys = accentKeys(layout, compiled);
      // `qu` is no accent: it trades places with `ê`, leaving the home row to the accented letters.
      const quAt = keys.find((k) => k.typed === 'qu');
      const eAt = keys.find((k) => k.typed === 'ê');
      if (quAt && eAt) [quAt.place, eAt.place] = [eAt.place, quAt.place];
      // On a board with outer keys, the core and what is past it are filled each on its own.
      const misplaced = keys.flatMap((a) =>
        keys
          .filter(
            (b) =>
              a.core === b.core &&
              (total[a.typed] ?? 0) > (total[b.typed] ?? 0) &&
              before(b.place, a.place),
          )
          .map((b) => `${a.typed} behind ${b.typed}`),
      );
      expect(misplaced).toEqual([]);
    });
  }

  it('keeps what every board needs on the core, and past it the letters used least', () => {
    const layout = bundledLayout('qwerty') as Layout;
    const keys = accentKeys(layout, compileLayout(layout));
    const total = totalUses(ACCENT_USES.qwerty);
    const outer = keys.filter((k) => !k.core);
    // The dead keys, and the letters no dead key makes or worth a press less.
    expect(outer.filter((k) => k.binding.kind !== 'macro')).toEqual([]);
    expect(outer.map((k) => k.typed)).not.toContain('ñ');
    // `ê` holds `qu`'s home key.
    const leastOnCore = Math.min(
      ...keys
        .filter((k) => k.core && k.binding.kind === 'macro' && k.typed !== 'ê')
        .map((k) => total[k.typed] ?? 0),
    );
    for (const k of outer) expect([k.typed, total[k.typed] < leastOnCore]).toEqual([k.typed, true]);
  });

  it('keeps qu and ê where the exception puts them', () => {
    expect(ACCENTS.RTM).toEqual({ kind: 'macro', symbols: 'qu' });
    expect(ACCENTS.LHI).toEqual({ kind: 'macro', symbols: 'ê' });
  });
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

describe('Romak types the other accents by the combos on its Alpha 2, or by Accents', () => {
  const romak = bundledLayout('romak-34') as Layout;

  it('has no Alt repeat 2, and the default layers', () => {
    expect(romak.layers.map((l) => l.id)).toEqual([
      ...['alpha1', 'alpha2', 'ccedil'],
      ...['num', 'sym', 'accents'],
    ]);
    expect(romak.combos).toContainEqual(accentsCombo('alpha1'));
    expect(romak.behaviors).toBeUndefined();
  });

  it('writes the five languages: ñ and ü on Accents, ¿ ¡ and œ held', () => {
    const t = trace(romak, 'ñ ü ¿ ¡ œ');
    expect(t.out).toBe('ñ ü ¿ ¡ œ');
    expect(t.keys).toEqual([
      ...[ACCENTS_COMBO, 'LTM', 'L0'],
      ...[ACCENTS_COMBO, 'LHP', 'L0'],
      ...['R0', 'combo:question', 'L0'],
      ...['R0', 'combo:exclamation', 'L0'],
      ...['R0', 'RHR'],
    ]);
    const compiled = compileLayout(romak);
    for (const tag of Object.keys(LANGUAGE_PROFILES)) {
      expect([tag, layoutLanguageCoverage(compiled, tag)?.missingRequired]).toEqual([tag, []]);
    }
  });
});

describe("Romak and Magic Romak type `;` as the keymap's combo", () => {
  for (const id of ['romak-34', 'magic-romak']) {
    it(`${id}: RBM and RBR together, on Alpha 1 and on Numbers`, () => {
      const layout = bundledLayout(id) as Layout;
      expect(layout.combos?.find((c) => c.id === 'semicolon')).toMatchObject({
        keys: ['RBM', 'RBR'],
        binding: { kind: 'kp', symbol: ';' },
        layers: ['alpha1', 'num'],
        role: 'typing',
      });
      // Numbers held for the digits, the combo between them.
      const t = trace(layout, '7;8');
      expect(t.out).toBe('7;8');
      expect(t.keys).toEqual(['L0', 'RTI', 'combo:semicolon', 'RTM']);
    });
  }

  it('magic-romak: the combo, where it had to go through Dead keys', () => {
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

      it('writes all five languages, every letter and mark', () => {
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
      if (original) {
        it('reaches Accents by LHR and LHM pressed together on its base layer, and nothing else', () => {
          const base = layout.layers[0].id;
          expect(layout.combos).toContainEqual(accentsCombo(base));
          const accents = compiled.layerIndex.get('accents') as number;
          const reach = reachKeys(compiled, accents)
            .map((k) => ({
              key: compiled.keys[k.pos].id,
              from: k.routes.map((r) => compiled.layers[r.via].id),
            }))
            .sort((a, b) => a.key.localeCompare(b.key));
          expect(reach).toEqual([
            { key: 'LHM', from: [base] },
            { key: 'LHR', from: [base] },
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
    expect(base('qwerty').L1).toEqual(holds('num', space));
    expect(base('qwerty').R0).toEqual(holdSymbols);
    expect(num('qwerty').R0).toEqual(holds('sym', space));
    expect(num('qwerty').R1).toEqual({ kind: 'kp', symbol: '0' });
  });

  it('take the innermost free thumb for Symbols, past one with a letter', () => {
    expect(base('hands-down-neu').R0).toEqual({ kind: 'kp', symbol: 'j' });
    expect(base('hands-down-neu').R1).toEqual(holdSymbols);
  });

  it('hold Symbols on a thumb that types where every thumb does, and keep 0 by the keypad', () => {
    expect(base('finch').R0).toEqual(holds('sym', { kind: 'kp', symbol: 'e' }));
    expect(num('finch').R0).toEqual(holds('sym', space));
    expect(num('finch').RBC).toEqual({ kind: 'kp', symbol: '0' });
    const t = trace(bundledLayout('finch') as Layout, 'ñ');
    expect(t.out).toBe('ñ');
    expect(t.keys).toEqual([ACCENTS_COMBO, 'LTM']);
  });

  it('hold Numbers on the left inner thumb when no thumb types space', () => {
    expect(base('uno').L0).toEqual(holds('num', { kind: 'kp', symbol: 'a' }));
    expect(base('uno').R0).toEqual(holds('sym', { kind: 'kp', symbol: 'r' }));
  });
});
