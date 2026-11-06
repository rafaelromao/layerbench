import { toCanonicalJson } from '../layout/json.js';
import { safeParseLayout } from '../layout/schema.js';
import type { Layout } from '../layout/types.js';
import nordwind from './documents/nordwind.json';

/**
 * Bundled layouts added as documents: each file in `documents/` is a layout exactly as LayerBench
 * saves it, its LayerBench JSON, named by its id. This is how a custom layout joins the Library, by a
 * pull request (README → Bundled layouts): the file, one import and one entry below, and a line on
 * the landing page.
 */
const DOCUMENTS: Record<string, unknown> = {
  nordwind,
};

/**
 * The document without `features.capsWord`, which documents saved before caps word was only a
 * behaviour declare, in the order it was written in; itself when it declares none. Reading turns that
 * declaration into the mod morph it made, so it is the one thing a document may hold that LayerBench
 * no longer saves.
 */
function withoutCapsWord(doc: unknown): unknown {
  if (typeof doc !== 'object' || doc === null) return doc;
  const features = (doc as { features?: unknown }).features;
  if (typeof features !== 'object' || features === null || !('capsWord' in features)) return doc;
  const { capsWord: _declared, ...others } = features as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(doc).flatMap(([key, value]) => {
      if (key !== 'features') return [[key, value]];
      return Object.keys(others).length > 0 ? [[key, others]] : [];
    }),
  );
}

/**
 * The layout a document holds, checked: exactly what LayerBench saves, so what is reviewed is what
 * ships; named by its id; and saying who made it. Its link, to where it comes from, is optional;
 * the schema holds one that is given to an http(s) URL. A document saved with caps word declared as
 * a feature is read as it is everywhere, with the morph written out, and is held to the saved form
 * in all else, so a layout already in the Library does not leave it.
 */
export function documentLayout(file: string, doc: unknown): Layout {
  const parsed = safeParseLayout(doc);
  if (!parsed.ok) throw new Error(`${file}.json is not a layout: ${parsed.error}`);
  const layout = parsed.layout;
  if (layout.id !== file) {
    throw new Error(`${file}.json holds the layout "${layout.id}"; name the file by its id`);
  }
  const saved = withoutCapsWord(doc);
  const checked = saved === doc ? parsed : safeParseLayout(saved);
  if (!checked.ok || JSON.stringify(toCanonicalJson(checked.layout)) !== JSON.stringify(saved)) {
    throw new Error(
      `${file}.json is not as LayerBench saves it; copy it from the editor's JSON panel`,
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
