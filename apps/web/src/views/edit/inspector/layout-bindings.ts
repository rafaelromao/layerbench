import {
  type Binding,
  bindingToJson,
  type CompiledLayout,
  type Layout,
  legend,
  legendText,
  stableStringify,
} from '@layerbench/core';

export interface UsedBinding {
  binding: Binding;
  /** How many places in the layout carry it: keys on every layer, and combo outputs. */
  count: number;
}

/** An adaptive key or alt repeat, on its own or as the tap of a tap-hold. */
function isAdaptiveKey(b: Binding): boolean {
  if (b.kind === 'adaptive') return true;
  if (b.kind === 'lt' || b.kind === 'hold_tap') return isAdaptiveKey(b.tap);
  return false;
}

/**
 * Every distinct binding the layout already uses, its adaptive keys and alt repeats first and then
 * the most used — so any key of the layout can be put on another key. An adaptive key is what an
 * author most often wants again elsewhere, and among a layout's hundred bindings it would
 * otherwise wait behind "All".
 *
 * Transparent and empty keys are left out: the inspector offers both directly.
 */
export function usedBindings(layout: Layout): UsedBinding[] {
  const seen = new Map<string, UsedBinding>();
  const add = (b: Binding | undefined) => {
    if (!b || b.kind === 'trans' || b.kind === 'none') return;
    const key = stableStringify(bindingToJson(b));
    const hit = seen.get(key);
    if (hit) hit.count++;
    else seen.set(key, { binding: b, count: 1 });
    // An adaptive key under a hold, a home row mod's, is one of the layout's adaptive keys too.
    if ((b.kind === 'hold_tap' || b.kind === 'lt') && isAdaptiveKey(b.tap)) add(b.tap);
  };
  for (const layer of layout.layers) {
    for (const [keyId, b] of Object.entries(layer.bindings)) if (keyId !== '*') add(b);
  }
  for (const combo of layout.combos ?? []) add(combo.binding);
  const rank = (u: UsedBinding) => (isAdaptiveKey(u.binding) ? 0 : 1);
  return [...seen.values()].sort((a, b) => rank(a) - rank(b) || b.count - a.count);
}

/** A binding as a chip shows it: its legend, or its kind when it has none to draw. */
export function chipLabel(compiled: CompiledLayout, b: Binding): string {
  return legendText(legend(compiled, b)) || b.kind;
}
