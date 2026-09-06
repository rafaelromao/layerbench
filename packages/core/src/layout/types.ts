import type { Finger, FingeringMode, GeometryKey } from '../geometry/types.js';

export type Mod = 'LSHIFT' | 'RSHIFT' | 'LCTRL' | 'RCTRL' | 'LALT' | 'RALT' | 'LGUI' | 'RGUI';

export const MODS: readonly Mod[] = ['LSHIFT', 'RSHIFT', 'LCTRL', 'RCTRL', 'LALT', 'RALT', 'LGUI', 'RGUI'];

export type HostLocale = 'symbols' | 'us' | 'us-intl' | 'abnt2';

export interface AdaptiveTrigger {
  /** Last keycodes/symbols that trigger this branch. */
  afterAny: string[];
  binding: Binding;
}

export type Binding =
  | { kind: 'kp'; symbol?: string; keycode?: string; shifted?: string }
  | { kind: 'trans' }
  | { kind: 'none' }
  | { kind: 'mo'; layer: string }
  | { kind: 'lt'; layer: string; tap: Binding }
  | { kind: 'sl'; layer: string; quickRelease?: boolean; ignoreModifiers?: boolean; releaseAfterMs?: number }
  | { kind: 'tog'; layer: string; mode?: 'flip' | 'on' | 'off' }
  | { kind: 'to'; layer: string }
  | { kind: 'sk'; mod: Mod; quickRelease?: boolean; ignoreModifiers?: boolean; releaseAfterMs?: number }
  | { kind: 'mod'; mod: Mod }
  | { kind: 'caps_word'; continueList?: string[]; mods?: Mod[] }
  | { kind: 'auto_layer'; layer: string; continueList?: string[] }
  | { kind: 'key_repeat' }
  | { kind: 'mod_morph'; mods: Mod[]; default: Binding; morphed: Binding; keepMods?: Mod[] }
  | { kind: 'layer_morph'; layers: string[]; match?: 'any' | 'all'; active: Binding; inactive: Binding }
  | { kind: 'tap_dance'; bindings: Binding[] }
  | { kind: 'macro'; steps?: Binding[]; symbols?: string; then?: Binding[]; ref?: string }
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
  | { kind: 'ref'; ref: string };

export type BindingKind = Binding['kind'];

export interface LayerDef {
  id: string;
  name?: string;
  /** Layer holding pre-shifted copies of this layer's alphas (used by shift modeling). */
  shiftedTwin?: string;
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
  behaviors?: Record<string, Binding>;
  combos?: ComboDef[];
  conditionalLayers?: ConditionalLayerDef[];
  typingPaths?: Record<string, TypingPathEntry[]>;
  repeatPolicy?: { doubledLetters?: 'repeatKey' | 'tapTwice' };
  activators?: Record<string, ActivatorDef[]>;
}
