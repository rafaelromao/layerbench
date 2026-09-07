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
  'ref',
] as const;

export type EditableKind = (typeof EDITABLE_KINDS)[number];

export interface BindingFields {
  kind: EditableKind;
  symbol: string;
  shifted: string;
  layer: string;
  thenLayer: string;
  mod: Mod;
  ref: string;
}

export const EMPTY_FIELDS: BindingFields = {
  kind: 'kp',
  symbol: '',
  shifted: '',
  layer: '',
  thenLayer: '',
  mod: 'LSHIFT',
  ref: '',
};

/** Build a binding from the form. Only the fields that kind uses are read. */
export function bindingFromFields(f: BindingFields): Binding {
  switch (f.kind) {
    case 'kp':
      return {
        kind: 'kp',
        symbol: f.symbol,
        ...(f.shifted ? { shifted: f.shifted } : {}),
      };
    case 'macro':
      return {
        kind: 'macro',
        symbols: f.symbol,
        ...(f.thenLayer ? { then: [{ kind: 'sl', layer: f.thenLayer }] } : {}),
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
      return { ...f, symbol: b.symbol ?? '', shifted: b.shifted ?? '' };
    case 'macro': {
      const then = b.then?.[0];
      return {
        ...f,
        symbol: b.symbols ?? '',
        thenLayer: then && then.kind === 'sl' ? then.layer : '',
      };
    }
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
