import type { BandResult, CompiledLayout, RuleItem, Unit } from '@layerbench/core';
import { legend, legendText } from '@layerbench/core';

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

/**
 * A key's share of the presses (0–1) as its tooltip writes it: two places, the way the key's
 * numbers give it, `under 0.01%` for a key too rare to show one and `0%` for none.
 */
export function formatKeyShare(share: number): string {
  if (!(share > 0)) return '0%';
  const percent = share * 100;
  return percent < 0.01 ? 'under 0.01%' : `${percent.toFixed(2)}%`;
}

/** Item shares run small, so sub-one-percent values keep an extra digit. */
export function formatItem(item: RuleItem): string {
  if (item.percent !== undefined) {
    return `${item.percent.toFixed(item.percent < 1 ? 3 : 2)}%`;
  }
  if (item.count !== undefined) return item.count.toFixed(0);
  return '';
}

/**
 * A key as a sentence names it: its id and what it does, as "L1 (Repeat)". A combo is named by the
 * keys pressed together, as the board's combo button is, not by the id it is stored under.
 */
function keyName(compiled: CompiledLayout, pos: number, layer: number): string {
  const combo = compiled.combos.find((c) => c.pos === pos);
  const id = combo
    ? combo.keys.map((k) => compiled.positions[k]?.id ?? String(k)).join('+')
    : (compiled.positions[pos]?.id ?? String(pos));
  const binding = combo?.binding ?? compiled.layers[layer]?.bindings[pos];
  if (!binding) return id;
  const what = legendText({ ...legend(compiled, binding), badge: null })
    .replace(/⟳/g, 'Repeat')
    .replace(/␣/g, 'space');
  const on = layer === 0 ? '' : ` on ${compiled.layers[layer]?.name ?? layer}`;
  return what ? `${id} (${what})${on}` : `${id}${on}`;
}

/**
 * The keys of a pair, trigram or other run, by name. An item's label is what its presses typed, but
 * for the Repeat key, which is `⟳`: it does not say which key typed a letter, nor on which layer or
 * finger; this does. Null where there is less than a run: one key is its own label.
 */
export function describeKeys(compiled: CompiledLayout, item: RuleItem): string | null {
  if (item.keys.length < 2) return null;
  const names = item.keys.map((k, i) => keyName(compiled, k, item.layers?.[i] ?? 0));
  // The finger every key shares, as the rules read it: a chord shares any of its fingers. The one
  // key twice is not a pair of two keys: the rules call that a repeat.
  const shared =
    new Set(item.keys).size > 1
      ? item.keys
          .map((k) => compiled.positions[k]?.fingers ?? [])
          .reduce((a, b) => a.filter((f) => b.includes(f)))
      : [];
  return `${names.join(' → ')}${shared.length > 0 ? ` · same finger, ${shared.join('/')}` : ''}`;
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

/** The three-letter codes layout analyzers know these metrics by. The others have none. */
const METRIC_CODES: Record<string, string> = {
  sfb: 'SFB',
  sfs: 'SFS',
  lsb: 'LSB',
  lss: 'LSS',
  fsb: 'FSB',
  fss: 'FSS',
  hsb: 'HSB',
  hss: 'HSS',
};

/**
 * The code a metric's card shows before its name, as `LSB - Lateral stretch bigrams`: null for a
 * metric with none, or whose name, as a rule set may write it, says it already.
 */
export function metricCode(id: string, label: string): string | null {
  const code = METRIC_CODES[id];
  if (!code) return null;
  // `SFBs` says it too.
  return new RegExp(`\\b${code}s?\\b`, 'i').test(label) ? null : code;
}
