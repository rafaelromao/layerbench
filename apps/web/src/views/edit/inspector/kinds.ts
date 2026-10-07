import type { Binding, CompiledLayout, Mod } from '@layerbench/core';

/**
 * The kinds the inspector offers, as a reader thinks of keys rather than as the model stores them.
 * One "Layer" kind stands for five bindings (momentary, one-shot, toggle, switch, auto) that differ
 * only in how the layer comes on, so choosing that is a second, smaller step; the same goes for a
 * modifier that is held or one-shot.
 */
export type InspectorKind =
  | 'symbol'
  | 'layer'
  | 'modifier'
  | 'taphold'
  | 'repeat'
  | 'magic'
  | 'altrepeat'
  | 'macro'
  | 'tapdance'
  | 'morph'
  | 'capsword'
  | 'unicode'
  | 'deadkey'
  | 'behaviour'
  | 'transparent'
  | 'nothing'
  | 'imported';

export interface KindInfo {
  kind: InspectorKind;
  label: string;
  /** Shown on the tile: the glyph the key itself would carry. */
  glyph: string;
  hint: string;
}

/** The kinds on the first row, in the order a layout is usually built. */
export const PRIMARY_KINDS: readonly KindInfo[] = [
  { kind: 'symbol', label: 'Symbol', glyph: 'a', hint: 'types a letter, digit or symbol' },
  { kind: 'layer', label: 'Layer', glyph: 'Nav', hint: 'reaches another layer' },
  { kind: 'modifier', label: 'Modifier', glyph: '⇧', hint: 'Shift, Control, Alt or Command' },
  { kind: 'taphold', label: 'Tap-hold', glyph: 'a/⇧', hint: 'one thing on tap, another on hold' },
  { kind: 'repeat', label: 'Repeat', glyph: '⟳', hint: 'repeats the previous key' },
  { kind: 'magic', label: 'Magic', glyph: '✦', hint: 'adapts to the key before it' },
  { kind: 'macro', label: 'Macro', glyph: '⋯', hint: 'types several things in one press' },
  { kind: 'transparent', label: 'Transparent', glyph: '▽', hint: 'the layer below shows through' },
  { kind: 'nothing', label: 'Nothing', glyph: '∅', hint: 'does nothing' },
];

/** Behind "More": kinds a layout needs now and then. */
export const MORE_KINDS: readonly KindInfo[] = [
  {
    kind: 'altrepeat',
    label: 'Alt repeat',
    glyph: '⟳✦',
    hint: 'repeats, or types something else after chosen keys',
  },
  { kind: 'tapdance', label: 'Tap dance', glyph: 'TD', hint: 'different things on 1, 2, 3 taps' },
  { kind: 'morph', label: 'Morph', glyph: 'a⇧b', hint: 'changes with a modifier or a layer' },
  { kind: 'capsword', label: 'Caps word', glyph: '⇪', hint: 'capitals until the word ends' },
  { kind: 'unicode', label: 'Unicode', glyph: 'U+', hint: 'a character the host has no key for' },
  { kind: 'deadkey', label: 'Dead key', glyph: '◌́', hint: 'accents the next letter' },
  {
    kind: 'behaviour',
    label: 'Behaviour',
    glyph: '&',
    hint: "one of the layout's named behaviours",
  },
];

const IMPORTED: KindInfo = {
  kind: 'imported',
  label: 'Imported',
  glyph: '?',
  hint: 'a key LayerBench keeps but does not simulate',
};

export const ALL_KINDS: readonly KindInfo[] = [...PRIMARY_KINDS, ...MORE_KINDS, IMPORTED];

/**
 * What one arm of a bigger key can be — the tap of a tap-hold, a magic key's branch. Arms are
 * simple by nature; an arm that is already something richer keeps its kind in the list.
 */
export const ARM_KINDS: readonly InspectorKind[] = [
  'symbol',
  'macro',
  'layer',
  'modifier',
  'repeat',
  'capsword',
  'transparent',
  'nothing',
];

/**
 * What the tap of a tap-hold can be: an arm, or a magic key or alt repeat, so a key can be a magic
 * key on a tap and a layer or a modifier on a hold.
 */
export const TAP_KINDS: readonly InspectorKind[] = [...ARM_KINDS, 'magic', 'altrepeat'];

export function kindInfo(kind: InspectorKind): KindInfo {
  return ALL_KINDS.find((k) => k.kind === kind) ?? IMPORTED;
}

/** The inspector kind a binding belongs to. */
export function kindOf(b: Binding | undefined): InspectorKind {
  switch (b?.kind) {
    case undefined:
    case 'none':
      return 'nothing';
    case 'kp':
      return 'symbol';
    case 'trans':
      return 'transparent';
    case 'mo':
    case 'sl':
    case 'tog':
    case 'to':
    case 'auto_layer':
      return 'layer';
    case 'sk':
    case 'mod':
      return 'modifier';
    case 'lt':
    case 'hold_tap':
      return 'taphold';
    case 'key_repeat':
      return 'repeat';
    case 'adaptive':
      // An adaptive key that names a behaviour is that behaviour, whatever it overrides.
      if (b.ref) return 'behaviour';
      return b.default?.kind === 'key_repeat' ? 'altrepeat' : 'magic';
    case 'macro':
      return b.ref ? 'behaviour' : 'macro';
    case 'tap_dance':
      return 'tapdance';
    case 'mod_morph':
    case 'layer_morph':
      return 'morph';
    case 'caps_word':
      return 'capsword';
    case 'unicode':
      return 'unicode';
    case 'dead_key':
      return 'deadkey';
    case 'ref':
      return 'behaviour';
    case 'raw':
      return 'imported';
  }
}

/** The plain key press a binding amounts to, where it has one: the part worth keeping. */
export function tapPart(b: Binding | undefined): Binding | undefined {
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

type Adaptive = Extract<Binding, { kind: 'adaptive' }>;

/** The magic key or alt repeat a binding is, or carries as the tap of a tap-hold. */
function adaptivePart(b: Binding | undefined): Adaptive | undefined {
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
export function convert(
  compiled: CompiledLayout,
  current: Binding | undefined,
  to: InspectorKind,
  behaviours: string[],
): Binding {
  if (kindOf(current) === to && current) return current;
  const tapped = tapPart(current);
  const tap = tapped ?? EMPTY_SYMBOL;
  // The first layer above the base is the likeliest target when the key names none.
  const layer = layerPart(current) ?? compiled.layers[1]?.id ?? compiled.layers[0].id;
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
      // A magic key, an alt repeat or a repeat key stays the tap, as a symbol does.
      const tapArm = adaptive ?? (current?.kind === 'key_repeat' ? current : symbol);
      // A modifier key keeps its modifier on hold — a home-row mod — and anything else gets a layer.
      return modPart(current) && !layerPart(current)
        ? { kind: 'hold_tap', tap: tapArm, hold: { kind: 'mod', mod } }
        : { kind: 'lt', layer, tap: tapArm };
    }
    case 'repeat':
      return { kind: 'key_repeat' };
    case 'magic':
      // A magic key that is a tap-hold's tap comes out of it, branches and all.
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
      return behaviours.length > 0 ? { kind: 'ref', ref: behaviours[0] } : { kind: 'none' };
    case 'transparent':
      return { kind: 'trans' };
    case 'imported':
      return current ?? { kind: 'none' };
    default:
      return { kind: 'none' };
  }
}
