import { type Binding, bindingModule, ZMK_MODULES, type ZmkModuleId } from '@layerbench/core';

/**
 * The kinds of key the inspector offers, as a reader thinks of keys rather than as the model stores
 * them. One "Layer" kind stands for five bindings (momentary, one-shot, toggle, to layer, auto) that
 * differ only in how the layer comes on, so choosing that is a second, smaller step; the same goes
 * for a modifier that is held or one-shot.
 */
export type KindOfKey =
  | 'symbol'
  | 'layer'
  | 'modifier'
  | 'taphold'
  | 'repeat'
  | 'adaptive'
  | 'altrepeat'
  | 'macro'
  | 'tapdance'
  | 'morph'
  | 'capsword'
  | 'sentencespace'
  | 'unicode'
  | 'deadkey'
  | 'transparent'
  | 'nothing'
  | 'imported';

export interface KindInfo {
  kind: KindOfKey;
  label: string;
  /**
   * Shown on the tile: a mark for what the key does, as the board would draw it. Never the name of
   * a layer, which would read as one of the kinds ("Nav Layer").
   */
  glyph: string;
  hint: string;
  /**
   * The ZMK module every key of this kind needs. Absent where stock ZMK has the kind, or has it
   * but for one way of it: a layer that comes on until the word ends, a morph on a layer.
   */
  module?: ZmkModuleId;
}

/** The kinds on the first row, in the order a layout is usually built. */
export const PRIMARY_KINDS: readonly KindInfo[] = [
  { kind: 'symbol', label: 'Symbol', glyph: 'a', hint: 'types a letter, digit or symbol' },
  { kind: 'layer', label: 'Layer', glyph: '❐', hint: 'reaches another layer' },
  { kind: 'modifier', label: 'Modifier', glyph: '⇧', hint: 'Shift, Control, Alt or Command' },
  { kind: 'taphold', label: 'Tap-hold', glyph: 'a/⇧', hint: 'one thing on tap, another on hold' },
  { kind: 'repeat', label: 'Repeat', glyph: '⟳', hint: 'repeats the previous key' },
  {
    kind: 'adaptive',
    label: 'Adaptive',
    glyph: '✦',
    hint: 'adapts to the key before it',
    module: bindingModule('adaptive') ?? undefined,
  },
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
    module: bindingModule('adaptive') ?? undefined,
  },
  { kind: 'tapdance', label: 'Tap dance', glyph: 'TD', hint: 'different things on 1, 2, 3 taps' },
  { kind: 'morph', label: 'Morph', glyph: 'a⇧b', hint: 'changes with a modifier or a layer' },
  { kind: 'capsword', label: 'Caps word', glyph: '⇪', hint: 'capitals until the word ends' },
  {
    kind: 'sentencespace',
    label: 'Sentence space',
    glyph: '.␣A',
    hint: 'a space, and a capital after . ? or !',
    module: bindingModule('sentence_space') ?? undefined,
  },
  {
    kind: 'unicode',
    label: 'Unicode',
    glyph: 'U+',
    hint: 'a character the host has no key for',
    module: bindingModule('unicode') ?? undefined,
  },
  { kind: 'deadkey', label: 'Dead key', glyph: '´', hint: 'accents the next letter' },
];

const IMPORTED: KindInfo = {
  kind: 'imported',
  label: 'Imported',
  glyph: '?',
  hint: 'a key LayerBench keeps but does not simulate',
};

export const ALL_KINDS: readonly KindInfo[] = [...PRIMARY_KINDS, ...MORE_KINDS, IMPORTED];

/**
 * What one part of a bigger key can be — the tap of a tap-hold, an adaptive key's branch. Parts
 * are simple by nature; a part that is already something richer keeps its kind in the list.
 */
export const PART_KINDS: readonly KindOfKey[] = [
  'symbol',
  'macro',
  'layer',
  'modifier',
  'repeat',
  'capsword',
  'sentencespace',
  'transparent',
  'nothing',
];

/**
 * What the tap of a tap-hold can be: a part, or an adaptive key or alt repeat, so a key can be an
 * adaptive key on a tap and a layer or a modifier on a hold.
 */
export const TAP_KINDS: readonly KindOfKey[] = [...PART_KINDS, 'adaptive', 'altrepeat'];

export function kindInfo(kind: KindOfKey): KindInfo {
  return ALL_KINDS.find((k) => k.kind === kind) ?? IMPORTED;
}

/** What a tile says when pointed at: its hint, and the module the kind needs. */
export function tileHint(k: KindInfo): string {
  return k.module ? `${k.hint}, with the ZMK module ${ZMK_MODULES[k.module]}` : k.hint;
}

/** The kind of key a binding is. */
export function kindOf(b: Binding | undefined): KindOfKey {
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
      return b.default?.kind === 'key_repeat' ? 'altrepeat' : 'adaptive';
    case 'macro':
      return 'macro';
    case 'tap_dance':
      return 'tapdance';
    case 'mod_morph':
    case 'layer_morph':
    case 'sentence_morph':
      return 'morph';
    case 'sentence_space':
      return 'sentencespace';
    case 'caps_word':
      return 'capsword';
    case 'unicode':
      return 'unicode';
    case 'dead_key':
      return 'deadkey';
    case 'raw':
      return 'imported';
  }
}
