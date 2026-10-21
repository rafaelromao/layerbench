import type { Layout } from '../layout/types.js';
import { DOCUMENT_LAYOUTS, goldenLayouts } from '../layouts/index.js';
import { GOLDEN_LAYOUTS } from './report.js';

/**
 * The layouts whose documents `golden/layouts/` holds: those written in code, and any of the golden
 * set added as a document since, which the golden reports still read from there. A layout of the
 * set written in code may become a document when a maintainer changes it in the app.
 */
export function goldenDocuments(): Layout[] {
  const set: readonly string[] = GOLDEN_LAYOUTS;
  return [...goldenLayouts(), ...DOCUMENT_LAYOUTS.filter((l) => set.includes(l.id ?? ''))];
}
