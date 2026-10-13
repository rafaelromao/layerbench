import { type Binding, bindingToJson, type Mod, stableStringify } from '@layerbench/core';
import { type BindingTextContext, parseBindingText } from '../binding-text.js';
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

/** How a layer key brings its layer on. */
export type LayerMode = 'mo' | 'sl' | 'tog' | 'to' | 'auto_layer';
/** How a modifier key acts: held, or one-shot. */
export type ModMode = 'mod' | 'sk';
type Nothing = Record<never, never>;

/** For each kind of key: the bindings it stands for, what its controls show, and their changes. */
interface Shapes {
  symbol: {
    binding: Of<'kp'>;
    /** `symbol` is the keycode where there is one, and a space is `SPACE`. */
    view: { symbol: string; shifted: string; tag: string; shiftedByDefault: string };
    set: { symbol: Change<string>; shifted: Change<string>; tag: Change<string> };
  };
  layer: {
    binding: Of<LayerMode>;
    view: { layer: string; mode: LayerMode };
    set: { layer: Change<string>; mode: Change<LayerMode> };
  };
  modifier: {
    binding: Of<ModMode>;
    view: { mod: Mod; acts: ModMode };
    set: { mod: Change<Mod>; acts: Change<ModMode> };
  };
  taphold: { binding: Of<'lt' | 'hold_tap'>; view: Nothing; set: Nothing };
  repeat: { binding: Of<'key_repeat'>; view: Nothing; set: Nothing };
  adaptive: { binding: Of<'adaptive'>; view: Nothing; set: Nothing };
  altrepeat: { binding: Of<'adaptive'>; view: Nothing; set: Nothing };
  macro: { binding: Of<'macro'>; view: Nothing; set: Nothing };
  tapdance: { binding: Of<'tap_dance'>; view: Nothing; set: Nothing };
  morph: { binding: Of<'mod_morph' | 'layer_morph'>; view: Nothing; set: Nothing };
  capsword: {
    binding: Of<'caps_word'>;
    /** The symbols that do not end the word, between spaces. */
    view: { continues: string };
    set: { continues: Change<string> };
  };
  unicode: {
    binding: Of<'unicode'>;
    view: { symbol: string; shifted: string };
    set: { symbol: Change<string>; shifted: Change<string> };
  };
  deadkey: {
    binding: Of<'dead_key'>;
    view: { accent: string; shifted: string };
    set: { accent: Change<string>; shifted: Change<string> };
  };
  behaviour: {
    binding: Of<'ref'> | Of<'adaptive'> | Of<'macro'>;
    view: { runs: string };
    set: { runs: Change<string> };
  };
  transparent: { binding: Of<'trans'>; view: Nothing; set: Nothing };
  nothing: { binding: Of<'none'> | undefined; view: Nothing; set: Nothing };
  imported: { binding: Of<'raw'>; view: { label: string; source: string }; set: Nothing };
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
  const read = readers[kind] as Reader<KindOfKey>;
  const { view, set } = read(binding as never, ctx);
  const toKind = (to: KindOfKey) =>
    to === kind && binding ? binding : same(binding, convert(ctx, binding, to));
  return { kind, binding, view, set: { ...set, kind: toKind } } as KeyFields;
}

/** The symbols a field lists, between spaces. */
export const words = (text: string): string[] => text.split(/\s+/).filter(Boolean);

// ---------------------------------------------------------------------------- what changed

/** The same binding as written, by what a saved layout would hold: absent and empty are alike. */
function written(b: Binding): string {
  return stableStringify(bindingToJson(b));
}

/** The binding given back when the change made would change nothing. */
function same(before: Binding | undefined, after: Binding): Binding {
  return before !== undefined && written(before) === written(after) ? before : after;
}

/** A control's change, which gives the binding back when it would change nothing. */
function change<V>(b: Binding, make: (value: V) => Binding): Change<V> {
  return (value) => same(b, make(value));
}

/** A text field's change. Committing what the field already shows changes nothing. */
function field(b: Binding, shown: string, make: (text: string) => Binding): Change<string> {
  return (text) => (text === shown ? b : same(b, make(text)));
}

/** Drop a field entirely rather than store it empty, so the document stays as it was written. */
function withOptional<B extends Binding>(b: B, key: string, value: string): B {
  const out = { ...b } as Record<string, unknown>;
  if (value === '') delete out[key];
  else out[key] = value;
  return out as B;
}

/** A list field: the words given, or no field at all. */
function withWords<B extends Binding>(b: B, key: string, text: string): B {
  const out = { ...b } as Record<string, unknown>;
  if (words(text).length > 0) out[key] = words(text);
  else delete out[key];
  return out as B;
}

/** The first layer above the base is the likeliest a key means when it names none. */
function likeliestLayer(ctx: BindingTextContext): string {
  return ctx.layers[1]?.id ?? ctx.layers[0].id;
}

// ---------------------------------------------------------------------------- reading a key

type Reader<K extends KindOfKey> = (
  b: Shapes[K]['binding'],
  ctx: BindingTextContext,
) => Pick<Shapes[K], 'view' | 'set'>;

const NONE = { view: {}, set: {} };

const readers: { [K in KindOfKey]: Reader<K> } = {
  symbol(b, ctx) {
    const view = {
      symbol: symbolText(b),
      shifted: b.shifted ?? '',
      tag: b.tag ?? '',
      shiftedByDefault: (b.symbol ?? '').toUpperCase(),
    };
    return {
      view,
      set: {
        symbol: field(b, view.symbol, (text) => typed(b, text, ctx)),
        shifted: field(b, view.shifted, (v) => withOptional(b, 'shifted', v)),
        tag: field(b, view.tag, (v) => withOptional(b, 'tag', v)),
      },
    };
  },
  layer: (b) => ({
    view: { layer: b.layer, mode: b.kind },
    set: {
      layer: change(b, (layer: string) => ({ ...b, layer })),
      // The options belong to one way of coming on, so another way starts afresh.
      mode: change(b, (mode: LayerMode) => (mode === b.kind ? b : { kind: mode, layer: b.layer })),
    },
  }),
  modifier: (b) => ({
    view: { mod: b.mod, acts: b.kind },
    set: {
      mod: change(b, (mod: Mod) => ({ ...b, mod })),
      acts: change(b, (acts: ModMode) => (acts === b.kind ? b : { kind: acts, mod: b.mod })),
    },
  }),
  taphold: () => NONE,
  repeat: () => NONE,
  adaptive: () => NONE,
  altrepeat: () => NONE,
  macro: () => NONE,
  tapdance: () => NONE,
  morph: () => NONE,
  capsword(b) {
    const view = { continues: (b.continueList ?? []).join(' ') };
    return {
      view,
      set: { continues: field(b, view.continues, (text) => withWords(b, 'continueList', text)) },
    };
  },
  unicode(b) {
    const view = { symbol: b.symbol, shifted: b.shiftedSymbol ?? '' };
    return {
      view,
      set: {
        symbol: field(b, view.symbol, (symbol) => ({ ...b, symbol })),
        shifted: field(b, view.shifted, (v) => withOptional(b, 'shiftedSymbol', v)),
      },
    };
  },
  deadkey: (b) => ({
    view: { accent: b.diacritic, shifted: b.shifted ?? '' },
    set: {
      // An accent that was the shifted one is now the key's own, so shift arms no other.
      accent: change(b, (diacritic: string) =>
        diacritic === b.shifted ? { kind: 'dead_key', diacritic } : { ...b, diacritic },
      ),
      shifted: change(b, (v: string) => withOptional(b, 'shifted', v)),
    },
  }),
  behaviour: (b) => ({
    view: { runs: b.ref ?? '' },
    set: { runs: change(b, (ref: string) => ({ kind: 'ref', ref })) },
  }),
  transparent: () => NONE,
  nothing: () => NONE,
  imported: (b) => ({ view: { label: b.label, source: b.source ?? '' }, set: {} }),
};

// ---------------------------------------------------------------------------- symbols

/** How a key press is written in its field. A space has no visible spelling, so it takes its name. */
function symbolText(b: Of<'kp'>): string {
  if (b.keycode) return b.keycode;
  return b.symbol === ' ' ? 'SPACE' : (b.symbol ?? '');
}

/**
 * Read a field back as a key press. One character is itself; a longer word is tried as a keycode
 * first, the way the text line reads it, so `SPACE` and `N1` resolve while `ão` stays itself.
 */
function typed(b: Of<'kp'>, text: string, ctx: BindingTextContext): Binding {
  const { symbol: _s, keycode: _k, shifted: _sh, ...rest } = b;
  const next: Of<'kp'> = { ...rest, ...pressOf(text, ctx) };
  // A resolved keycode brings its own shifted symbol; one typed literally keeps the old.
  if (next.shifted === undefined && b.shifted !== undefined) next.shifted = b.shifted;
  if (!next.keycode) delete next.keycode;
  if (!next.shifted) delete next.shifted;
  return next;
}

function pressOf(text: string, ctx: BindingTextContext): Partial<Of<'kp'>> {
  if ([...text].length <= 1 || text.startsWith('&')) return { symbol: text };
  const parsed = parseBindingText(text, ctx);
  if (!parsed.ok || parsed.binding.kind !== 'kp') return { symbol: text };
  const { symbol, keycode, shifted } = parsed.binding;
  return { symbol, keycode, shifted };
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
