import type { GeometryKey } from './types.js';

export type DistanceModel = 'euclid' | 'squared' | 'manhattan';

/** Distance between two keys in U, or null when the keys are on different hands (undefined per spec §6.1). */
export function keyDistance(
  a: GeometryKey,
  b: GeometryKey,
  model: DistanceModel = 'euclid',
): number | null {
  if (a.hand !== b.hand) return null;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  switch (model) {
    case 'euclid':
      return Math.sqrt(dx * dx + dy * dy);
    case 'squared':
      return dx * dx + dy * dy;
    case 'manhattan':
      return Math.abs(dx) + Math.abs(dy);
  }
}

export function xDistance(a: GeometryKey, b: GeometryKey): number | null {
  if (a.hand !== b.hand) return null;
  return Math.abs(a.x - b.x);
}

export function yDistance(a: GeometryKey, b: GeometryKey): number | null {
  if (a.hand !== b.hand) return null;
  return Math.abs(a.y - b.y);
}
