import type { Finger, FingeringMode, GeometryKey } from '../geometry/types.js';

export type Mod = 'LSHIFT' | 'RSHIFT' | 'LCTRL' | 'RCTRL' | 'LALT' | 'RALT' | 'LGUI' | 'RGUI';

export const MODS: readonly Mod[] = [
  'LSHIFT',
  'RSHIFT',
  'LCTRL',
  'RCTRL',
  'LALT',
  'RALT',
  'LGUI',
  'RGUI',
];

export type HostLocale = 'symbols' | 'us' | 'us-intl' | 'abnt2';

export interface AdaptiveTrigger {
  /** Last keycodes/symbols that trigger this branch. */
  afterAny?: string[];
  /**
   * Tags of the binding that produced the last press. Lets a branch depend on *how* a symbol was
   * typed, not just which symbol it was — `u` typed by a `qu` macro is not the same as a plain `u`.
   * When both are given the branch needs the symbol *and* one of the tags.
   */
  afterTags?: string[];
  binding: Binding;
}

export type Binding =
  | { kind: 'kp'; symbol?: string; keycode?: string; shifted?: string; tag?: string }
  | { kind: 'trans' }
  | { kind: 'none' }
  | { kind: 'mo'; layer: string }
  | { kind: 'lt'; layer: string; tap: Binding }
  | {
      kind: 'sl';
      layer: string;
      quickRelease?: boolean;
      ignoreModifiers?: boolean;
      releaseAfterMs?: number;
    }
  | { kind: 'tog'; layer: string; mode?: 'flip' | 'on' | 'off' }
  | { kind: 'to'; layer: string }
  | {
      kind: 'sk';
      mod: Mod;
      quickRelease?: boolean;
      ignoreModifiers?: boolean;
      releaseAfterMs?: number;
    }
  | { kind: 'mod'; mod: Mod }
  | { kind: 'caps_word'; continueList?: string[]; mods?: Mod[] }
  | { kind: 'auto_layer'; layer: string; continueList?: string[] }
  | { kind: 'key_repeat' }
  | { kind: 'mod_morph'; mods: Mod[]; default: Binding; morphed: Binding; keepMods?: Mod[] }
  | {
      kind: 'layer_morph';
      layers: string[];
      match?: 'any' | 'all';
      active: Binding;
      inactive: Binding;
    }
  | { kind: 'tap_dance'; bindings: Binding[] }
  | {
      kind: 'macro';
      steps?: Binding[];
      symbols?: string;
      then?: Binding[];
      ref?: string;
      /** Recorded as the last press's tag, for adaptive branches that key off it. */
      tag?: string;
    }
  | {
      kind: 'adaptive';
      default?: Binding;
      triggers?: AdaptiveTrigger[];
      strictModifiers?: boolean;
      deadKeys?: string[];
      ref?: string;
    }
  | { kind: 'hold_tap'; tap: Binding; hold: Binding; flavor?: string; tappingTermMs?: number }
  | { kind: 'dead_key'; diacritic: string }
  | { kind: 'unicode'; symbol: string; shiftedSymbol?: string }
  | { kind: 'ref'; ref: string }
  /**
   * A key LayoutMaster does not simulate — media, Bluetooth, a firmware behaviour it has no model
   * of — kept so an imported layout loses nothing. It is drawn with its original legend and can be
   * placed like any other key, but it types nothing.
   */
  | { kind: 'raw'; label: string; source?: string };

export type BindingKind = Binding['kind'];

export interface LayerDef {
  id: string;
  name?: string;
  /** Key id → binding. The special key `*` sets the default for unlisted keys (default: trans; base layer: none). */
  bindings: Record<string, Binding>;
}

export interface ComboDef {
  id?: string;
  keys: string[];
  binding: Binding;
  /** Layers on which the combo may fire; omitted = all layers. */
  layers?: string[];
  /** `typing` combos are offered as producers; `command` combos are not (default: command). */
  role?: 'typing' | 'command';
  timeoutMs?: number;
  slowRelease?: boolean;
}

export interface ConditionalLayerDef {
  if: string[];
  then: string;
}

export interface TypingPathEntry {
  /** Producer id: `direct:<layer>/<key>`, `combo:<id>`, `adaptive:<layer>/<key>#default|#t<i>`, `repeat`, `macro:<layer>/<key>`, `tapdance:<layer>/<key>#<n>`. */
  producer: string;
  enabled?: boolean;
  when?: { afterAny?: string[] };
}

export interface ActivatorDef {
  /** Source layer id, or `*` for any. */
  from?: string;
  /** `key:<layer>/<key>` — the key to tap (sl/tog/to) or hold (mo/lt) to reach the target layer. */
  via: string;
  requires?: { mods?: Mod[] };
}

export interface BehaviorDefaults {
  sl?: { quickRelease?: boolean; ignoreModifiers?: boolean; releaseAfterMs?: number };
  sk?: { quickRelease?: boolean; ignoreModifiers?: boolean; releaseAfterMs?: number };
}

export type GeometryRef =
  | { preset: string; columnOffsets?: Record<string, number> }
  | { custom: GeometryKey[]; family?: 'columnar' | 'rowstagger'; name?: string };

/** Where a feature puts its binding: a key on a layer. */
export interface FeaturePlacement {
  layer: string;
  key: string;
}

/** A key whose output depends on the previous press — a "magic" key. */
export interface AdaptiveKeyFeature {
  /** Behaviour name. Also part of the producer id, so renaming it changes typing-path ids. */
  id: string;
  label?: string;
  enabled?: boolean;
  /** Output when no trigger matches. */
  default: Binding;
  triggers: AdaptiveTrigger[];
  strictModifiers?: boolean;
  deadKeys?: string[];
  /** Keys the behaviour is bound to. Omit to place it yourself with `{ kind: 'ref' }`. */
  at?: FeaturePlacement[];
}

/** A repeat key whose output depends on the previous press. */
export interface AltRepeatFeature {
  enabled?: boolean;
  /** Behaviour name (default `altRepeat`). */
  id?: string;
  at?: FeaturePlacement[];
  /** First stage; the implicit default is the repeat key. */
  triggers: AdaptiveTrigger[];
  /**
   * Branches that fire only when the previous press carried one of `afterTags` — what replaces the
   * one-shot "alt repeat 2" layer the firmware needs.
   */
  secondStage?: { afterTags: string[]; triggers: AdaptiveTrigger[] };
}

/** Shift the first letter after sentence-ending punctuation. */
export interface SentenceCaseFeature {
  enabled?: boolean;
  /** Punctuation that ends a sentence (default `.`, `?`, `!`). */
  after?: string[];
  /** Key that types the space; `keys.space` when omitted. */
  key?: string;
  /** Layers whose space key gets the behaviour; the base layer when omitted. */
  on?: string[];
  /** Modifier armed for the next press (default `LSHIFT`). */
  mod?: Mod;
}

/** Hold shift for the rest of the word. */
export interface CapsWordFeature {
  enabled?: boolean;
  /** Key that turns it on; `keys.shift.key` when omitted. */
  key?: string;
  on?: string[];
  /** Modifiers that must already be active for the key to turn it on (default: both shifts). */
  triggerMods?: Mod[];
  /** Modifiers it applies (default `LSHIFT`). */
  mods?: Mod[];
  /** Symbols that do not end the word. */
  continueList?: string[];
}

/**
 * Typing behaviours that firmware implements with layers, declared here as what they are.
 *
 * A keymap needs a pre-shifted copy of a layer, or a one-shot layer armed by a macro, only because
 * of what firmware can express. The simulator has no such limit, so these are declared once and the
 * compiler desugars them into ordinary bindings. That keeps the layer list the set of layers a
 * typist actually reaches, and makes the behaviours editable without hand-written JSON.
 */
export interface LayoutFeatures {
  adaptiveKeys?: AdaptiveKeyFeature[];
  altRepeat?: AltRepeatFeature;
  sentenceCase?: SentenceCaseFeature;
  capsWord?: CapsWordFeature;
}

export interface Layout {
  format: 'layoutmaster/layout@1';
  id?: string;
  name: string;
  author?: string;
  description?: string;
  languages?: string[];
  hostLocale?: HostLocale;
  geometry: GeometryRef;
  fingering?: FingeringMode | Record<string, Finger>;
  keys: {
    space: string;
    shift?: { key: string; kind: 'sk' | 'hold' };
  };
  behaviorDefaults?: BehaviorDefaults;
  layers: LayerDef[];
  features?: LayoutFeatures;
  behaviors?: Record<string, Binding>;
  combos?: ComboDef[];
  conditionalLayers?: ConditionalLayerDef[];
  typingPaths?: Record<string, TypingPathEntry[]>;
  repeatPolicy?: { doubledLetters?: 'repeatKey' | 'tapTwice' };
  activators?: Record<string, ActivatorDef[]>;
}
