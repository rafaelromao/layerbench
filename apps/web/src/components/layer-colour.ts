import { LAYER_COLORS, type LayerColor } from '@layerbench/core';

/**
 * The colour a layer is drawn in — its tab's dot, the keys that reach it, the ring on the keys that
 * do — as a CSS value: the colour it chose, or else the one its place in the list gives it. The
 * base layer keeps the text colour it always had, unless it chose one.
 *
 * Every colour is a palette variable with a light and a dark shade (`index.css`), so a chosen one
 * keeps the contrast the palette was tuned for.
 */
export function layerColourOf(idx: number, color?: LayerColor): string | undefined {
  if (color) return `var(--lb-layer-${LAYER_COLORS.indexOf(color) + 1})`;
  if (idx <= 0) return undefined;
  return `var(--lb-layer-${((idx - 1) % LAYER_COLORS.length) + 1})`;
}
