import {
  type CompiledLayout,
  compileLayout,
  type Layout,
  type StorageAdapter,
  safeParseLayout,
} from '@layoutmaster/core';
import { useEffect, useMemo, useState } from 'react';
import { useStorage } from '../storage/use-storage.js';
import { resolveLayoutRef } from '../url/resolve-layout.js';

export interface LayoutState {
  layout: Layout | null;
  compiled: CompiledLayout | null;
  error: string | null;
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
  const [resolved, setResolved] = useState<{ layout: Layout | null; error: string | null }>({
    layout: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    resolveLayoutRef(ref, savedLayoutLoader(storage)).then((r) => {
      if (cancelled) return;
      setResolved(r.ok ? { layout: r.layout, error: null } : { layout: null, error: r.error });
    });
    return () => {
      cancelled = true;
    };
  }, [ref, storage]);

  return useMemo(() => {
    if (!resolved.layout) return { layout: null, compiled: null, error: resolved.error };
    try {
      return { layout: resolved.layout, compiled: compileLayout(resolved.layout), error: null };
    } catch (e) {
      return {
        layout: resolved.layout,
        compiled: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }, [resolved]);
}
