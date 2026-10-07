import { toCanonicalJson } from '../layout/json.js';
import { safeParseLayout } from '../layout/schema.js';
import type { Layout } from '../layout/types.js';

/**
 * Bundled layouts added as documents: each file in `documents/` is a layout exactly as LayerBench
 * saves it, its LayerBench JSON, named by its id. This is how a saved layout joins the Library, by a
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
  if (!layout.author?.trim()) throw new Error(`${file}.json names no author`);
  if (!/https?:\/\/\S/.test(layout.description ?? '')) {
    throw new Error(`${file}.json: its description gives no link to where the layout comes from`);
  }
  return layout;
}

export const DOCUMENT_LAYOUTS: Layout[] = Object.entries(DOCUMENTS).map(([file, doc]) =>
  documentLayout(file, doc),
);
