import {
  type CompiledLayout,
  compileLayout,
  type FeatureKind,
  type Layout,
  typedLayout,
} from '@layerbench/core';
import { useEffect, useMemo, useState } from 'react';
import { type Opened, openLayout } from '../layout-session/open.js';
import { useStorage } from '../storage/use-storage.js';

export interface LayoutState {
  layout: Layout | null;
  compiled: CompiledLayout | null;
  /** The saved layout it is, if any (`openLayout`). */
  storedId: string | null;
  error: string | null;
  /**
   * The reference the layout and error belong to, null until one resolves. While another one is
   * being read the previous result stays, so a view can keep showing it; one that must not start
   * from it compares this with the reference it asked for.
   */
  ref: string | null;
}

/** Open a reference (`openLayout`) and compile it. Inline layouts decompress, so this is async. */
export function useLayout(ref: string): LayoutState {
  const storage = useStorage();
  const [resolved, setResolved] = useState<{ ref: string | null; opened: Opened | null }>({
    ref: null,
    opened: null,
  });

  useEffect(() => {
    let cancelled = false;
    openLayout(ref, storage).then((opened) => {
      if (!cancelled) setResolved({ ref, opened });
    });
    return () => {
      cancelled = true;
    };
  }, [ref, storage]);

  return useMemo(() => {
    const { ref: of, opened } = resolved;
    if (!opened?.ok) {
      return {
        layout: null,
        compiled: null,
        storedId: null,
        error: opened?.error ?? null,
        ref: of,
      };
    }
    const { layout, storedId } = opened;
    try {
      return { layout, compiled: compileLayout(layout), storedId, error: null, ref: of };
    } catch (e) {
      return {
        layout,
        compiled: null,
        storedId,
        error: e instanceof Error ? e.message : String(e),
        ref: of,
      };
    }
  }, [resolved]);
}

/**
 * The layout as it is typed without the special features a link leaves out (`off=`), as the engine
 * types it from the analysis settings: Analyze and Compare draw, light and explain this, so a
 * board's heat lands on the keys it was measured on.
 */
export function useTypedLayout<C extends CompiledLayout | null>(
  compiled: C,
  without: readonly FeatureKind[],
): C {
  const off = without.join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: `off` is the content of `without`
  return useMemo(
    () => (compiled ? typedLayout(compiled, without) : compiled) as C,
    [compiled, off],
  );
}
