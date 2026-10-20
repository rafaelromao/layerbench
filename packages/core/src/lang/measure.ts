import { scoreLayout } from '../generate/engine.js';
import { librarySettings, loadSample } from '../generate/tables.js';
import { compileLayout } from '../layout/compile.js';
import type { Layout } from '../layout/types.js';
import { BUNDLED_LAYOUTS } from '../layouts/index.js';
import { layoutLanguageCoverage } from './coverage.js';
import {
  LANGUAGE_CORPORA,
  LANGUAGES_PRESET,
  PERFORMANCE_LANGUAGES,
  performsWell,
} from './performance.js';
import { languageCovered } from './profiles.js';

/**
 * The languages measured with the engine, on the shipped corpora: Node only, for `pnpm languages`
 * and the test that holds the stored languages to it. Not exported from the package, so the app
 * never bundles the corpus loader.
 */

/** The layouts, by id, that perform well in one language. */
export async function measureLanguage(
  tag: string,
  layouts: readonly Layout[] = BUNDLED_LAYOUTS,
): Promise<Set<string>> {
  const sample = await loadSample({
    settings: librarySettings(LANGUAGE_CORPORA[tag], LANGUAGES_PRESET),
  });
  return performsWell(
    layouts.map((layout) => {
      const coverage = layoutLanguageCoverage(compileLayout(layout), tag);
      return {
        id: layout.id as string,
        effort: scoreLayout(layout, sample).effort,
        covers: coverage !== undefined && languageCovered(coverage),
      };
    }),
  );
}

/** Every layout's languages, by id, in the order the layouts are given. */
export async function measureLanguages(
  layouts: readonly Layout[] = BUNDLED_LAYOUTS,
): Promise<Record<string, string[]>> {
  const byTag = new Map<string, Set<string>>();
  for (const tag of PERFORMANCE_LANGUAGES) byTag.set(tag, await measureLanguage(tag, layouts));
  const out: Record<string, string[]> = {};
  for (const layout of layouts) {
    const id = layout.id as string;
    out[id] = PERFORMANCE_LANGUAGES.filter((tag) => byTag.get(tag)?.has(id));
  }
  return out;
}
