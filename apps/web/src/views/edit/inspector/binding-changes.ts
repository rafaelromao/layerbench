import { type Binding, bindingToJson, type Mod, stableStringify } from '@layerbench/core';
import type { BindingTextContext } from '../binding-text.js';
import { type KindOfKey, kindOf } from './kinds.js';

/**
 * What the key inspector's controls do to a binding, in one place. A binding is read as its kind of
 * key: what each of its controls shows, and the change each of them makes. A change gives the
 * binding it makes, or the binding it was given when it would change nothing, so whoever commits it
 * can tell that nothing happened.
 */

type Of<K extends Binding['kind']> = Extract<Binding, { kind: K }>;

/** What one control does: the binding it makes of the value it is given. */
export type Change<V> = (value: V) => Binding;

type LayerMode = 'mo' | 'sl' | 'tog' | 'to' | 'auto_layer';
type Nothing = Record<never, never>;

/** For each kind of key: the bindings it stands for, what its controls show, and their changes. */
interface Shapes {
  symbol: { binding: Of<'kp'>; view: Nothing; set: Nothing };
  layer: { binding: Of<LayerMode>; view: Nothing; set: Nothing };
  modifier: { binding: Of<'mod' | 'sk'>; view: Nothing; set: Nothing };
  taphold: { binding: Of<'lt' | 'hold_tap'>; view: Nothing; set: Nothing };
  repeat: { binding: Of<'key_repeat'>; view: Nothing; set: Nothing };
  adaptive: { binding: Of<'adaptive'>; view: Nothing; set: Nothing };
  altrepeat: { binding: Of<'adaptive'>; view: Nothing; set: Nothing };
  macro: { binding: Of<'macro'>; view: Nothing; set: Nothing };
  tapdance: { binding: Of<'tap_dance'>; view: Nothing; set: Nothing };
  morph: { binding: Of<'mod_morph' | 'layer_morph'>; view: Nothing; set: Nothing };
  capsword: { binding: Of<'caps_word'>; view: Nothing; set: Nothing };
  unicode: { binding: Of<'unicode'>; view: Nothing; set: Nothing };
  deadkey: { binding: Of<'dead_key'>; view: Nothing; set: Nothing };
  behaviour: { binding: Of<'ref'> | Of<'adaptive'> | Of<'macro'>; view: Nothing; set: Nothing };
  transparent: { binding: Of<'trans'>; view: Nothing; set: Nothing };
  nothing: { binding: Of<'none'> | undefined; view: Nothing; set: Nothing };
  imported: { binding: Of<'raw'>; view: Nothing; set: Nothing };
}

/**
 * A binding as its kind of key shows it. `set.kind` makes it another kind of key, keeping what
 * carries over: the symbol of a key made a tap-hold stays its tap.
 */
export type KeyFields = {
  [K in KindOfKey]: {
    kind: K;
    binding: Shapes[K]['binding'];
    view: Shapes[K]['view'];
    set: Shapes[K]['set'] & { kind: Change<KindOfKey> };
  };
}[KindOfKey];

/** The fields of one kind of key, for a body that only ever shows that kind. */
export type FieldsOf<K extends KindOfKey> = Extract<KeyFields, { kind: K }>;

/** Read a binding as its kind of key, with a change for each of its controls. */
export function keyFields(binding: Binding | undefined, ctx: BindingTextContext): KeyFields {
  const kind = kindOf(binding);
  const set = {
    kind: (to: KindOfKey) =>
      to === kind && binding ? binding : same(binding, convert(ctx, binding, to)),
  };
  return { kind, binding, view: {}, set } as KeyFields;
}

// ---------------------------------------------------------------------------- what changed

/** The same binding as written, by what a saved layout would hold: absent and empty are alike. */
function written(b: Binding): string {
  return stableStringify(bindingToJson(b));
}

/** The binding given back when the change made would change nothing. */
function same(before: Binding | undefined, after: Binding): Binding {
  return before !== undefined && written(before) === written(after) ? before : after;
}

/** The first layer above the base is the likeliest a key means when it names none. */
function likeliestLayer(ctx: BindingTextContext): string {
  return ctx.layers[1]?.id ?? ctx.layers[0].id;
}

// ---------------------------------------------------------------------------- kind changes

/** The plain key press a binding amounts to, where it has one: the part worth keeping. */
function tapPart(b: Binding | undefined): Binding | undefined {
  switch (b?.kind) {
    case 'kp':
    case 'key_repeat':
      return b;
    case 'lt':
    case 'hold_tap':
      return tapPart(b.tap);
    case 'mod_morph':
      return tapPart(b.default);
    case 'layer_morph':
      return tapPart(b.inactive);
    case 'tap_dance':
      return tapPart(b.bindings[0]);
    case 'adaptive':
      return tapPart(b.default);
    default:
      return undefined;
  }
}

function layerPart(b: Binding | undefined): string | undefined {
  switch (b?.kind) {
    case 'mo':
    case 'sl':
    case 'tog':
    case 'to':
    case 'auto_layer':
    case 'lt':
      return b.layer;
    case 'hold_tap':
      return layerPart(b.hold);
    default:
      return undefined;
  }
}

function modPart(b: Binding | undefined): Mod | undefined {
  switch (b?.kind) {
    case 'sk':
    case 'mod':
      return b.mod;
    case 'hold_tap':
      return modPart(b.hold);
    default:
      return undefined;
  }
}

/** The adaptive key or alt repeat a binding is, or carries as the tap of a tap-hold. */
function adaptivePart(b: Binding | undefined): Of<'adaptive'> | undefined {
  switch (b?.kind) {
    case 'adaptive':
      return b.ref ? undefined : b;
    case 'lt':
    case 'hold_tap':
      return adaptivePart(b.tap);
    default:
      return undefined;
  }
}

const EMPTY_SYMBOL: Binding = { kind: 'kp', symbol: '' };

/**
 * Turn a binding into another kind, keeping whatever carries over: the symbol of a key made into
 * a tap-hold stays its tap, the layer of a layer key made into a tap-hold becomes its hold. A kind
 * change is a first step, never a loss of what the key already did that the new kind can hold.
 */
function convert(ctx: BindingTextContext, current: Binding | undefined, to: KindOfKey): Binding {
  const tapped = tapPart(current);
  const tap = tapped ?? EMPTY_SYMBOL;
  const layer = layerPart(current) ?? likeliestLayer(ctx);
  const mod = modPart(current) ?? 'LSHIFT';
  const symbol = tap.kind === 'kp' ? tap : EMPTY_SYMBOL;
  const adaptive = adaptivePart(current);
  switch (to) {
    case 'symbol':
      return symbol;
    case 'layer':
      return { kind: 'mo', layer };
    case 'modifier':
      return { kind: 'mod', mod };
    case 'taphold': {
      // An adaptive key, an alt repeat or a repeat key stays the tap, as a symbol does.
      const keptTap = adaptive ?? (current?.kind === 'key_repeat' ? current : symbol);
      // A modifier key keeps its modifier on hold — a home-row mod — and anything else gets a layer.
      return modPart(current) && !layerPart(current)
        ? { kind: 'hold_tap', tap: keptTap, hold: { kind: 'mod', mod } }
        : { kind: 'lt', layer, tap: keptTap };
    }
    case 'repeat':
      return { kind: 'key_repeat' };
    case 'adaptive':
      // An adaptive key that is a tap-hold's tap comes out of it, branches and all.
      if (adaptive) {
        return {
          ...adaptive,
          default: adaptive.default?.kind === 'key_repeat' ? EMPTY_SYMBOL : adaptive.default,
        };
      }
      return {
        kind: 'adaptive',
        default: tapped?.kind === 'kp' ? tapped : EMPTY_SYMBOL,
        triggers: [],
      };
    case 'altrepeat':
      if (adaptive) return { ...adaptive, default: { kind: 'key_repeat' } };
      return { kind: 'adaptive', default: { kind: 'key_repeat' }, triggers: [] };
    case 'macro':
      return { kind: 'macro', symbols: symbol.kind === 'kp' ? (symbol.symbol ?? '') : '' };
    case 'tapdance':
      return { kind: 'tap_dance', bindings: [tap, EMPTY_SYMBOL] };
    case 'morph':
      return { kind: 'mod_morph', mods: ['LSHIFT', 'RSHIFT'], default: tap, morphed: EMPTY_SYMBOL };
    case 'capsword':
      return { kind: 'caps_word' };
    case 'unicode':
      return { kind: 'unicode', symbol: symbol.kind === 'kp' ? (symbol.symbol ?? '') : '' };
    case 'deadkey':
      return { kind: 'dead_key', diacritic: '´' };
    case 'behaviour':
      return ctx.behaviors.length > 0 ? { kind: 'ref', ref: ctx.behaviors[0] } : { kind: 'none' };
    case 'transparent':
      return { kind: 'trans' };
    case 'imported':
      return current ?? { kind: 'none' };
    default:
      return { kind: 'none' };
  }
}
