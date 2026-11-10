import { describe, expect, it } from 'vitest';
import { getGeometryPreset } from '../geometry/presets.js';
import { layoutLanguageCoverage, producibleSymbols } from '../lang/coverage.js';
import { layoutCategory } from '../layout/categories.js';
import { compileLayout } from '../layout/compile.js';
import type { Binding } from '../layout/types.js';
import { explain } from '../sim/resolver.js';
import {
  BUNDLED_LAYOUTS,
  bundledLayout,
  CLASSIC_DEFS,
  classicLayout,
  documentedLayouts,
  SMALL_DEFS,
  tapOf,
} from './index.js';

const magicRomak = bundledLayout('magic-romak')!;

const romak = bundledLayout('romak')!;

const ALPHABET = [...'abcdefghijklmnopqrstuvwxyz'];

/**
 * A layout is data, and a mistyped letter is invisible: it does not fail to compile, it just makes
 * every metric wrong. These assertions are what catch it.
 */
describe('bundled layouts', () => {
  it.each(documentedLayouts().map((l) => [l.id ?? l.name, l] as const))(
    '%s types the whole alphabet exactly once per letter',
    (_id, layout) => {
      const compiled = compileLayout(layout);
      const producible = producibleSymbols(compiled);
      const missing = ALPHABET.filter((c) => !producible.has(c));
      expect(missing).toEqual([]);
    },
  );

  it.each(BUNDLED_LAYOUTS.map((l) => [l.id ?? l.name, l] as const))(
    '%s can type a space and has a declared space key',
    (_id, layout) => {
      const compiled = compileLayout(layout);
      expect(compiled.spaceKey).toBeGreaterThanOrEqual(0);
      expect(producibleSymbols(compiled).has(' ')).toBe(true);
    },
  );

  it('has no duplicate ids or names', () => {
    const ids = BUNDLED_LAYOUTS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    const names = BUNDLED_LAYOUTS.map((l) => l.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('cites where every borrowed letter arrangement came from', () => {
    // Attribution is the only thing these layouts are shared under.
    for (const layout of BUNDLED_LAYOUTS) {
      if (layout.author === undefined) continue;
      expect(layout.description, layout.id).toBeTruthy();
    }
  });
});

/**
 * The Numbers and Symbols layers of the author's keymap, `numbers_layer` and `symbols_layer` in
 * `zmk/definitions/keymap.dtsi` of github.com/rafaelromao/keyboards. The fixture corpora hold
 * almost none of these characters, so the golden reports cannot tell a misplaced one; this can.
 */
describe('Romak numbers and symbols', () => {
  const KEYMAP_CHARACTERS = [...'0123456789\\{}&()|[].,~#@^$"\'<>`%=:?-+_!/*'];
  const OPTS = { caseMode: 'fold', crossWord: 'reset' } as const;
  const romaks = [magicRomak, romak].map((l) => [l.name, l] as const);

  it.each(romaks)('%s types every character the two layers carry', (_name, layout) => {
    const producible = producibleSymbols(compileLayout(layout));
    expect(KEYMAP_CHARACTERS.filter((c) => !producible.has(c))).toEqual([]);
  });

  it.each(romaks)(
    '%s reaches the digits by holding space, and the symbols by holding the right inner thumb',
    (_name, layout) => {
      const compiled = compileLayout(layout);
      const keys = (text: string) =>
        explain(compiled, text, OPTS).steps.map((s) => `${s.key}:${s.kind}`);
      expect(keys('7')).toEqual(['L0:hold_press', 'RTI:tap', 'L0:hold_release']);
      expect(keys('=')).toEqual(['R0:hold_press', 'RTM:tap', 'R0:hold_release']);
      expect(keys('{')).toEqual(['L0:hold_press', 'LTM:tap', 'L0:hold_release']);
      expect(keys('@')).toEqual(['R0:hold_press', 'LHP:tap', 'R0:hold_release']);
    },
  );
});

/**
 * Romak 34 as its author writes it up (rafaelromao.github.io/romak, `docs/index.md`): Alpha 1, a
 * second alpha layer for the accents, `qu` and `ç`, and the Ç extension, a one-shot layer for the key
 * after `ç`; Repeat, space, Alpha 2 and a one-shot Shift on the thumbs; and `áé = à` among the combos
 * of Alpha 2. Its Numbers and Symbols are Magic Romak's (the owner's decision, 2026-11-10), held on
 * space and the Alpha 2 thumb, with their combos.
 */
describe('Romak 34', () => {
  const OPTS = { caseMode: 'fold', crossWord: 'reset' } as const;
  const geometry = getGeometryPreset('3x5+2');
  const compiled = compileLayout(romak);
  const what = (b: Binding | undefined): string => {
    if (!b) return '·';
    switch (b.kind) {
      case 'kp':
        return b.symbol === ' ' ? '␣' : (b.symbol ?? '·');
      case 'macro':
        return b.symbols ?? '·';
      case 'key_repeat':
        return '⟲';
      case 'sl':
        return `sl:${b.layer}`;
      case 'sk':
        return `sk:${b.mod}`;
      case 'hold_tap':
        return `${what(b.tap)}↓${b.hold.kind === 'mo' ? b.hold.layer : b.hold.kind}`;
      case 'lt':
        return `${what(b.tap)}↓${b.layer}`;
      default:
        return b.kind;
    }
  };
  /** A layer as the write-up draws it: three rows across both hands, then the thumbs. */
  const drawn = (id: string) => {
    const bindings = romak.layers.find((l) => l.id === id)?.bindings ?? {};
    return [...geometry.textRows, geometry.textThumbs].map((row) =>
      row.map((key) => what(bindings[key])).join(' '),
    );
  };
  const keys = (text: string, extra: Partial<Parameters<typeof explain>[2]> = {}) =>
    explain(compiled, text, { ...OPTS, ...extra })
      .steps.filter((s) => s.kind !== 'hold_release')
      .map((s) => s.key);

  it('draws Alpha 1 as the write-up does, with its four thumbs, space and Alpha 2 holding Numbers and Symbols', () => {
    expect(drawn('alpha1')).toEqual([
      'q b m g k x l o u ;',
      'd n s t w z r a e i',
      'y f c p v j h , . /',
      '⟲ ␣↓num sl:alpha2↓sym sk:LSHIFT',
    ]);
    expect(romak.keys).toEqual({ space: 'L0', shift: { key: 'R1', kind: 'sk' } });
  });

  it('draws Alpha 2 as the write-up does: the accents, qu and ç, and its thumbs', () => {
    expect(drawn('alpha2')).toEqual([
      '· · qu · · · ô ó ú ·',
      '· · · · · · ã á é í',
      '· · ç · · · õ â ê ·',
      "' _ _ '",
    ]);
  });

  it('draws the Ç extension on four keys, which typing ç leaves on for the next key', () => {
    expect(drawn('ccedil')).toEqual([
      '· · · · · · · · · ·',
      '· · · ão · · ã · · ·',
      '· · · ões · · õ · · ·',
      '· · · ·',
    ]);
    expect(romak.layers.find((l) => l.id === 'alpha2')?.bindings.LBM).toEqual({
      kind: 'macro',
      symbols: 'ç',
      then: [{ kind: 'sl', layer: 'ccedil' }],
    });
  });

  it("draws Magic Romak's Numbers key for key, the keys Romak's board adds left unset", () => {
    expect(drawn('num')).toEqual([
      '· \\ { } · · 7 8 9 ·',
      ', & ( ) · · 4 5 6 .',
      '· | [ ] · · 1 2 3 ·',
      '· · ␣↓sym 0',
    ]);
  });

  it("draws Magic Romak's Symbols key for key, the keys Romak's board adds left unset", () => {
    expect(drawn('sym')).toEqual([
      "· ~ # ' · · % = : ·",
      '@ ^ $ " · · ? - + _',
      '· < > ` · · ! / * ·',
      '· ␣↓num · ·',
    ]);
  });

  it("is its letters, Magic Romak's Numbers and Symbols and their typing combos: no Accents, no command combo", () => {
    expect(romak.layers.map((l) => l.id)).toEqual(['alpha1', 'alpha2', 'ccedil', 'num', 'sym']);
    expect(romak.combos?.map((c) => [c.id, c.keys.join(' '), c.layers?.join(','), c.role])).toEqual(
      [
        ['à', 'RHM RHR', 'alpha2', undefined],
        ['ordinal', 'RHI RHM RHR', 'num', undefined],
        ['degree', 'RBI RBM RBR', 'num', undefined],
        ['euro', 'RTI RTM RTR', 'sym', undefined],
      ],
    );
    expect(romak.conditionalLayers ?? []).toEqual([]);
  });

  it('types º, ª, ° and € by the combos of Numbers and Symbols, and lets Alpha 1 show through the keys those layers leave unset', () => {
    expect(keys('º')).toEqual(['L0', 'combo:ordinal']);
    // `ª` is the same chord held.
    expect(keys('ª')).toEqual(['L0', 'combo:ordinal']);
    expect(explain(compiled, 'ª', OPTS).steps.find((s) => s.key === 'combo:ordinal')?.symbols).toBe(
      'ª',
    );
    expect(keys('°')).toEqual(['L0', 'combo:degree']);
    expect(keys('€')).toEqual(['R0', 'combo:euro']);
    for (const id of ['num', 'sym']) {
      expect(romak.layers.find((l) => l.id === id)?.bindings['*']).toEqual({ kind: 'trans' });
    }
  });

  it('is Special, by the macros of its second alpha layer', () => {
    expect(layoutCategory(romak)).toBe('special');
    expect(romak).toMatchObject({ id: 'romak', name: 'Romak' });
  });

  it('types an accent with Alpha 2 for the next key, and ação with ç and the ão macro', () => {
    expect(keys('é')).toEqual(['R0', 'RHR']);
    expect(keys('ação')).toEqual(['RHM', 'R0', 'LBM', 'LHI']);
    expect(keys('ções')).toEqual(['R0', 'LBM', 'LBI']);
    expect(keys('não é')).toEqual(['LHR', 'R0', 'RHI', 'RTM', 'L0', 'R0', 'RHR']);
  });

  it('types à with the combo of á and é on Alpha 2, which Portuguese needs', () => {
    expect(keys('à')).toEqual(['R0', 'combo:à']);
    expect(layoutLanguageCoverage(compiled, 'pt')?.missingRequired).toEqual([]);
  });

  it('types qu with one press of Alpha 2, and a doubled letter with Repeat', () => {
    expect(keys('quando')).toEqual(['R0', 'LTM', 'RHM', 'LHR', 'LHP', 'RTM']);
    expect(keys('hello')).toEqual(['RBI', 'RHR', 'RTI', 'L1', 'RTM']);
  });

  it('types a capital with its one-shot Shift', () => {
    expect(keys('Ab', { caseMode: 'model' })).toEqual(['R1', 'RHM', 'LTR']);
  });
});

/**
 * The small-board layouts lean on more than their letter blocks: chords, adaptive and repeat keys, a
 * second letter layer. A chord on the wrong keys, or an adaptive key that never fires, still types the
 * alphabet, so these hold each to what its source says.
 */
describe('small-board layouts', () => {
  const OPTS = { caseMode: 'fold', crossWord: 'reset' } as const;
  const layout = (id: string) => {
    const found = BUNDLED_LAYOUTS.find((l) => l.id === id);
    if (!found) throw new Error(`no bundled layout ${id}`);
    return found;
  };
  // A thumb that also holds a layer still types its letter when tapped.
  const keyOf = (id: string, symbol: string) =>
    Object.entries(layout(id).layers[0].bindings).find(([, b]) => {
      const tap = b.kind === 'hold_tap' ? b.tap : b;
      return tap.kind === 'kp' && tap.symbol === symbol;
    })?.[0];

  it('puts each chord on the keys its source names', () => {
    // The layout's own chords for letters, not those of its author's for symbols.
    const letters = (b: Binding) =>
      (b.kind === 'kp' && /^[a-z]$/.test(b.symbol ?? '')) ||
      (b.kind === 'macro' && /^[a-z]+$/.test(b.symbols ?? ''));
    const chords = (id: string) =>
      Object.fromEntries(
        (layout(id).combos ?? [])
          .filter((c) => letters(c.binding))
          .map((c) => [
            c.id,
            c.keys.map((k) => {
              const b = tapOf(layout(id).layers[0].bindings[k]);
              return b?.kind === 'kp' ? b.symbol : k;
            }),
          ]),
      );
    expect(chords('hands-down-gold')).toEqual({ q: ['g', 'p'], z: ['s', 'd'] });
    expect(chords('t-34')).toEqual({ q: ['j', 'c'], qu: ['c', 'y'], z: ['y', 'f'] });
    expect(chords('finch')).toEqual({
      qu: ['w', 'y'],
      v: ['l', 'y'],
      z: ['x', 'g'],
      j: ['d', 'g'],
    });
    expect(chords('caksoylar')).toEqual({
      q: ['w', 'f'],
      j: ['f', 'p'],
      v: ['c', 'd'],
      z: ['x', 'c'],
    });
  });

  it('puts the thumb letter on a thumb', () => {
    expect(keyOf('hands-down-gold', 't')).toBe('L0');
    expect(keyOf('rsthd', 'e')).toBe('L0');
    expect(keyOf('t-34', 'e')).toBe('R0');
    expect(keyOf('enthium', 'r')).toBe('R0');
    expect(keyOf('nordrassil', 't')).toBe('R1');
    expect(keyOf('finch', 'e')).toBe('R0');
  });

  it('types with the adaptive key where Magic Sturdy rules say', () => {
    const compiled = compileLayout(layout('magic-sturdy'));
    const adaptive = Object.entries(layout('magic-sturdy').layers[0].bindings).find(
      ([, b]) => b.kind === 'adaptive',
    )?.[0];
    // After a space the adaptive key types "the" in one press.
    expect(explain(compiled, 'in the', OPTS).steps.map((s) => s.key)).toContain(adaptive);
    // The doubled `o` is the repeat key's.
    expect(explain(compiled, 'look', OPTS).steps.map((s) => s.key)).toContain('R0');
  });

  it('types Uno’s adaptive keys as its page says', () => {
    const compiled = compileLayout(layout('uno'));
    const keys = (text: string) => explain(compiled, text, OPTS).steps.map((s) => s.key);
    // `hm` is h at the start of a word and after t, m after a vowel; `on` is o, then n after a vowel.
    expect(keys('the')).toEqual(['RHI', 'LHR', 'LHI']);
    expect(keys('em')).toEqual(['LHI', 'LHR']);
    expect(keys('on')).toEqual(['LHM', 'LHM']);
  });

  it('reaches the Piano’s second letter layer with a one-shot', () => {
    const compiled = compileLayout(layout('ben-vallack-piano'));
    const steps = explain(compiled, 'v', OPTS).steps.map((s) => `${s.key}:${s.kind}`);
    expect(steps[0]).toBe('R1:tap');
    expect(steps.at(-1)).toBe('LTR:tap');
  });
});

/**
 * Engram's board has eleven columns and a 34-key split ten. On the author's keyboard
 * (github.com/binarybottle/engram-2021, `engram.json`, and the Layouts Doc's §15.7.5) each finger
 * types the keys below, the inner columns (`' " , . - ?`) with the index fingers; `z` and `q` sit in
 * the eleventh column, past the right pinky, which the split lacks, so they are on thumbs. Every
 * other letter keeps its finger: with the inner column dropped the right index shared `h` and `t`,
 * and the middle, ring and pinky fingers each typed the letters of the finger beside them.
 */
describe('Engram', () => {
  const layout = bundledLayout('engram')!;
  const base = layout.layers[0].bindings;
  const geometry = getGeometryPreset('3x5+2');
  const fingers = new Map(geometry.keys.map((k) => [k.id, k.finger]));

  it("types each letter but z and q, and its marks, with its author's finger", () => {
    const byFinger: Record<string, string> = {};
    for (const [key, b] of Object.entries(base)) {
      const tap = tapOf(b);
      const finger = fingers.get(key) ?? '';
      if (finger.endsWith('T') || tap?.kind !== 'kp' || !tap.symbol) continue;
      byFinger[finger] = [...((byFinger[finger] ?? '') + tap.symbol)].sort().join('');
    }
    expect(byFinger).toEqual({
      LP: 'bcg',
      LR: 'ixy',
      LM: 'ejo',
      LI: "',-aku",
      RI: '".?hlr',
      RM: 'dmt',
      RR: 'fsw',
      RP: 'npv',
    });
  });

  it("puts each key where the author's rows have it", () => {
    const tapped = (id: string) => {
      const tap = tapOf(base[id]);
      return tap?.kind === 'kp' && tap.symbol ? tap.symbol : '·';
    };
    expect(geometry.textRows.map((row) => row.map(tapped).join(' '))).toEqual([
      'b y o u \' " l d w v',
      'c i e a , . h t s n',
      'g x j k - ? r m f p',
    ]);
  });

  it('puts q and z on the thumbs beside space', () => {
    expect(base.L1).toEqual({ kind: 'kp', symbol: ' ' });
    expect(tapOf(base.L0)).toEqual({ kind: 'kp', symbol: 'q' });
    expect(tapOf(base.R0)).toEqual({ kind: 'kp', symbol: 'z' });
    expect(layoutCategory(layout)).toBe('thumb_alpha');
  });
});

/**
 * A layout written in code is its author's design: the letters and marks its author places on the
 * base layer, and its author's thumbs, or a space key where its author leaves the thumbs to a space
 * bar. It has no layer, combo or key its author does not have.
 */
describe('layouts as their authors designed them', () => {
  const written = new Map([...CLASSIC_DEFS, ...SMALL_DEFS].map((d) => [d.id, d] as const));
  const alone = BUNDLED_LAYOUTS.filter((l) => l.layers.length === 1 && written.has(l.id ?? ''));
  const thumbKeys = (layout: (typeof BUNDLED_LAYOUTS)[number]) =>
    Object.keys(layout.layers[0].bindings).filter((k) => /^[LR]\d$/.test(k));
  const typed = (b: Binding | undefined) => (b?.kind === 'hold_tap' ? b.tap : b);

  it('are every layout of the Library whose author defines no layer past its letters', () => {
    expect(alone.map((l) => l.id).sort()).toEqual(
      [
        'aptmak',
        'aptv3',
        'bird',
        'bird-30',
        'canary',
        'colemak',
        'colemak-dh',
        'dusk',
        'dvorak',
        'engram',
        'focal',
        'gallium',
        'graphite',
        'hands-down-neu',
        'nerps',
        'night',
        'nordrassil',
        'qwerty',
        'recurva',
        'snth',
        'sturdy',
        'sunlight',
        'uno',
      ].sort(),
    );
    // Special by what is theirs, a twenty-six-key board and adaptive keys, and by no layer.
    expect(
      alone
        .filter((l) => layoutCategory(l) === 'special')
        .map((l) => l.id)
        .sort(),
    ).toEqual(['bird', 'nordrassil', 'uno']);
  });

  it.each(alone.map((l) => [l.id ?? l.name, l] as const))(
    '%s is its definition, with no layer, combo or Repeat key besides',
    (id, layout) => {
      const def = written.get(id);
      if (!def) throw new Error(`no definition for ${id}`);
      expect(layout).toEqual({ ...classicLayout(def), languages: [...(def.languages ?? ['en'])] });
      expect(layout.combos ?? []).toEqual([]);
      expect(layout.conditionalLayers ?? []).toEqual([]);
      expect(Object.values(layout.layers[0].bindings).some((b) => b.kind === 'key_repeat')).toBe(
        false,
      );
    },
  );

  it('put space on the outer left thumb where the author leaves the thumbs to a space bar', () => {
    for (const id of [
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
    ]) {
      const layout = bundledLayout(id) as (typeof BUNDLED_LAYOUTS)[number];
      expect([id, thumbKeys(layout)]).toEqual([id, ['L1']]);
      expect(layout.layers[0].bindings.L1).toEqual({ kind: 'kp', symbol: ' ' });
    }
  });

  it("have the letters and marks their authors' sources draw, a key their source leaves empty empty", () => {
    const COLUMNS = ['P', 'R', 'M', 'I', 'C'];
    const rowOf = (layout: (typeof BUNDLED_LAYOUTS)[number], r: 'T' | 'H' | 'B') =>
      [...COLUMNS.map((c) => `L${r}${c}`), ...[...COLUMNS].reverse().map((c) => `R${r}${c}`)]
        .map((k) => {
          const b = typed(layout.layers[0].bindings[k]);
          return b?.kind === 'kp' ? b.symbol : '·';
        })
        .join(' ');
    const SOURCES: Record<string, [string, string, string]> = {
      // The Hands Down site's grid, whose eleventh column holds `z` and `j`: it has no `;`.
      'hands-down-neu': ['w f m p v / . q " \'', 'r s n t b , a e i h', 'x c l d g - u o y k'],
      // The grid on the author's site.
      night: ['b f l k q p g o u .', 'n s h t m y c a e i', "x v j d z ' w / ; ,"],
      // The author's own page: its last key is free, and holds `_`.
      dusk: ["x f d p q j ' o u .", 'n s t c y m h a e i', 'b v k g w z l _ / ,'],
      // Its ortho form: `'` is the right pinky key of the top row, and there is no `;`.
      canary: ["w l y p b z f o u '", 'c r s t g m n e i a', 'q j v d k x h / , .'],
      // The Layouts Doc's angle-mod rows, with `q` on the bottom row and no `-`.
      nerps: ['x l d p v z k o u ;', 'n r t s g y h e i a', "j m c w q b f ' , ."],
      // Its README draws no `q` or `z`: they are on the inner bottom keys, as cmini has them, and the
      // pinky bottom keys have nothing.
      aptmak: ["v w f p b j l u y '", 'r s t h k x n a i o', '· c g d q z m , . ·'],
    };
    for (const [id, rows] of Object.entries(SOURCES)) {
      const layout = bundledLayout(id) as (typeof BUNDLED_LAYOUTS)[number];
      expect([id, ...(['T', 'H', 'B'] as const).map((r) => rowOf(layout, r))]).toEqual([
        id,
        ...rows,
      ]);
    }
  });

  it("put Hands Down Neu's z and j, from its eleventh column, and Aptmak's e on a right thumb", () => {
    const thumbsOf = (id: string) => {
      const layout = bundledLayout(id) as (typeof BUNDLED_LAYOUTS)[number];
      return Object.fromEntries(
        thumbKeys(layout).map((k) => {
          const b = typed(layout.layers[0].bindings[k]);
          return [k, b?.kind === 'kp' ? b.symbol : undefined];
        }),
      );
    };
    expect(thumbsOf('hands-down-neu')).toEqual({ L1: ' ', L0: 'z', R0: 'j' });
    expect(thumbsOf('aptmak')).toStrictEqual({ L1: ' ', R0: 'e' });
  });

  it('give Night and Dusk the thumbs their author draws: r left, space right, and Night its Shifts', () => {
    const night = bundledLayout('night')?.layers[0].bindings ?? {};
    const shift: Binding = {
      kind: 'hold_tap',
      tap: { kind: 'none' },
      hold: { kind: 'mod', mod: 'LSHIFT' },
    };
    expect([night.L1, night.L0, night.R0, night.R1]).toEqual([
      shift,
      { kind: 'kp', symbol: 'r' },
      { kind: 'kp', symbol: ' ' },
      shift,
    ]);
    expect(bundledLayout('night')?.keys.shift).toEqual({ key: 'R1', kind: 'hold' });
    const dusk = bundledLayout('dusk')?.layers[0].bindings ?? {};
    expect([dusk.L1, dusk.L0, dusk.R0, dusk.R1]).toEqual([
      undefined,
      { kind: 'kp', symbol: 'r' },
      { kind: 'kp', symbol: ' ' },
      undefined,
    ]);
  });

  it('keep the mark their author has where another layout would put a Repeat key', () => {
    const at = (id: string, key: string) => typed(bundledLayout(id)?.layers[0].bindings[key]);
    expect(at('hands-down-neu', 'RTC')).toEqual({ kind: 'kp', symbol: '/' });
    expect(at('engram', 'RBC')).toEqual({ kind: 'kp', symbol: '?' });
    expect(at('sunlight', 'RBC')).toEqual({ kind: 'kp', symbol: '=' });
  });

  it('type a doubled letter by pressing its key twice, and an accent not at all', () => {
    const OPTS = { caseMode: 'fold', crossWord: 'reset' } as const;
    const compiled = compileLayout(bundledLayout('qwerty') as (typeof BUNDLED_LAYOUTS)[number]);
    const keys = (text: string) =>
      explain(compiled, text, OPTS)
        .steps.filter((s) => s.kind !== 'hold_release')
        .map((s) => s.key);
    expect(keys('book')).toEqual(['LBC', 'RTR', 'RTR', 'RHM']);
    expect(keys('é')).toEqual([]);
  });
});
