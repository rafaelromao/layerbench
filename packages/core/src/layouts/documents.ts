import { toCanonicalJson } from '../layout/json.js';
import { safeParseLayout } from '../layout/schema.js';
import type { Layout } from '../layout/types.js';

/**
 * Bundled layouts added as documents: each file in `documents/` is a layout exactly as LayerBench
 * saves it, its LayerBench JSON, named by its id. This is how a custom layout joins the Library, by a
 * pull request (README → Bundled layouts): the file, one import and one entry below, and a line on
 * the landing page.
 */
const DOCUMENTS: Record<string, unknown> = {};

/**
 * The document without `features`, which a document may declare for sentence case and caps word;
 * itself when it declares none. Reading turns those declarations into the sentence space and the
 * mod morph they make; LayerBench does not save them.
 */
function withoutDeclaredFeatures(doc: unknown): unknown {
  if (typeof doc !== 'object' || doc === null || !('features' in doc)) return doc;
  return Object.fromEntries(Object.entries(doc).filter(([key]) => key !== 'features'));
}

/**
 * The layout a document holds, checked: exactly what LayerBench saves, so what is reviewed is what
 * ships; named by its id; and saying who made it. Its link, to where it comes from, is optional;
 * the schema holds one that is given to an http(s) URL. A document saved with sentence case or caps
 * word declared as features is read as it is everywhere, with the behaviours written out on their
 * keys, and is held to the saved form in all else, so a layout already in the Library does not leave
 * it.
 */
export function documentLayout(file: string, doc: unknown): Layout {
  const parsed = safeParseLayout(doc);
  if (!parsed.ok) throw new Error(`${file}.json is not a layout: ${parsed.error}`);
  const layout = parsed.layout;
  if (layout.id !== file) {
    throw new Error(`${file}.json holds the layout "${layout.id}"; name the file by its id`);
  }
  const saved = withoutDeclaredFeatures(doc);
  const checked = saved === doc ? parsed : safeParseLayout(saved);
  if (!checked.ok || JSON.stringify(toCanonicalJson(checked.layout)) !== JSON.stringify(saved)) {
    throw new Error(
      `${file}.json is not as LayerBench saves it; copy it from the editor's Export panel`,
    );
  }
  const missing = documentMissing(layout);
  if (missing.includes('author')) throw new Error(`${file}.json names no author`);
  return layout;
}

/** What a layout lacks to be a document: who made it. */
export function documentMissing(layout: Pick<Layout, 'author'>): 'author'[] {
  return layout.author?.trim() ? [] : ['author'];
}

/** The ids of the layouts added as documents, without checking or building them. */
export const DOCUMENT_IDS: readonly string[] = Object.keys(DOCUMENTS);

export const DOCUMENT_LAYOUTS: Layout[] = Object.entries(DOCUMENTS).map(([file, doc]) =>
  documentLayout(file, doc),
);
