import type { LayerColor } from '@layerbench/core';
import { layerColourOf } from './layer-colour.js';

/**
 * A small dot in the colour of a layer — the colour of the keys that reach it. The base layer
 * keeps the text colour unless it chose one, and so has no dot.
 */
export function LayerDot({
  idx,
  color,
  className = '',
}: {
  idx: number;
  color?: LayerColor;
  className?: string;
}) {
  const colour = layerColourOf(idx, color);
  if (!colour) return null;
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-2 rounded-full ${className}`}
      style={{ background: colour }}
    />
  );
}
