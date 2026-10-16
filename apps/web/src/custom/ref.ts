import { isDocumentId } from '@layerbench/core';

/**
 * How a link names a custom document — a layout, a rule set or a text — by its id: `custom:<id>`.
 * This is the only place that spells it.
 */
const CUSTOM = 'custom:';

export function customRef(id: string): string {
  return `${CUSTOM}${id}`;
}

/**
 * The id a reference names a custom document by, or null when it names none: a preset, a bundled
 * layout or text, a layout carried whole, or anything after `custom:` that is not a document id.
 */
export function customId(ref: string): string | null {
  if (!ref.startsWith(CUSTOM)) return null;
  const id = ref.slice(CUSTOM.length);
  return isDocumentId(id) ? id : null;
}
