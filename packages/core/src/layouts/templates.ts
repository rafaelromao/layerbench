import type { Geometry } from '../geometry/types.js';
import type { Binding, LayerDef } from '../layout/types.js';

/**
 * Number and symbol layers, as a template.
 *
 * Placements are given by canonical key id, and only the ids a geometry actually has are bound — so
 * the same template lands sensibly on a 34-key board, on Romak's 24 and on the sub-30 formats,
 * dropping whatever will not fit rather than shifting everything sideways.
 *
 * Every symbol is its own `kp`, never the `shifted` half of a pair: producer enumeration moves any
 * output needing a modifier into `excludedByCase` in fold mode, which is the default, so a shifted
 * pair would make the symbol unreachable in an ordinary analysis.
 */

/** Right hand as a keypad, left hand as brackets and the arithmetic that pairs with them. */
const NUMBERS: Record<string, string> = {
  LTR: '[',
  LTM: ']',
  LTI: '\\',
  LHP: '-',
  LHR: '(',
  LHM: ')',
  LHI: '&',
  LBR: '{',
  LBM: '}',
  LBI: '|',
  RTI: '7',
  RTM: '8',
  RTR: '9',
  RHI: '4',
  RHM: '5',
  RHR: '6',
  RBI: '1',
  RBM: '2',
  RBR: '3',
  RHP: '0',
};

/** The punctuation a symbol layer carries, with the shifted-number row spread across both hands. */
const SYMBOLS: Record<string, string> = {
  LTR: '~',
  LTM: '#',
  LTI: "'",
  LHP: '@',
  LHR: '^',
  LHM: '$',
  LHI: '"',
  LBR: '<',
  LBM: '>',
  LBI: '`',
  RTI: '%',
  RTM: '=',
  RTR: ':',
  RHI: '?',
  RHM: '-',
  RHR: '+',
  RBI: '!',
  RBM: '/',
  RBR: '*',
  RHP: '_',
};

function bindingsFor(
  geometry: Geometry,
  table: Record<string, string>,
  extra: Record<string, Binding>,
): Record<string, Binding> {
  const have = new Set(geometry.keys.map((k) => k.id));
  const out: Record<string, Binding> = { '*': { kind: 'trans' } };
  for (const [id, symbol] of Object.entries(table)) {
    if (have.has(id)) out[id] = { kind: 'kp', symbol };
  }
  for (const [id, binding] of Object.entries(extra)) {
    if (have.has(id)) out[id] = binding;
  }
  return out;
}

export interface NumberLayerOptions {
  id?: string;
  name?: string;
  /** Layer the layer's own thumb reaches, normally the symbol layer. */
  symbolLayer?: string;
  /** Extra bindings, merged last. */
  extra?: Record<string, Binding>;
}

/** Digits and brackets. */
export function numberLayer(geometry: Geometry, opts: NumberLayerOptions = {}): LayerDef {
  const extra: Record<string, Binding> = { ...(opts.extra ?? {}) };
  if (opts.symbolLayer) extra.R0 = { kind: 'sl', layer: opts.symbolLayer };
  return {
    id: opts.id ?? 'num',
    name: opts.name ?? 'Numbers',
    bindings: bindingsFor(geometry, NUMBERS, extra),
  };
}

/** Punctuation that does not fit on the alphas. */
export function symbolLayer(
  geometry: Geometry,
  opts: { id?: string; name?: string; extra?: Record<string, Binding> } = {},
): LayerDef {
  return {
    id: opts.id ?? 'sym',
    name: opts.name ?? 'Symbols',
    bindings: bindingsFor(geometry, SYMBOLS, opts.extra ?? {}),
  };
}

/** Every symbol the two templates place, for tests and documentation. */
export function templateSymbols(): string[] {
  return [...new Set([...Object.values(NUMBERS), ...Object.values(SYMBOLS)])];
}
