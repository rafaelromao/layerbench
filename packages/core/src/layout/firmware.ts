import type { WrappingFeature } from './features.js';
import type { BindingKind } from './types.js';

/**
 * ZMK modules: firmware outside stock ZMK, which a keymap adds to its build (its `west.yml`, or
 * `ZMK_EXTRA_MODULES`) for a behaviour stock ZMK lacks. Each by its repository on GitHub. Magic
 * Romak's author's keymap (github.com/rafaelromao/keyboards) builds with each of these but
 * zmk-unicode.
 */
export const ZMK_MODULES = {
  adaptiveKey: 'urob/zmk-adaptive-key',
  autoLayer: 'urob/zmk-auto-layer',
  layerMorph: 'rafaelromao/zmk-layer-morph',
  sentenceCase: 'rafaelromao/zmk-sentence-case',
  unicode: 'urob/zmk-unicode',
} as const;

export type ZmkModuleId = keyof typeof ZMK_MODULES;

/** Where a module's code and its instructions are. */
export function moduleUrl(module: ZmkModuleId): string {
  return `https://github.com/${ZMK_MODULES[module]}`;
}

/**
 * The module each kind of binding needs, or null where stock ZMK has it. Every kind is listed, so
 * none is added without saying how a keymap gets it.
 */
const BINDING_MODULES: Record<BindingKind, ZmkModuleId | null> = {
  // A shifted symbol the host's Shift does not give is a mod-morph.
  kp: null,
  trans: null,
  none: null,
  mo: null,
  lt: null,
  sl: null,
  // Turning a layer only on, or only off, is a toggle-layer with its `toggle-mode`.
  tog: null,
  to: null,
  sk: null,
  mod: null,
  caps_word: null,
  auto_layer: 'autoLayer',
  key_repeat: null,
  mod_morph: null,
  layer_morph: 'layerMorph',
  sentence_morph: 'sentenceCase',
  sentence_space: 'sentenceCase',
  tap_dance: null,
  macro: null,
  adaptive: 'adaptiveKey',
  hold_tap: null,
  // The host's dead key, sent with `&kp` on a host layout that has it, as US-International.
  dead_key: null,
  unicode: 'unicode',
  // Kept from an import as its keymap had it: LayerBench neither makes nor types it.
  raw: null,
};

/** The ZMK module a binding of this kind needs, or null when stock ZMK has it. */
export function bindingModule(kind: BindingKind): ZmkModuleId | null {
  return BINDING_MODULES[kind];
}

/**
 * The module each feature needs, or null where stock ZMK has it. Caps word on the shift key is a
 * mod-morph that turns on caps word. zmk-sentence-case ends a sentence at `.`, `?` and `!`, and
 * shifts with Left Shift; other punctuation, or another modifier, takes an adaptive key on the space
 * key, which is what the feature compiles to.
 */
const FEATURE_MODULES: Record<WrappingFeature, ZmkModuleId | null> = {
  sentenceCase: 'sentenceCase',
  capsWord: null,
};

/** The ZMK module a feature needs, or null when stock ZMK has it. */
export function featureModule(feature: WrappingFeature): ZmkModuleId | null {
  return FEATURE_MODULES[feature];
}
