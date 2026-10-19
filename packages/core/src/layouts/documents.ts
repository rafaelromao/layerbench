import { toCanonicalJson } from '../layout/json.js';
import { safeParseLayout } from '../layout/schema.js';
import type { Layout } from '../layout/types.js';

/**
 * Bundled layouts added as documents: each file in `documents/` is a layout exactly as LayerBench
 * saves it, its LayerBench JSON, named by its id. This is how a custom layout joins the Library, by a
 * pull request (README → Bundled layouts): the file, one import and one entry below, and a line on
 * the landing page.
 */
const DOCUMENTS: Record<string, unknown> = {
  // 'my-layout': myLayout, with `import myLayout from './documents/my-layout.json';` above.
};

/**
 * The layout a document holds, checked: exactly what LayerBench saves, so what is reviewed is what
 * ships; named by its id; and saying who made it and, with a link, where it comes from.
 */
export function documentLayout(file: string, doc: unknown): Layout {
  const parsed = safeParseLayout(doc);
  if (!parsed.ok) throw new Error(`${file}.json is not a layout: ${parsed.error}`);
  const layout = parsed.layout;
  if (layout.id !== file) {
    throw new Error(`${file}.json holds the layout "${layout.id}"; name the file by its id`);
  }
  if (JSON.stringify(toCanonicalJson(layout)) !== JSON.stringify(doc)) {
    throw new Error(
      `${file}.json is not as LayerBench saves it; copy it from the editor's JSON panel`,
    );
  }
  const missing = documentMissing(layout);
  if (missing.includes('author')) throw new Error(`${file}.json names no author`);
  if (missing.includes('link')) {
    throw new Error(`${file}.json: its description gives no link to where the layout comes from`);
  }
  return layout;
}

/** What a layout lacks to be a document: who made it, and a link to where it comes from. */
export function documentMissing(
  layout: Pick<Layout, 'author' | 'description'>,
): ('author' | 'link')[] {
  const missing: ('author' | 'link')[] = [];
  if (!layout.author?.trim()) missing.push('author');
  if (!/https?:\/\/\S/.test(layout.description ?? '')) missing.push('link');
  return missing;
}

/** The ids of the layouts added as documents, without checking or building them. */
export const DOCUMENT_IDS: readonly string[] = Object.keys(DOCUMENTS);

export const DOCUMENT_LAYOUTS: Layout[] = Object.entries(DOCUMENTS).map(([file, doc]) =>
  documentLayout(file, doc),
);
