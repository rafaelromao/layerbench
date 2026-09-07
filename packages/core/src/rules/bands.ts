import type { BandResult, Bands } from './types.js';

/** Category names for a nine-band scale (Layouts Doc ch. 13.4). */
export const BAND_LABELS = [
  'min',
  'very_low',
  'low',
  'mid_low',
  'mid',
  'mid_high',
  'high',
  'very_high',
  'max',
] as const;

const NEUTRAL: BandResult = { index: null, label: null, quality: 'neutral' };

function pad(list: string[], n: number): string[] {
  if (list.length >= n) return list;
  return [...list, ...Array(n - list.length).fill('max')];
}

/**
 * Place a value in its band. `bounds` are ascending upper bounds, so a value falls in the first
 * category it does not exceed; `direction` decides which end is good.
 */
export function classifyBand(value: number | null | undefined, bands?: Bands | null): BandResult {
  if (value === null || value === undefined) return NEUTRAL;
  if (!bands || !Array.isArray(bands.bounds) || bands.bounds.length === 0) return NEUTRAL;

  const bounds = bands.bounds;
  const direction = bands.direction ?? 'lower_is_better';
  const found = bounds.findIndex((b) => value <= b);
  const idx = found === -1 ? bounds.length : found;
  const n = bounds.length + 1;
  const labels = bands.labels ?? pad([...BAND_LABELS].slice(0, n), n);
  const label = labels[idx] ?? 'beyond';
  const position = idx / Math.max(1, n - 1);
  const goodness = direction === 'lower_is_better' ? 1 - position : position;
  const quality = goodness >= 0.66 ? 'good' : goodness >= 0.33 ? 'ok' : 'bad';
  return { index: idx, label, quality, goodness };
}

/** Band name for display. */
export function humanBand(label: string | null | undefined): string {
  return label ? label.replace(/_/g, ' ') : '';
}
