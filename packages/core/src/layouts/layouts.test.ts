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
