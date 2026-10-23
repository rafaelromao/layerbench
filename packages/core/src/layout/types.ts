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

/** A modifier and its twin on the other side of the board. */
export type ModFamily = 'shift' | 'ctrl' | 'alt' | 'gui';

export const FAMILY_MODS: Record<ModFamily, readonly Mod[]> = {
  shift: ['LSHIFT', 'RSHIFT'],
  ctrl: ['LCTRL', 'RCTRL'],
  alt: ['LALT', 'RALT'],
  gui: ['LGUI', 'RGUI'],
};

/** The first family, in `FAMILY_MODS` order, that one of `mods` belongs to, or null for none. */
export function familyOf(mods: readonly Mod[]): ModFamily | null {
  for (const [family, members] of Object.entries(FAMILY_MODS) as [ModFamily, readonly Mod[]][]) {
    if (members.some((m) => mods.includes(m))) return family;
  }
  return null;
}

/**
 * Modifiers any one of which will do, as a mod morph's: it morphs when one of them is held. A key
 * that needs several held at once needs several choices.
 */
export type ModChoice = readonly Mod[];

/** Whether one of the choice's modifiers is held and not set aside. */
export function modsMet(
  choice: ModChoice,
  held: ReadonlySet<Mod>,
  except?: ReadonlySet<Mod>,
): boolean {
  for (const m of choice) if (held.has(m) && !except?.has(m)) return true;
  return false;
}

export type HostLocale = 'symbols' | 'us' | 'us-intl' | 'abnt2';

/**
 * One branch of an adaptive key. Branches are tried in order and the first that matches wins, so
 * branches that need a tag go first when a plain one would match the same symbol: that is how an
 * alt repeat gets a second stage.
 */
export interface AdaptiveTrigger {
  /** Last keycodes/symbols that trigger this branch. Empty or absent with tags: any symbol. */
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
  /** A modifier held, and `also` those held with it, as ZMK's `LS(LGUI)` holds Shift with Gui. */
  | { kind: 'mod'; mod: Mod; also?: Mod[] }
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
      /** Recorded as the last press's tag, for adaptive branches that key off it. */
      tag?: string;
    }
  | {
      kind: 'adaptive';
      default?: Binding;
      triggers?: AdaptiveTrigger[];
      strictModifiers?: boolean;
      deadKeys?: string[];
    }
  | { kind: 'hold_tap'; tap: Binding; hold: Binding; flavor?: string; tappingTermMs?: number }
  /** An accent for the next letter; `shifted` is the one armed when shift is on, as `´` and `¨`. */
  | { kind: 'dead_key'; diacritic: string; shifted?: string }
  | { kind: 'unicode'; symbol: string; shiftedSymbol?: string };

export type BindingKind = Binding['kind'];

/**
 * The colours a layer can be drawn in, in the order the app's palette gives them to layers that
 * choose none. Each has a light and a dark shade tuned to stay readable on a key, so a layer names
 * one rather than giving a colour of its own.
 */
export const LAYER_COLORS = ['blue', 'green', 'amber', 'red', 'violet', 'teal', 'lime'] as const;
export type LayerColor = (typeof LAYER_COLORS)[number];

export interface LayerDef {
  id: string;
  name?: string;
  /** The colour its tab, and the keys that reach it, are drawn in; by its place when absent. */
  color?: LayerColor;
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

/**
 * The most layers a conditional layer may wait for, none of them conditional itself. The analysis
 * tries every order of them to bring them on together, which stays a few tries at four.
 */
export const MAX_CONDITION_LAYERS = 4;

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
 * A keymap needs a pre-shifted copy of a layer only because of what firmware can express. The
 * simulator has no such limit, so these are declared once and the compiler wraps the key they
 * belong to — the space key, the shift key — in ordinary bindings. That keeps the layer list the set
 * of layers a typist actually reaches.
 *
 * Adaptive keys and alt repeats are not features: they are `adaptive` bindings on their keys, made
 * and edited like any other. A branch's `afterTags` replaces the one-shot layer an accent macro arms
 * in firmware so the repeat key can follow up.
 */
export interface LayoutFeatures {
  sentenceCase?: SentenceCaseFeature;
  capsWord?: CapsWordFeature;
}

export interface Layout {
  format: 'layerbench/layout@1';
  id?: string;
  name: string;
  author?: string;
  description?: string;
  /** Where the layout comes from (the author's keymap, firmware or page): one http(s) URL. */
  link?: string;
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
  combos?: ComboDef[];
  conditionalLayers?: ConditionalLayerDef[];
  typingPaths?: Record<string, TypingPathEntry[]>;
  repeatPolicy?: { doubledLetters?: 'repeatKey' | 'tapTwice' };
  activators?: Record<string, ActivatorDef[]>;
}
