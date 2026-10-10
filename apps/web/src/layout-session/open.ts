import {
  bundledLayout,
  isDocumentId,
  type Layout,
  type StorageAdapter,
  safeParseLayout,
  toCanonicalJson,
} from '@layerbench/core';
import { decodeInline } from '../url/inline.js';
import { parseLayoutRef } from '../url/params.js';

/** A layout a reference opened, and the saved layout it is, if any; or why it would not open. */
export type Opened =
  | { ok: true; layout: Layout; storedId: string | null }
  | { ok: false; error: string };

async function readSaved(storage: StorageAdapter, id: string): Promise<Layout | null> {
  const stored = await storage.get('layouts', id);
  if (!stored) return null;
  const parsed = safeParseLayout(stored.doc);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.layout;
}

const same = (a: Layout, b: Layout) =>
  JSON.stringify(toCanonicalJson(a)) === JSON.stringify(toCanonicalJson(b));

/**
 * Open a reference: a bundled layout's id, `saved:<id>`, an id alone, which names a saved layout when
 * no bundled one has it (how short links work), or `inline:` and the layout itself. Each says which
 * saved layout it is: a saved one is itself, and a layout carried whole is the one saved here under
 * the id it carries when that has the same contents — its owner's link, opened in another tab,
 * browser or device. Anything else, someone else's layout or one changed since the link was made, is
 * a layout of its own, so nothing saved here is ever overwritten by a link. Storage that cannot be
 * read leaves it a layout of its own too. Drafts are the layout session's to know: this does not.
 */
export async function openLayout(ref: string, storage: StorageAdapter): Promise<Opened> {
  const parsed = parseLayoutRef(ref);

  if (parsed.kind === 'inline') {
    const decoded = await decodeInline(parsed.value);
    if (!decoded.ok) return { ok: false, error: decoded.error };
    const { layout } = decoded;
    const id = layout.id;
    if (!id || !isDocumentId(id)) return { ok: true, layout, storedId: null };
    const stored = await readSaved(storage, id).catch(() => null);
    return { ok: true, layout, storedId: stored && same(stored, layout) ? id : null };
  }

  if (parsed.kind === 'bundled') {
    const bundled = bundledLayout(parsed.value);
    if (bundled) return { ok: true, layout: bundled, storedId: null };
    if (!isDocumentId(parsed.value))
      return { ok: false, error: `layout ${parsed.value} not found` };
  }

  const id = parsed.value;
  try {
    const layout = await readSaved(storage, id);
    return layout
      ? { ok: true, layout, storedId: id }
      : { ok: false, error: `layout ${id} not found` };
  } catch (e) {
    return { ok: false, error: `storage error: ${e instanceof Error ? e.message : String(e)}` };
  }
}
