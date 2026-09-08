import type { TextClass } from '@layoutmaster/core';
import { PRESET_IDS } from '@layoutmaster/core/rules';

/**
 * The analysis parameters carried in the query string. This is a contract, not an implementation
 * detail: links produced by the reference implementation must keep working, so the parsing rules,
 * the defaults and the omit-defaults serialization all match it exactly.
 */

export type CaseMode = 'fold' | 'model';
export type Universe = 'no_space' | 'with_space';
export type HeatMode = 'usage' | 'sfb' | 'effort' | 'travel' | 'layer_taps';

export const HEAT_MODES: readonly HeatMode[] = ['usage', 'sfb', 'effort', 'travel', 'layer_taps'];

export interface Params {
  /** Bundled id, `saved:<id>` or `inline:<blob>`. */
  layoutRef: string;
  corpus: string;
  corpus2: string | null;
  /** Share of the first corpus when two are mixed, 0–100. */
  mix: number;
  /** Preset id or `saved:<id>`. */
  preset: string;
  caseMode: CaseMode;
  textClass: TextClass;
  universe: Universe;
  layer: number;
  heat: HeatMode;
  sample: number;
}

export const DEFAULT_PARAMS: Params = {
  layoutRef: 'magic-romak',
  corpus: 'pt-br-general',
  corpus2: null,
  mix: 50,
  preset: 'layouts_doc',
  caseMode: 'fold',
  textClass: 'letters',
  universe: 'no_space',
  layer: 0,
  heat: 'usage',
  sample: 300_000,
};

/** Sample sizes offered in the toolbar. */
export const SAMPLE_SIZES = [100_000, 300_000, 1_000_000] as const;

export type RawSearch = Record<string, string | undefined>;

function blankToNull(v: string | undefined): string | null {
  return v === undefined || v === '' ? null : v;
}

function int(v: string | undefined, fallback: number, min: number, max: number): number {
  if (v === undefined) return fallback;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Short URL spellings for the text class; the default is omitted from a link entirely. */
export const TEXT_CLASS_PARAM: Record<TextClass, string> = {
  letters: 'letters',
  'letters+digits': 'num',
  'letters+digits+symbols': 'sym',
};

function validTextClass(v: string | undefined): TextClass {
  if (v === 'num') return 'letters+digits';
  if (v === 'sym') return 'letters+digits+symbols';
  return 'letters';
}

function validPreset(v: string | undefined): string {
  if (v === undefined) return DEFAULT_PARAMS.preset;
  if (v.startsWith('saved:')) return v;
  return (PRESET_IDS as readonly string[]).includes(v) ? v : DEFAULT_PARAMS.preset;
}

/** Read parameters from a query string, falling back to defaults for anything missing or invalid. */
export function parseParams(raw: RawSearch): Params {
  const heat = raw.heat as HeatMode | undefined;
  return {
    layoutRef: raw.layout ?? raw.l ?? DEFAULT_PARAMS.layoutRef,
    corpus: raw.corpus ?? DEFAULT_PARAMS.corpus,
    corpus2: blankToNull(raw.corpus2),
    mix: int(raw.mix, DEFAULT_PARAMS.mix, 0, 100),
    preset: validPreset(raw.rules),
    caseMode: raw.case === 'model' ? 'model' : 'fold',
    textClass: validTextClass(raw.text),
    universe: raw.space === '1' ? 'with_space' : 'no_space',
    layer: int(raw.layer, DEFAULT_PARAMS.layer, 0, 31),
    heat: heat && HEAT_MODES.includes(heat) ? heat : DEFAULT_PARAMS.heat,
    sample: int(raw.sample, DEFAULT_PARAMS.sample, 10_000, 5_000_000),
  };
}

/**
 * Serialize parameters back to a query object, omitting everything left at its default. Layout and
 * corpus are always written, and the mix share only travels when a second corpus is selected.
 */
export function toSearch(p: Params, overrides: Partial<Params> = {}): RawSearch {
  const q = { ...p, ...overrides };
  const out: RawSearch = { layout: q.layoutRef, corpus: q.corpus };
  if (q.corpus2 !== null) {
    out.corpus2 = q.corpus2;
    if (q.mix !== DEFAULT_PARAMS.mix) out.mix = String(q.mix);
  }
  if (q.preset !== DEFAULT_PARAMS.preset) out.rules = q.preset;
  if (q.caseMode === 'model') out.case = 'model';
  if (q.textClass !== DEFAULT_PARAMS.textClass) out.text = TEXT_CLASS_PARAM[q.textClass];
  if (q.universe === 'with_space') out.space = '1';
  if (q.layer !== DEFAULT_PARAMS.layer) out.layer = String(q.layer);
  if (q.heat !== DEFAULT_PARAMS.heat) out.heat = q.heat;
  if (q.sample !== DEFAULT_PARAMS.sample) out.sample = String(q.sample);
  return out;
}

/** Query string with keys in a stable order, matching the links the reference implementation emits. */
export function toQueryString(p: Params, overrides: Partial<Params> = {}): string {
  const search = toSearch(p, overrides);
  const sp = new URLSearchParams();
  for (const key of Object.keys(search).sort()) {
    const v = search[key];
    if (v !== undefined && v !== '') sp.set(key, v);
  }
  return sp.toString();
}

export type LayoutRefKind = 'bundled' | 'saved' | 'inline';

export interface LayoutRef {
  kind: LayoutRefKind;
  /** Bundled or saved id; for an inline layout, the compressed blob. */
  value: string;
}

export function parseLayoutRef(ref: string): LayoutRef {
  if (ref.startsWith('inline:')) return { kind: 'inline', value: ref.slice('inline:'.length) };
  if (ref.startsWith('saved:')) return { kind: 'saved', value: ref.slice('saved:'.length) };
  return { kind: 'bundled', value: ref };
}

export function savedRef(id: string): string {
  return `saved:${id}`;
}

export function inlineRef(blob: string): string {
  return `inline:${blob}`;
}
