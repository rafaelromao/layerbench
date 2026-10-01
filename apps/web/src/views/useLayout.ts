import {
  type CompiledLayout,
  compileLayout,
  type FeatureKind,
  type Layout,
  type StorageAdapter,
  safeParseLayout,
  withoutFeatures,
} from '@layoutmaster/core';
import { useEffect, useMemo, useState } from 'react';
import { useStorage } from '../storage/use-storage.js';
import { resolveLayoutRef } from '../url/resolve-layout.js';

export interface LayoutState {
  layout: Layout | null;
  compiled: CompiledLayout | null;
  error: string | null;
  /**
   * The reference the layout and error belong to, null until one resolves. While another one is
   * being read the previous result stays, so a view can keep showing it; one that must not start
   * from it, like the editor, compares this with the reference it asked for.
   */
  ref: string | null;
}

/** Read a saved layout document and parse it. */
export function savedLayoutLoader(storage: StorageAdapter) {
  return async (id: string): Promise<Layout | null> => {
    const stored = await storage.get('layouts', id);
    if (!stored) return null;
    const parsed = safeParseLayout(stored.doc);
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.layout;
  };
}

/** Resolve a `?layout=` reference and compile it. Inline layouts decompress, so this is async. */
export function useLayout(ref: string): LayoutState {
  const storage = useStorage();
  const [resolved, setResolved] = useState<{
    ref: string | null;
    layout: Layout | null;
    error: string | null;
  }>({ ref: null, layout: null, error: null });

  useEffect(() => {
    let cancelled = false;
    resolveLayoutRef(ref, savedLayoutLoader(storage)).then((r) => {
      if (cancelled) return;
      setResolved(
        r.ok ? { ref, layout: r.layout, error: null } : { ref, layout: null, error: r.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [ref, storage]);

  return useMemo(() => {
    const { ref: of, layout, error } = resolved;
    if (!layout) return { layout: null, compiled: null, error, ref: of };
    try {
      return { layout, compiled: compileLayout(layout), error: null, ref: of };
    } catch (e) {
      return {
        layout,
        compiled: null,
        error: e instanceof Error ? e.message : String(e),
        ref: of,
      };
    }
  }, [resolved]);
}

/**
 * The layout as it is typed without the special features a link leaves out (`off=`), which is how
 * the Library ranks it: Analyze and Compare analyze, draw and explain this, so their numbers match
 * the card's. A layout that will not compile without them is typed as authored.
 */
export function useTypedLayout(
  layout: Layout | null,
  compiled: CompiledLayout | null,
  without: readonly FeatureKind[],
): { layout: Layout | null; compiled: CompiledLayout | null } {
  return useMemo(() => {
    if (!layout || without.length === 0) return { layout, compiled };
    const plain = withoutFeatures(layout, without);
    try {
      return { layout: plain, compiled: compileLayout(plain) };
    } catch {
      return { layout, compiled };
    }
  }, [layout, compiled, without]);
}
