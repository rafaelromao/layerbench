export type Direction = 'up' | 'down' | 'left' | 'right';

export interface NavKey {
  x: number;
  y: number;
}

const AXIS: Record<Direction, { primary: 'x' | 'y'; sign: 1 | -1 }> = {
  up: { primary: 'y', sign: -1 },
  down: { primary: 'y', sign: 1 },
  left: { primary: 'x', sign: -1 },
  right: { primary: 'x', sign: 1 },
};

/**
 * The key an arrow press should move to, by geometry rather than by row and column: a split board
 * has a gap in the middle of every row and its thumb cluster is rotated, so the canonical row/col
 * of a key says little about what sits next to it on screen.
 *
 * Candidates are the keys that lie in the direction asked for; the nearest one wins, with drift
 * across the axis counted triple so a straight neighbour beats a closer diagonal.
 */
export function nearestKey(
  keys: readonly NavKey[],
  from: number,
  direction: Direction,
): number | undefined {
  const origin = keys[from];
  if (!origin) return undefined;
  const { primary, sign } = AXIS[direction];
  const cross = primary === 'x' ? 'y' : 'x';

  let best: number | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < keys.length; i++) {
    if (i === from) continue;
    const advance = (keys[i][primary] - origin[primary]) * sign;
    if (advance <= 0.01) continue;
    const drift = Math.abs(keys[i][cross] - origin[cross]);
    const score = advance + drift * 3;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}
