import type { CompiledLayout } from '../layout/compile.js';

/**
 * cyanophage's per-key effort grid, exactly as its playground defines it (`keyboard_svg.js`):
 * rows top, home and bottom; columns from the left outer pinky column to the right one.
 */
export const CYANOPHAGE_EFFORT_GRID: readonly (readonly number[])[] = [
  [5, 3, 2, 1, 2, 7, 7, 2, 1, 2, 3, 5],
  [5, 1, 0, 0, 0, 5, 5, 0, 0, 0, 1, 5],
  [7, 3, 2, 2, 1, 8, 8, 1, 2, 2, 3, 7],
];

/**
 * cyanophage's displayed Effort is `577 × Σ effort ÷ input length`. Written as the rule's scale, so
 * a layout scores the same number here as it would there over the same text.
 */
export const CYANOPHAGE_EFFORT_SCALE = 577;

/**
 * What a thumb press costs in Effort: LayerBench's own value, where cyanophage charges nothing. A
 * one-shot tap, a held layer or a letter on a thumb is a press like any other, and a layout that
 * leans on them should not score as if they were free. The space bar stays free whichever key
 * types it.
 */
export const THUMB_EFFORT = 1;

/**
 * cyanophage's grid, read by position. Canonical columns already follow its layout (0 outer pinky
 * … 5 inner), so the left hand reads a column directly and the right hand mirrors it. Thumbs cost
 * nothing, as they do there. Keyed by key id. The simulator weighs its choices on this grid, so
 * what is typed does not change with what a thumb is charged.
 */
export function cyanophageEffort(compiled: CompiledLayout): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of compiled.keys) {
    if (k.thumb || k.row > 2) {
      out[k.id] = 0;
      continue;
    }
    const col = Math.max(0, Math.min(5, k.col));
    out[k.id] = CYANOPHAGE_EFFORT_GRID[k.row][k.hand === 'L' ? col : 11 - col];
  }
  return out;
}

/** Default per-key effort, what the Effort rule charges: cyanophage's grid, thumbs at `THUMB_EFFORT`. */
export function defaultEffort(compiled: CompiledLayout): Record<string, number> {
  const out = cyanophageEffort(compiled);
  for (const k of compiled.keys) if (k.thumb) out[k.id] = THUMB_EFFORT;
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
