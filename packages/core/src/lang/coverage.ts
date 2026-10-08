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
 * This reflects what the *resolver* can reach. A `dead_key` binding counts, with every letter it
 * composes with on the layout; a keycode-only `kp` does not, since producer enumeration knows
 * nothing of host locales. So a layout relying on the host's US-International or ABNT2 dead keys
 * still reports those accents as missing. Keeping coverage and simulation in agreement matters more
 * than flattering the report.
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
