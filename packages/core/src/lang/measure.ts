import { bundledScores } from '../generate/engine.js';
import { librarySettings, loadSample } from '../generate/tables.js';
import { compileLayout } from '../layout/compile.js';
import type { Layout } from '../layout/types.js';
import { BUNDLED_LAYOUTS } from '../layouts/index.js';
import { producibleSymbols } from './coverage.js';
import {
  LANGUAGE_CORPORA,
  LANGUAGES_PRESET,
  PERFORMANCE_LANGUAGES,
  performsWell,
} from './performance.js';
import { coverLanguage, languageCovered } from './profiles.js';

/**
 * The languages of the bundled layouts measured with the engine, on the shipped corpora: Node only,
 * for `pnpm languages` and the test that holds the stored languages to it. Not exported from the
 * package, so the app never bundles the corpus loader.
 */

/** What each layout can type, worked out once whatever the language asked about. */
const producible = new WeakMap<Layout, Set<string>>();

function covers(layout: Layout, tag: string): boolean {
  let symbols = producible.get(layout);
  if (!symbols) {
    symbols = producibleSymbols(compileLayout(layout));
    producible.set(layout, symbols);
  }
  const coverage = coverLanguage(symbols, tag);
  return coverage !== undefined && languageCovered(coverage);
}

/** The bundled layouts, by id, that perform well in one language. */
export async function measureLanguage(tag: string): Promise<Set<string>> {
  const sample = await loadSample({
    settings: librarySettings(LANGUAGE_CORPORA[tag], LANGUAGES_PRESET),
  });
  const scores = bundledScores(sample);
  return performsWell(
    BUNDLED_LAYOUTS.map((layout) => {
      const id = layout.id as string;
      return { id, effort: scores.get(id)?.effort ?? Number.NaN, covers: covers(layout, tag) };
    }),
  );
}

/** Every bundled layout's languages, by id, in the order the layouts are listed. */
export async function measureLanguages(): Promise<Record<string, string[]>> {
  const byTag = new Map<string, Set<string>>();
  for (const tag of PERFORMANCE_LANGUAGES) byTag.set(tag, await measureLanguage(tag));
  const out: Record<string, string[]> = {};
  for (const layout of BUNDLED_LAYOUTS) {
    const id = layout.id as string;
    out[id] = PERFORMANCE_LANGUAGES.filter((tag) => byTag.get(tag)?.has(id));
  }
  return out;
}
