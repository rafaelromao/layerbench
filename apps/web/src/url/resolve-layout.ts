import { bundledLayout, type Layout } from '@layerbench/core';
import { decodeInline } from './inline.js';
import { parseLayoutRef } from './params.js';

export type ResolvedLayout = { ok: true; layout: Layout } | { ok: false; error: string };

/**
 * Turn a `?layout=` reference into a layout. Saved layouts are read through the storage adapter,
 * which the library and editor supply; without one, only bundled and inline references resolve.
 */
export async function resolveLayoutRef(
  ref: string,
  loadSaved?: (id: string) => Promise<Layout | null>,
): Promise<ResolvedLayout> {
  const parsed = parseLayoutRef(ref);

  if (parsed.kind === 'inline') {
    const decoded = await decodeInline(parsed.value);
    return decoded.ok ? { ok: true, layout: decoded.layout } : { ok: false, error: decoded.error };
  }

  if (parsed.kind === 'saved') {
    if (!loadSaved) return { ok: false, error: `layout ${parsed.value} not found` };
    try {
      const layout = await loadSaved(parsed.value);
      return layout
        ? { ok: true, layout }
        : { ok: false, error: `layout ${parsed.value} not found` };
    } catch (e) {
      return { ok: false, error: `storage error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  const bundled = bundledLayout(parsed.value);
  if (bundled) return { ok: true, layout: bundled };

  // A bare id may still name a saved layout, which is how short links work.
  if (loadSaved) {
    try {
      const layout = await loadSaved(parsed.value);
      if (layout) return { ok: true, layout };
    } catch {
      // fall through to the not-found message
    }
  }
  return { ok: false, error: `layout ${parsed.value} not found` };
}
