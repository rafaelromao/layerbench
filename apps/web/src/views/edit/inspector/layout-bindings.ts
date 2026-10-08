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
  if (b.kind === 'adaptive') return !b.ref;
  if (b.kind === 'lt' || b.kind === 'hold_tap') return isAdaptiveKey(b.tap);
  return false;
}

/**
 * Every distinct binding the layout already uses, its adaptive keys and alt repeats first and then
 * the most used — so any key of an imported layout can be put on another key, including ones
 * LayerBench keeps but does not simulate. An adaptive key is what an author most often wants again
 * elsewhere, and among a layout's hundred bindings it would otherwise wait behind "All".
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
  };
  for (const layer of layout.layers) {
    for (const [keyId, b] of Object.entries(layer.bindings)) if (keyId !== '*') add(b);
  }
  for (const combo of layout.combos ?? []) add(combo.binding);
  for (const name of Object.keys(layout.behaviors ?? {})) add({ kind: 'ref', ref: name });
  const rank = (u: UsedBinding) => (isAdaptiveKey(u.binding) ? 0 : 1);
  return [...seen.values()].sort((a, b) => rank(a) - rank(b) || b.count - a.count);
}

/** A binding as a chip shows it: its legend, or its name when it has none to draw. */
export function chipLabel(compiled: CompiledLayout, b: Binding): string {
  const target = b.kind === 'ref' ? compiled.expanded.behaviors?.[b.ref] : b;
  const text = target ? legendText(legend(compiled, target)) : '';
  if (b.kind === 'ref') return text ? `${text} (${b.ref})` : `&${b.ref}`;
  return text || b.kind;
}
