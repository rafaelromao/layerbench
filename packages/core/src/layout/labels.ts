import type { CompiledLayout } from './compile.js';
import type { AdaptiveTrigger, Binding, Mod } from './types.js';

export type LegendKind = 'alpha' | 'layer' | 'mod' | 'repeat' | 'magic' | 'trans' | 'none' | 'raw';

/**
 * How a key is drawn, in the places keymap-drawer uses so that one reads like the other.
 *
 * - the centre says what the key types, or which layer it reaches;
 * - the band along the bottom says what happens while it is held — a layer or a modifier — or,
 *   for a layer key, how the layer comes on;
 * - the top says what shift types, where that is not simply the capital;
 * - a corner mark flags behaviour the centre cannot show: adaptive, macro, tap dance.
 *
 * `detail` says all of it in words, for the legend under the board and for a screen reader.
 */
export interface Legend {
  tap: string;
  hold: string | null;
  kind: LegendKind;
  shifted: string | null;
  badge: string | null;
  /** The layer the key reaches, and which of its legends names it, for colouring that legend. */
  layer: string | null;
  layerIn: 'tap' | 'hold' | null;
  /** True when `hold` names how a layer comes on ("1×", "toggle"), not something held. */
  holdIsMode: boolean;
  detail: string;
}

const MOD_GLYPH: Record<Mod, string> = {
  LSHIFT: '⇧',
  RSHIFT: '⇧',
  LCTRL: '⌃',
  RCTRL: '⌃',
  LALT: '⌥',
  RALT: '⌥',
  LGUI: '⌘',
  RGUI: '⌘',
};

/** A modifier as a sentence names it. */
export const MOD_NAME: Record<Mod, string> = {
  LSHIFT: 'left Shift',
  RSHIFT: 'right Shift',
  LCTRL: 'left Control',
  RCTRL: 'right Control',
  LALT: 'left Alt',
  RALT: 'right Alt',
  LGUI: 'left Command',
  RGUI: 'right Command',
};

/** The words drawn under a layer key, for each way it can bring the layer on. */
export const LAYER_MODE = {
  mo: 'hold',
  sl: '1×',
  tog: 'toggle',
  to: 'switch',
  auto_layer: 'auto',
} as const;

/** The corner marks, and what each means. */
export const BADGE = {
  adaptive: '✦',
  macro: '⋯',
  tapDance: 'TD',
  unicode: 'U+',
} as const;

/** Spacing diacritics as the combining marks a dotted circle can carry, so `´` draws as `◌́`. */
const COMBINING: Record<string, string> = {
  '´': '́',
  '`': '̀',
  '^': '̂',
  '~': '̃',
  '¨': '̈',
  '˘': '̆',
  '¸': '̧',
  '˚': '̊',
};

/** Layer names are abbreviated to fit a key: initials for multi-word names, else the first four. */
export function short(name: string): string {
  if ([...name].length <= 4) return name;
  if (name.includes(' ')) {
    return name
      .split(' ')
      .map((w) => [...w][0] ?? '')
      .join('')
      .toUpperCase();
  }
  return [...name].slice(0, 4).join('');
}

function layerName(c: CompiledLayout, id: string): string {
  const idx = c.layerIndex.get(id);
  return idx === undefined ? id : c.layers[idx].name;
}

function symbolText(symbol: string | undefined, keycode: string | undefined): string {
  if (symbol === ' ') return '␣';
  return symbol ?? keycode ?? '';
}

/** What a key types when shifted, where that says more than the capital would. */
function shiftedOf(c: CompiledLayout, b: Binding): string | null {
  if (b.kind === 'kp' && b.shifted !== undefined && b.symbol !== undefined) {
    return b.shifted === b.symbol.toUpperCase() ? null : b.shifted;
  }
  if (b.kind === 'unicode' && b.shiftedSymbol !== undefined) return b.shiftedSymbol;
  if (b.kind === 'mod_morph' && b.mods.some((m) => m === 'LSHIFT' || m === 'RSHIFT')) {
    const morphed = tapLabel(c, b.morphed);
    return morphed === '' ? null : morphed;
  }
  return null;
}

/** Layer and sticky-modifier keys draw their mode where a held action would otherwise go. */
function holdIsModeOf(b: Binding): boolean {
  switch (b.kind) {
    case 'mo':
    case 'sl':
    case 'tog':
    case 'to':
    case 'auto_layer':
    case 'sk':
      return true;
    default:
      return false;
  }
}

/** The legend printed in the middle of a key. */
export function tapLabel(c: CompiledLayout, b: Binding): string {
  switch (b.kind) {
    case 'kp':
      return symbolText(b.symbol, b.keycode);
    case 'trans':
      return '▽';
    case 'none':
      return '';
    case 'sl':
    case 'mo':
    case 'tog':
    case 'to':
    case 'auto_layer':
      return short(layerName(c, b.layer));
    case 'lt':
      return tapLabel(c, b.tap);
    case 'sk':
    case 'mod':
      return MOD_GLYPH[b.mod];
    case 'caps_word':
      return '⇪';
    case 'key_repeat':
      return '⟳';
    case 'hold_tap':
      return tapLabel(c, b.tap);
    case 'mod_morph':
      return tapLabel(c, b.default);
    case 'layer_morph':
      return tapLabel(c, b.inactive);
    case 'adaptive':
      // Only the default: the alternatives are listed under the board, where they have room.
      return b.default ? tapLabel(c, b.default) : '';
    case 'tap_dance':
      return b.bindings.length > 0 ? tapLabel(c, b.bindings[0]) : '';
    case 'macro':
      return b.symbols ?? (b.steps ? b.steps.map((s) => tapLabel(c, s)).join('') : '⋯');
    case 'dead_key':
      return COMBINING[b.diacritic] ? `◌${COMBINING[b.diacritic]}` : b.diacritic;
    case 'unicode':
      return b.symbol;
    case 'raw':
      return b.label;
    default:
      return '';
  }
}

function holdOf(c: CompiledLayout, b: Binding): string {
  if (b.kind === 'mo') return short(layerName(c, b.layer));
  if (b.kind === 'mod') return MOD_GLYPH[b.mod];
  return tapLabel(c, b);
}

/** The smaller legend along the bottom of a key: what a hold does, or how a layer comes on. */
export function holdLabel(c: CompiledLayout, b: Binding): string | null {
  switch (b.kind) {
    case 'hold_tap':
      return holdOf(c, b.hold);
    case 'lt':
      return short(layerName(c, b.layer));
    case 'mod_morph':
      return holdLabel(c, b.default);
    case 'mo':
    case 'sl':
    case 'tog':
    case 'to':
    case 'auto_layer':
      return LAYER_MODE[b.kind];
    case 'sk':
      return LAYER_MODE.sl;
    default:
      return null;
  }
}

/** Which colour family a key belongs to. */
export function legendKind(b: Binding): LegendKind {
  switch (b.kind) {
    case 'kp':
    case 'unicode':
    case 'macro':
    case 'dead_key':
      return 'alpha';
    case 'sl':
    case 'mo':
    case 'lt':
    case 'tog':
    case 'to':
    case 'auto_layer':
      return 'layer';
    case 'sk':
    case 'mod':
    case 'caps_word':
      return 'mod';
    case 'key_repeat':
      return 'repeat';
    case 'adaptive':
      return 'magic';
    case 'hold_tap':
      return legendKind(b.tap);
    case 'mod_morph':
      return legendKind(b.default);
    case 'layer_morph':
      return legendKind(b.inactive);
    case 'tap_dance':
      return b.bindings.length > 0 ? legendKind(b.bindings[0]) : 'none';
    case 'trans':
      return 'trans';
    case 'raw':
      return 'raw';
    default:
      return 'none';
  }
}

function badgeOf(b: Binding): string | null {
  switch (b.kind) {
    case 'adaptive':
      return BADGE.adaptive;
    case 'macro':
      return BADGE.macro;
    case 'tap_dance':
      return BADGE.tapDance;
    case 'unicode':
      return BADGE.unicode;
    case 'hold_tap':
    case 'lt':
      return badgeOf(b.tap);
    default:
      return null;
  }
}

function layerOf(b: Binding): { layer: string; layerIn: 'tap' | 'hold' } | null {
  switch (b.kind) {
    case 'mo':
    case 'sl':
    case 'tog':
    case 'to':
    case 'auto_layer':
      return { layer: b.layer, layerIn: 'tap' };
    case 'lt':
      return { layer: b.layer, layerIn: 'hold' };
    case 'hold_tap':
      return b.hold.kind === 'mo' ? { layer: b.hold.layer, layerIn: 'hold' } : null;
    default:
      return null;
  }
}

/**
 * A trigger in words. A tag is a condition on how the previous key was pressed, not another
 * symbol it might have been, so it is said separately rather than listed among the symbols.
 */
function triggerText(c: CompiledLayout, t: AdaptiveTrigger): string {
  const symbols = (t.afterAny ?? []).join(' ');
  const tags = (t.afterTags ?? []).join(' or ');
  const after = [symbols, tags ? `a key tagged ${tags}` : ''].filter(Boolean).join(', from ');
  return `after ${after || '…'} → ${describe(c, t.binding)}`;
}

/** Everything a binding does, in words. */
export function describe(c: CompiledLayout, b: Binding): string {
  switch (b.kind) {
    case 'kp': {
      const s = b.symbol === ' ' ? 'a space' : symbolText(b.symbol, b.keycode);
      const shifted = shiftedOf(c, b);
      return shifted ? `types ${s}, ${shifted} with shift` : `types ${s}`;
    }
    case 'trans':
      return 'transparent: the layer below shows through';
    case 'none':
      return 'does nothing';
    case 'mo':
      return `hold for ${layerName(c, b.layer)}`;
    case 'sl':
      return `${layerName(c, b.layer)} for the next key (one-shot)`;
    case 'tog':
      return `toggles ${layerName(c, b.layer)}`;
    case 'to':
      return `switches to ${layerName(c, b.layer)}`;
    case 'auto_layer':
      return `${layerName(c, b.layer)} until a word ends (auto layer)`;
    case 'lt':
      return `${describe(c, b.tap)}; hold for ${layerName(c, b.layer)}`;
    case 'sk':
      return `${MOD_NAME[b.mod]} for the next key (one-shot)`;
    case 'mod':
      return `holds ${MOD_NAME[b.mod]}`;
    case 'caps_word':
      return 'caps word: capitals until the word ends';
    case 'key_repeat':
      return 'repeats the previous key';
    case 'hold_tap':
      return `tap: ${describe(c, b.tap)}; hold: ${describe(c, b.hold)}`;
    case 'mod_morph':
      return `${describe(c, b.default)}; with ${b.mods.map((m) => MOD_NAME[m]).join(' or ')}: ${describe(c, b.morphed)}`;
    case 'layer_morph':
      return `${describe(c, b.inactive)}; on ${b.layers.map((l) => layerName(c, l)).join(' or ')}: ${describe(c, b.active)}`;
    case 'tap_dance':
      return b.bindings.map((t, i) => `${i + 1}× ${describe(c, t)}`).join('; ');
    case 'macro': {
      const then = b.then?.[0]?.kind === 'sl' ? `, then ${describe(c, b.then[0])}` : '';
      if (b.symbols) return `types ${b.symbols}${then}`;
      // Letters typed one after another read as the text they make, not as a press each.
      const parts: string[] = [];
      let typed = '';
      const flush = () => {
        if (typed) parts.push(`types ${typed === ' ' ? 'a space' : typed}`);
        typed = '';
      };
      for (const s of b.steps ?? []) {
        if (s.kind === 'kp' && s.symbol && !s.keycode && s.shifted === undefined) {
          typed += s.symbol;
          continue;
        }
        flush();
        const d = describe(c, s);
        if (d !== '') parts.push(d);
      }
      flush();
      return parts.length > 0 ? `${parts.join(', then ')}${then}` : 'an empty macro';
    }
    case 'adaptive': {
      // An adaptive key can fall back to another — a document's behaviour can, as Romak 24's
      // `a2AltRepeat` does — and saying "adaptive" twice explains nothing. The branches are read
      // outermost first, which is the order they are tried in, down to the innermost default.
      const branches: string[] = [];
      let at: Binding | undefined = b;
      while (at?.kind === 'adaptive') {
        for (const t of at.triggers ?? []) branches.push(triggerText(c, t));
        at = at.default;
      }
      const fallback = at ? describe(c, at) : 'nothing by default';
      return `adaptive: ${[fallback, ...branches].join('; ')}`;
    }
    case 'dead_key':
      return `dead key ${b.diacritic}: accents the next letter`;
    case 'unicode':
      return `types ${b.symbol}${b.shiftedSymbol ? `, ${b.shiftedSymbol} with shift` : ''}`;
    case 'raw':
      return `${b.label}: imported, not simulated`;
    case 'ref':
      return `behaviour ${b.ref}`;
    default:
      return '';
  }
}

export function legend(c: CompiledLayout, b: Binding): Legend {
  const hold = holdLabel(c, b);
  const layer = layerOf(b);
  const direct = b.kind === 'hold_tap' || b.kind === 'lt' ? b.tap : b;
  return {
    tap: tapLabel(c, b),
    hold,
    kind: legendKind(b),
    shifted: shiftedOf(c, direct),
    badge: badgeOf(b),
    layer: layer?.layer ?? null,
    layerIn: layer?.layerIn ?? null,
    holdIsMode: holdIsModeOf(b),
    detail: describe(c, b),
  };
}

/** A legend as one line, for tables and announcements where the key itself is not drawn. */
export function legendText(l: Legend): string {
  const hold = l.hold === null ? '' : l.holdIsMode ? ` (${l.hold})` : ` / ${l.hold}`;
  return `${l.tap}${hold}${l.badge ? ` ${l.badge}` : ''}`;
}
