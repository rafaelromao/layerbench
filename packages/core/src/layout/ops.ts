import type { Binding, Layout } from './types.js';

/**
 * Exchange the bindings of two keys on one layer. A key with no explicit binding stays implicit, so
 * swapping an explicit key with an implicit one moves the binding rather than duplicating it.
 */
export function swapKeys(layout: Layout, layerIdx: number, from: string, to: string): Layout {
  const layer = layout.layers[layerIdx];
  if (!layer || from === to) return layout;
  const a: Binding | undefined = layer.bindings[from];
  const b: Binding | undefined = layer.bindings[to];
  const bindings: Record<string, Binding> = { ...layer.bindings };
  delete bindings[from];
  delete bindings[to];
  if (b !== undefined) bindings[from] = b;
  if (a !== undefined) bindings[to] = a;
  const layers = layout.layers.map((l, i) => (i === layerIdx ? { ...l, bindings } : l));
  return { ...layout, layers };
}
