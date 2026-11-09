import { describe, expect, it } from 'vitest';
import { getGeometryPreset } from '../geometry/presets.js';
import { producibleSymbols } from '../lang/coverage.js';
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
  const romaks = [magicRomak].map((l) => [l.name, l] as const);

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
  // A thumb that also holds a default layer still types its letter when tapped.
  const keyOf = (id: string, symbol: string) =>
    Object.entries(layout(id).layers[0].bindings).find(([, b]) => {
      const tap = b.kind === 'hold_tap' ? b.tap : b;
      return tap.kind === 'kp' && tap.symbol === symbol;
    })?.[0];

  it('puts each chord on the keys its source names', () => {
    // The layout's own chords for letters; the one to Accents goes with the default layers, and
    // those of its author's for symbols with its author's layers.
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

  it('are every Standard and Thumb Alpha layout of the Library but those with layers of their own', () => {
    expect(alone.map((l) => l.id).sort()).toEqual(
      [
        'aptmak',
        'aptv3',
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
        'qwerty',
        'recurva',
        'romak',
        'rsthd',
        'snth',
        'sturdy',
        'sunlight',
      ].sort(),
    );
    expect(alone.map((l) => layoutCategory(l)).every((c) => c !== 'special')).toBe(true);
    expect(layoutCategory(romak)).toBe('standard');
    expect(romak).toMatchObject({ id: 'romak', name: 'Romak' });
  });

  it.each(alone.map((l) => [l.id ?? l.name, l] as const))(
    '%s is its definition, with no layer, combo or Repeat key besides',
    (id, layout) => {
      const def = written.get(id);
      if (!def) throw new Error(`no definition for ${id}`);
      expect(layout).toEqual({ ...classicLayout(def), languages: layout.languages });
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
      'romak',
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
      // Its ortho form, with `'` past the right pinky of the top row.
      canary: ["w l y p b z f o u '", 'c r s t g m n e i a', 'q j v d k x h / , .'],
      // The Layouts Doc's angle-mod rows, which keep `q` on the bottom row.
      nerps: ['x l d p v z k o u ;', 'n r t s g y h e i a', "j m c w q b f ' , ."],
      // Its README: `q` and `z` are on the inner bottom keys, the pinky bottom keys have nothing.
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

  it("put the thumb letters their authors' boards have in an eleventh column on thumbs", () => {
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
    expect(thumbsOf('aptmak')).toEqual({ L1: ' ', L0: 'e' });
    expect(thumbsOf('nerps')).toEqual({ L1: ' ' });
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
