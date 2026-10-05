import type { BandResult, RuleItem, Unit } from '@layoutmaster/core';

/** Numbers are read side by side down a column, so every unit has one fixed shape. */
export function formatValue(value: number | null | undefined, unit: Unit): string {
  if (value === null || value === undefined) return '–';
  switch (unit) {
    case 'percent':
      return `${value.toFixed(2)}%`;
    case 'distance':
      return `${value.toFixed(2)}U`;
    case 'effort':
      // Two places, as cyanophage prints it, so the numbers read the same side by side.
      return value.toFixed(2);
    case 'count':
      return value.toFixed(0);
    default:
      return value.toFixed(2);
  }
}

/** A key's part of a number runs small, so small parts keep an extra digit. */
export function formatPart(value: number, unit: Unit): string {
  const small = Math.abs(value) < (unit === 'distance' ? 0.1 : 1);
  switch (unit) {
    case 'percent':
      return `${value.toFixed(small ? 3 : 2)}%`;
    case 'distance':
      return `${value.toFixed(small ? 3 : 2)}U`;
    case 'count':
      return value.toFixed(0);
    default:
      return value.toFixed(small ? 3 : 2);
  }
}

/** Item shares run small, so sub-one-percent values keep an extra digit. */
export function formatItem(item: RuleItem): string {
  if (item.percent !== undefined) {
    return `${item.percent.toFixed(item.percent < 1 ? 3 : 2)}%`;
  }
  if (item.count !== undefined) return item.count.toFixed(0);
  return '';
}

export function qualityBorder(band: BandResult): string {
  switch (band.quality) {
    case 'good':
      return 'border-success/60';
    case 'ok':
      return 'border-warning/60';
    case 'bad':
      return 'border-error/60';
    default:
      return 'border-base-300';
  }
}

export function qualityBadge(band: BandResult): string {
  switch (band.quality) {
    case 'good':
      return 'badge-success';
    case 'ok':
      return 'badge-warning';
    case 'bad':
      return 'badge-error';
    default:
      return 'badge-ghost';
  }
}

/** Compact captions for the summary strip, where the full labels do not fit. */
const SHORT_LABELS: Record<string, string> = {
  effort: 'Effort',
  sfb: 'SFB',
  sfs: 'SFS',
  lsb: 'LSB',
  fsb: 'FSB',
  hsb: 'HSB',
  alternation: 'Alt',
  rolls: 'Rolls',
  onehand_in: 'Onehand',
  redirect: 'Redir',
  pinky_off: 'Pinky off',
  hand_balance: 'Hand Δ',
  layer_taps_per_100: 'Layer taps',
  extra_keystrokes: 'Extra keys',
  finger_travel: 'Travel',
};

export function shortLabel(id: string, fallback: string): string {
  return SHORT_LABELS[id] ?? fallback;
}
