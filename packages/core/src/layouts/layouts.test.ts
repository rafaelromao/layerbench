import { describe, expect, it } from 'vitest';
import { producibleSymbols } from '../lang/coverage.js';
import { compileLayout } from '../layout/compile.js';
import { explain } from '../sim/resolver.js';
import { BUNDLED_LAYOUTS, documentedLayouts } from './index.js';
import { magicRomak, romak24, romak34 } from './romak.js';

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
  const romaks = [romak24, magicRomak, romak34].map((l) => [l.name, l] as const);

  it.each(romaks)('%s types every character the two layers carry', (_name, layout) => {
    const producible = producibleSymbols(compileLayout(layout));
    expect(KEYMAP_CHARACTERS.filter((c) => !producible.has(c))).toEqual([]);
  });

  it.each(romaks)(
    '%s reaches the digits by holding space, and the symbols by holding the Alpha 2 key',
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
 * The small-board layouts lean on more than their letter blocks: chords, magic and repeat keys, a
 * second letter layer. A chord on the wrong keys, or a magic key that never fires, still types the
 * alphabet, so these hold each to what its source says.
 */
describe('small-board layouts', () => {
  const OPTS = { caseMode: 'fold', crossWord: 'reset' } as const;
  const layout = (id: string) => {
    const found = BUNDLED_LAYOUTS.find((l) => l.id === id);
    if (!found) throw new Error(`no bundled layout ${id}`);
    return found;
  };
  const keyOf = (id: string, symbol: string) =>
    Object.entries(layout(id).layers[0].bindings).find(
      ([, b]) => b.kind === 'kp' && b.symbol === symbol,
    )?.[0];

  it('puts each chord on the keys its source names', () => {
    const chords = (id: string) =>
      Object.fromEntries(
        (layout(id).combos ?? []).map((c) => [
          c.id,
          c.keys.map((k) => {
            const b = layout(id).layers[0].bindings[k];
            return b.kind === 'kp' ? b.symbol : k;
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
    expect(keyOf('rsthd', 'e')).toBe('L1');
    expect(keyOf('t-34', 'e')).toBe('R0');
    expect(keyOf('enthium', 'r')).toBe('R0');
    expect(keyOf('nordrassil', 't')).toBe('R1');
    expect(keyOf('finch', 'e')).toBe('R0');
  });

  it('types with the magic key where Magic Sturdy rules say', () => {
    const compiled = compileLayout(layout('magic-sturdy'));
    const magic = Object.entries(layout('magic-sturdy').layers[0].bindings).find(
      ([, b]) => b.kind === 'adaptive',
    )?.[0];
    // After a space the magic key types "the" in one press.
    expect(explain(compiled, 'in the', OPTS).steps.map((s) => s.key)).toContain(magic);
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
