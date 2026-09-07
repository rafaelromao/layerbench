import { fingerName } from '../geometry/types.js';
import type { CompiledLayout } from '../layout/compile.js';

const BY_FINGER: Record<string, Record<number, number>> = {
  pinky: { 0: 3, 1: 1, 2: 3 },
  ring: { 0: 2, 1: 0, 2: 2 },
  middle: { 0: 1, 1: 0, 2: 2 },
  index: { 0: 2, 1: 0, 2: 1 },
};

/**
 * Default per-key effort: the cyanophage grid extended with thumbs at 1 and the inner and
 * outer-pinky columns at 5 on the home row, 7 elsewhere. Keyed by key id.
 */
export function defaultEffort(compiled: CompiledLayout): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of compiled.keys) {
    let e: number;
    if (k.thumb) e = 1;
    else if (k.inner) e = k.row === 1 ? 5 : 7;
    else if (k.col === 0) e = k.row === 1 ? 5 : 7;
    else {
      const name = k.finger ? fingerName(k.finger) : 'index';
      e = BY_FINGER[name]?.[k.row] ?? 2;
    }
    out[k.id] = e;
  }
  return out;
}

/** Effort of one physical key: rule params first, then the default grid. */
export function keyEffort(
  compiled: CompiledLayout,
  member: number,
  table: Record<string, number>,
  fallback: Record<string, number>,
): number {
  const id = compiled.keys[member]?.id;
  if (id === undefined) return 1;
  return table[id] ?? fallback[id] ?? 1;
}
