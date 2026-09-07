import { type CompiledLayout, compileLayout, type Layout } from '@layoutmaster/core';
import { useEffect, useMemo, useState } from 'react';
import { resolveLayoutRef } from '../url/resolve-layout.js';

export interface LayoutState {
  layout: Layout | null;
  compiled: CompiledLayout | null;
  error: string | null;
}

/** Resolve a `?layout=` reference and compile it. Inline layouts decompress, so this is async. */
export function useLayout(ref: string): LayoutState {
  const [resolved, setResolved] = useState<{ layout: Layout | null; error: string | null }>({
    layout: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    resolveLayoutRef(ref).then((r) => {
      if (cancelled) return;
      setResolved(r.ok ? { layout: r.layout, error: null } : { layout: null, error: r.error });
    });
    return () => {
      cancelled = true;
    };
  }, [ref]);

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
