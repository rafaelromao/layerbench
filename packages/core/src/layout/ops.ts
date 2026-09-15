import type { Binding, Layout } from './types.js';

/**
 * The binding a key carries on one layer *as authored*. A key with no entry of its own returns
 * `undefined` even though the compiled layer shows it as `trans` (or `none` on the base layer):
 * the difference is exactly what these operations have to preserve.
 */
export function keyBinding(layout: Layout, layerIdx: number, keyId: string): Binding | undefined {
  return layout.layers[layerIdx]?.bindings[keyId];
}

/**
 * Put a binding on a key, or take its binding away with `undefined`. Removing the entry rather
 * than writing a `trans` is what keeps an implicit key implicit, so an upper layer goes on falling
 * through to the one below it.
 */
export function setKeyBinding(
  layout: Layout,
  layerIdx: number,
  keyId: string,
  binding: Binding | undefined,
): Layout {
  const layer = layout.layers[layerIdx];
  if (!layer) return layout;
  const bindings: Record<string, Binding> = { ...layer.bindings };
  if (binding === undefined) delete bindings[keyId];
  else bindings[keyId] = binding;
  const layers = layout.layers.map((l, i) => (i === layerIdx ? { ...l, bindings } : l));
  return { ...layout, layers };
}

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

/** Put what `from` carries onto `to`, leaving `from` as it was. Overwrites whatever `to` held. */
export function copyKey(layout: Layout, layerIdx: number, from: string, to: string): Layout {
  if (from === to) return layout;
  return setKeyBinding(layout, layerIdx, to, keyBinding(layout, layerIdx, from));
}

/**
 * Send a key's binding to the same position on another layer. Moving clears the source, which is
 * what makes dragging a key onto a layer tab feel like moving it there rather than duplicating it.
 */
export function sendKeyToLayer(
  layout: Layout,
  fromLayerIdx: number,
  toLayerIdx: number,
  keyId: string,
  mode: 'copy' | 'move',
): Layout {
  if (fromLayerIdx === toLayerIdx) return layout;
  if (!layout.layers[fromLayerIdx] || !layout.layers[toLayerIdx]) return layout;
  const binding = keyBinding(layout, fromLayerIdx, keyId);
  const moved = setKeyBinding(layout, toLayerIdx, keyId, binding);
  return mode === 'move' ? setKeyBinding(moved, fromLayerIdx, keyId, undefined) : moved;
}
