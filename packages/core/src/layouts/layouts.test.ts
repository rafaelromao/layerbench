import { describe, expect, it } from 'vitest';
import { producibleSymbols } from '../lang/coverage.js';
import { layoutCategory } from '../layout/categories.js';
import { compileLayout } from '../layout/compile.js';
import type { Binding } from '../layout/types.js';
import { explain } from '../sim/resolver.js';
import {
  BUNDLED_LAYOUTS,
  bundledLayout,
  documentedLayouts,
  HOME_ROW_MODS,
  tapOf,
} from './index.js';
import { magicRomak, romak } from './romak.js';
import { BASE_SYMBOLS, MAIN_THUMBS } from './standard.js';

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
    // The layout's own chords; the one to Accents every layout has goes with the default layers.
    const chords = (id: string) =>
      Object.fromEntries(
        (layout(id).combos ?? [])
          .filter((c) => c.id !== 'accents')
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
 * The bundled Standard and Thumb Alpha layouts share their main thumbs and their base-layer symbols,
 * so that what tells them apart is their letters.
 */
describe('the standard thumbs', () => {
  const standard = BUNDLED_LAYOUTS.filter((l) => layoutCategory(l) !== 'special');
  const show = (b: Binding | undefined): string => {
    if (!b) return 'nothing';
    switch (b.kind) {
      case 'kp':
        return b.symbol === ' ' ? 'space' : (b.symbol ?? '');
      case 'key_repeat':
        return 'Repeat';
      case 'sl':
        return b.layer === 'accents' ? 'Accents' : `sl ${b.layer}`;
      case 'mod':
        return 'Shift';
      case 'mo':
        return { num: 'Numbers', sym: 'Symbols' }[b.layer] ?? b.layer;
      default:
        return b.kind;
    }
  };
  /** Each main thumb as tap / hold, left to right. */
  const thumbs = (id: string) => {
    const base = bundledLayout(id)?.layers[0].bindings ?? {};
    return MAIN_THUMBS.map((k) => {
      const b = base[k];
      return b?.kind === 'hold_tap' ? `${show(b.tap)} / ${show(b.hold)}` : `nothing / ${show(b)}`;
    });
  };

  it('are on Romak and every Standard and Thumb Alpha layout but Romak 24, which is gone', () => {
    expect(standard.length).toBe(27);
    expect(layoutCategory(romak)).toBe('standard');
    expect(romak).toMatchObject({ id: 'romak', name: 'Romak' });
    expect(BUNDLED_LAYOUTS.map((l) => l.id)).not.toContain('romak-34');
    expect(documentedLayouts().some((l) => l.id?.startsWith('romak-'))).toBe(false);
  });

  it.each(standard.map((l) => [l.id ?? l.name, l] as const))(
    '%s holds Shift, Numbers, Symbols and Shift on its main thumbs, and taps Accents on R1',
    (id) => {
      expect(thumbs(id).map((t) => t.split(' / ')[1])).toEqual([
        'Shift',
        'Numbers',
        'Symbols',
        'Shift',
      ]);
      expect(thumbs(id)[3]).toBe('Accents / Shift');
    },
  );

  it.each(standard.map((l) => [l.id ?? l.name, l] as const))(
    '%s keeps only letters, the four marks and Repeat on its base layer, and no other thumb key',
    (_id, layout) => {
      const main = new Set<string>(MAIN_THUMBS);
      // A home row mod types what its tap types.
      const taps = Object.entries(layout.layers[0].bindings).map(
        ([key, b]) => [key, key in HOME_ROW_MODS ? (tapOf(b) as Binding) : b] as const,
      );
      const kept = taps.filter(
        ([key, b]) =>
          !main.has(key) &&
          b.kind !== 'none' &&
          !(b.kind === 'kp' && /^[a-z]$/.test(b.symbol ?? '')) &&
          !(b.kind === 'kp' && BASE_SYMBOLS.includes(b.symbol ?? '') && !/^[LR]\d$/.test(key)) &&
          !(b.kind === 'key_repeat' && !/^[LR]\d$/.test(key)),
      );
      expect(kept).toEqual([]);
      expect(layout.combos?.some((c) => c.id === 'accents') ?? false).toBe(false);
    },
  );

  it('tap Repeat, space, the first thumb letter or nothing, and Accents where LayerBench placed them', () => {
    expect(thumbs('qwerty')).toEqual([
      'Repeat / Shift',
      'space / Numbers',
      'nothing / Symbols',
      'Accents / Shift',
    ]);
    expect(thumbs('romak')).toEqual(thumbs('qwerty'));
    expect(thumbs('night')[2]).toBe('r / Symbols');
  });

  it('give L1 to a second thumb letter, and Repeat a key the symbols left', () => {
    expect(thumbs('hands-down-neu').slice(0, 3)).toEqual([
      'j / Shift',
      'space / Numbers',
      'z / Symbols',
    ]);
    expect(bundledLayout('hands-down-neu')?.layers[0].bindings.RTC).toEqual({ kind: 'key_repeat' });
    expect(thumbs('sunlight').slice(0, 3)).toEqual(['j / Shift', 'space / Numbers', 'r / Symbols']);
    expect(bundledLayout('sunlight')?.layers[0].bindings.RBC).toEqual({ kind: 'key_repeat' });
  });

  it('keep the space and letters their authors placed, and give the rest Accents, then Repeat', () => {
    const authored = (letter: string) => [
      'Repeat / Shift',
      `${letter} / Numbers`,
      'space / Symbols',
      'Accents / Shift',
    ];
    expect(thumbs('hands-down-gold')).toEqual(authored('t'));
    expect(thumbs('hands-down-promethium')).toEqual(authored('r'));
    expect(thumbs('hands-down-vibranium')).toEqual(authored('r'));
    expect(thumbs('rsthd')).toEqual(authored('e'));
    expect(thumbs('nordwind')).toEqual(authored('s'));
    expect(thumbs('enthium')).toEqual([
      'Repeat / Shift',
      'space / Numbers',
      'r / Symbols',
      'Accents / Shift',
    ]);
    const enthium = bundledLayout('enthium')?.layers[0].bindings ?? {};
    expect([enthium.L2, enthium.R2]).toEqual([undefined, undefined]);
  });

  it('type a doubled letter with Repeat, and an accent through the one-shot on R1', () => {
    const OPTS = { caseMode: 'fold', crossWord: 'reset' } as const;
    const compiled = compileLayout(bundledLayout('qwerty') as (typeof BUNDLED_LAYOUTS)[number]);
    const keys = (text: string) =>
      explain(compiled, text, OPTS)
        .steps.filter((s) => s.kind !== 'hold_release')
        .map((s) => s.key);
    expect(keys('book')).toEqual(['LBC', 'RTR', 'L1', 'RHM']);
    expect(keys('é')).toEqual(['R1', 'RHM']);
    // `/` left the base layer for Symbols.
    expect(keys('/')).toEqual(['R0', 'RBM']);
  });
});
