import type { Binding, Mod } from '@layoutmaster/core';

/** The binding kinds the editor can build from its form. */
export const EDITABLE_KINDS = [
  'kp',
  'trans',
  'none',
  'sl',
  'mo',
  'lt',
  'tog',
  'to',
  'sk',
  'mod',
  'key_repeat',
  'macro',
  'caps_word',
  'auto_layer',
  'dead_key',
  'unicode',
  'ref',
] as const;

export type EditableKind = (typeof EDITABLE_KINDS)[number];

/**
 * One row of the macro builder. Rows compile to `steps[]` in order, which is what lets a macro
 * type some text *and* arm a layer or a modifier — the shape the accent and `qu` keys need.
 */
export type MacroStep = { id: string } & (
  | { kind: 'text'; text: string }
  | { kind: 'sl'; layer: string }
  | { kind: 'sk'; mod: Mod }
  | { kind: 'ref'; ref: string }
);

export const MACRO_STEP_KINDS = ['text', 'sl', 'sk', 'ref'] as const;

export interface BindingFields {
  kind: EditableKind;
  symbol: string;
  shifted: string;
  layer: string;
  thenLayer: string;
  mod: Mod;
  ref: string;
  /** Tag recorded as the last press's, for adaptive branches that key off how a symbol was typed. */
  tag: string;
  /** Macro steps. Empty falls back to the plain `symbols` + one armed layer shape. */
  macroSteps: MacroStep[];
}

export const EMPTY_FIELDS: BindingFields = {
  kind: 'kp',
  symbol: '',
  shifted: '',
  layer: '',
  thenLayer: '',
  mod: 'LSHIFT',
  ref: '',
  tag: '',
  macroSteps: [],
};

/** Rows are reordered and can be identical, so each carries an identity of its own for React. */
let nextStepId = 0;
function stepId(): string {
  nextStepId += 1;
  return `step-${nextStepId}`;
}

export function emptyMacroStep(kind: MacroStep['kind']): MacroStep {
  const id = stepId();
  switch (kind) {
    case 'text':
      return { id, kind: 'text', text: '' };
    case 'sl':
      return { id, kind: 'sl', layer: '' };
    case 'sk':
      return { id, kind: 'sk', mod: 'LSHIFT' };
    default:
      return { id, kind: 'ref', ref: '' };
  }
}

function stepToBindings(s: MacroStep): Binding[] {
  switch (s.kind) {
    case 'text':
      return [...s.text].map((g) => ({ kind: 'kp', symbol: g }));
    case 'sl':
      return [{ kind: 'sl', layer: s.layer }];
    case 'sk':
      return [{ kind: 'sk', mod: s.mod }];
    default:
      return [{ kind: 'macro', ref: s.ref }];
  }
}

/** Read a macro's steps back into rows, coalescing consecutive single keys into one text row. */
function stepsToRows(steps: Binding[]): MacroStep[] {
  const rows: MacroStep[] = [];
  for (const b of steps) {
    if (b.kind === 'kp' && b.symbol) {
      const last = rows[rows.length - 1];
      if (last?.kind === 'text') last.text += b.symbol;
      else rows.push({ id: stepId(), kind: 'text', text: b.symbol });
    } else if (b.kind === 'sl') rows.push({ id: stepId(), kind: 'sl', layer: b.layer });
    else if (b.kind === 'sk') rows.push({ id: stepId(), kind: 'sk', mod: b.mod });
    else if (b.kind === 'macro' && b.ref) rows.push({ id: stepId(), kind: 'ref', ref: b.ref });
  }
  return rows;
}

/** Build a binding from the form. Only the fields that kind uses are read. */
export function bindingFromFields(f: BindingFields): Binding {
  switch (f.kind) {
    case 'kp':
      return {
        kind: 'kp',
        symbol: f.symbol,
        ...(f.shifted ? { shifted: f.shifted } : {}),
        ...(f.tag ? { tag: f.tag } : {}),
      };
    case 'macro':
      // A macro built from rows keeps them; one that only types text keeps the compact shape, so
      // editing an existing macro does not rewrite its document.
      return f.macroSteps.length > 0
        ? {
            kind: 'macro',
            steps: f.macroSteps.flatMap(stepToBindings),
            ...(f.tag ? { tag: f.tag } : {}),
          }
        : {
            kind: 'macro',
            symbols: f.symbol,
            ...(f.thenLayer ? { then: [{ kind: 'sl', layer: f.thenLayer }] } : {}),
            ...(f.tag ? { tag: f.tag } : {}),
          };
    case 'dead_key':
      return { kind: 'dead_key', diacritic: f.symbol || '\u00b4' };
    case 'unicode':
      return {
        kind: 'unicode',
        symbol: f.symbol,
        ...(f.shifted ? { shiftedSymbol: f.shifted } : {}),
      };
    case 'sl':
    case 'mo':
    case 'tog':
    case 'to':
    case 'auto_layer':
      return { kind: f.kind, layer: f.layer } as Binding;
    case 'lt':
      return { kind: 'lt', layer: f.layer, tap: { kind: 'kp', symbol: f.symbol } };
    case 'sk':
    case 'mod':
      return { kind: f.kind, mod: f.mod || 'LSHIFT' } as Binding;
    case 'ref':
      return { kind: 'ref', ref: f.ref };
    default:
      return { kind: f.kind } as Binding;
  }
}

/** Fill the form from an existing binding, so editing starts from what is already there. */
export function fieldsFromBinding(b: Binding | undefined): BindingFields {
  if (!b) return EMPTY_FIELDS;
  const f: BindingFields = { ...EMPTY_FIELDS, kind: b.kind as EditableKind };
  switch (b.kind) {
    case 'kp':
      return { ...f, symbol: b.symbol ?? '', shifted: b.shifted ?? '', tag: b.tag ?? '' };
    case 'macro': {
      const then = b.then?.[0];
      return {
        ...f,
        symbol: b.symbols ?? '',
        thenLayer: then && then.kind === 'sl' ? then.layer : '',
        tag: b.tag ?? '',
        macroSteps: b.steps ? stepsToRows(b.steps) : [],
      };
    }
    case 'dead_key':
      return { ...f, symbol: b.diacritic };
    case 'unicode':
      return { ...f, symbol: b.symbol, shifted: b.shiftedSymbol ?? '' };
    case 'sl':
    case 'mo':
    case 'tog':
    case 'to':
    case 'auto_layer':
      return { ...f, layer: b.layer };
    case 'lt':
      return {
        ...f,
        layer: b.layer,
        symbol: b.tap.kind === 'kp' ? (b.tap.symbol ?? '') : '',
      };
    case 'sk':
    case 'mod':
      return { ...f, mod: b.mod };
    case 'ref':
      return { ...f, ref: b.ref };
    default:
      return f;
  }
}
