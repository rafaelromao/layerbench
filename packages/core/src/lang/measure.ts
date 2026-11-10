import { bundledScores } from '../generate/engine.js';
import { librarySettings, loadSample } from '../generate/tables.js';
import { BUNDLED_LAYOUTS } from '../layouts/index.js';
import {
  LANGUAGE_CORPORA,
  LANGUAGES_PRESET,
  PERFORMANCE_LANGUAGES,
  storedEffort,
} from './performance.js';

/**
 * The Effort of every bundled layout on each language's text, measured with the engine on the
 * shipped corpora: Node only, for `pnpm languages` and the test that holds the stored Efforts to
 * it. Not exported from the package, so the app never bundles the corpus loader.
 */

/** Every bundled layout's Effort on one language's text, by id. */
export async function bundledEfforts(tag: string): Promise<Map<string, number>> {
  const sample = await loadSample({
    settings: librarySettings(LANGUAGE_CORPORA[tag], LANGUAGES_PRESET),
  });
  const scores = bundledScores(sample);
  const out = new Map<string, number>();
  for (const layout of BUNDLED_LAYOUTS) {
    const id = layout.id as string;
    const effort = scores.get(id)?.effort ?? Number.NaN;
    if (!Number.isFinite(effort)) throw new Error(`${id} has no Effort on ${tag}`);
    out.set(id, effort);
  }
  return out;
}

/** Every bundled layout's Effort on one language's text, lowest first, as stored. */
export async function measureEfforts(tag: string): Promise<number[]> {
  return [...(await bundledEfforts(tag)).values()].map(storedEffort).sort((a, b) => a - b);
}

/** Every language's Efforts, in the order of the profiles. */
export async function measureAllEfforts(): Promise<Record<string, number[]>> {
  const out: Record<string, number[]> = {};
  for (const tag of PERFORMANCE_LANGUAGES) out[tag] = await measureEfforts(tag);
  return out;
}
