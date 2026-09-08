import type { CompiledLayout } from '../layout/compile.js';
import { enumerateProducers } from '../sim/producers.js';
import type { LanguageCoverage } from './profiles.js';
import { coverLanguage } from './profiles.js';

/**
 * Every single character the layout can type, in either case.
 *
 * Built from the producer index, so it counts anything the simulator would actually reach: plain
 * keys, macros, adaptive branches, combos and typing combos alike. Multi-character producers
 * contribute their graphemes, because a word needing `ã` is satisfied by the `ão` macro.
 */
export function producibleSymbols(compiled: CompiledLayout): Set<string> {
  const out = new Set<string>();
  const index = enumerateProducers(compiled, 'model');
  const add = (symbols: string) => {
    for (const g of symbols.normalize('NFC')) {
      out.add(g);
      out.add(g.toLowerCase());
    }
  };
  for (const [symbol, producers] of index.bySymbol) {
    if (producers.length > 0) add(symbol);
  }
  // A producer excluded in fold mode still exists on the keymap; a shift press reaches it.
  for (const p of index.excludedByCase) add(p.symbols);
  return out;
}

/**
 * What the layout cannot type of a given language.
 *
 * Known limitation: this reflects what the *resolver* can reach, and `staticOutputs` yields no
 * producer for a `dead_key` binding or a keycode-only `kp`. So a layout that relies on host dead
 * keys to compose its accents reports them as missing, even though `composeDeadKey` models the
 * composition. Keeping coverage and simulation in agreement matters more than flattering the
 * report, so this stays until producer enumeration learns about host locales.
 */
export function layoutLanguageCoverage(
  compiled: CompiledLayout,
  tag: string,
): LanguageCoverage | undefined {
  return coverLanguage(producibleSymbols(compiled), tag);
}

/** Coverage for every language a layout declares, plus any extra tags asked about. */
export function layoutLanguages(
  compiled: CompiledLayout,
  extra: string[] = [],
): LanguageCoverage[] {
  const tags = new Set([...(compiled.layout.languages ?? []), ...extra]);
  const producible = producibleSymbols(compiled);
  const out: LanguageCoverage[] = [];
  for (const tag of tags) {
    const c = coverLanguage(producible, tag);
    if (c) out.push(c);
  }
  return out;
}
