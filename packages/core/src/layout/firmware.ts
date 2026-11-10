import { bindingParts } from './compile.js';
import type { Binding, BindingKind } from './types.js';

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
};

/** The ZMK module a binding of this kind needs, or null when stock ZMK has it. */
export function bindingModule(kind: BindingKind): ZmkModuleId | null {
  return BINDING_MODULES[kind];
}

/**
 * The ZMK modules a binding needs, its own and those of every part it holds: a macro's steps, a
 * tap-hold's tap and hold, a morph's parts, an adaptive key's branches, a tap dance's taps. In the
 * order `ZMK_MODULES` lists them, each once; none when stock ZMK runs all of it. A macro is stock
 * ZMK, so what it needs is what its steps do: one with a sentence space needs zmk-sentence-case.
 */
export function bindingModules(b: Binding): ZmkModuleId[] {
  const found = new Set<ZmkModuleId>();
  const walk = (x: Binding, depth: number): void => {
    if (depth > 32) return;
    const own = BINDING_MODULES[x.kind];
    if (own) found.add(own);
    for (const part of bindingParts(x)) walk(part, depth + 1);
  };
  walk(b, 0);
  return (Object.keys(ZMK_MODULES) as ZmkModuleId[]).filter((m) => found.has(m));
}
