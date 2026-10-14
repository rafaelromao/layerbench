import { isDocumentId } from '@layerbench/core';

/**
 * How a link names a saved document — a layout, a rule set or a text — by its id: `saved:<id>`.
 * This is the only place that spells it.
 */
const SAVED = 'saved:';

export function savedRef(id: string): string {
  return `${SAVED}${id}`;
}

/**
 * The id a reference names a saved document by, or null when it names none: a preset, a bundled
 * layout or text, a layout carried whole, or anything after `saved:` that is not a document id.
 */
export function savedId(ref: string): string | null {
  if (!ref.startsWith(SAVED)) return null;
  const id = ref.slice(SAVED.length);
  return isDocumentId(id) ? id : null;
}
