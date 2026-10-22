import type { CompiledLayout } from './compile.js';
import { type Chooser, type Choosing, heldPart, partOf } from './parts.js';
import {
  type AdaptiveTrigger,
  type Binding,
  FAMILY_MODS,
  familyOf,
  type Mod,
  type ModChoice,
  type ModFamily,
  modsMet,
} from './types.js';

const SHIFTS: ReadonlySet<Mod> = new Set(FAMILY_MODS.shift);
const HELD: Choosing = { press: 'hold' };
/** A layer-tap is a layer key, and an adaptive key has its own colour, whatever they type. */
const COLOURED: ReadonlySet<Chooser> = new Set(['lt', 'adaptive']);
/** The keys marked in a corner, seen before the part they type. */
const MARKED: ReadonlySet<Chooser> = new Set(['adaptive', 'tap_dance']);
/** What a key types shifted is read off a mod morph before its plain part. */
const SHIFT_MORPHS: ReadonlySet<Chooser> = new Set(['mod_morph']);

export type LegendKind =
  | 'alpha'
  | 'layer'
  | 'mod'
  | 'repeat'
  | 'adaptive'
  | 'trans'
  | 'none'
  | 'raw';

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
  /** The centre is a dead key's accent, which waits for the next letter rather than typing. */
  dead: boolean;
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

/** A held modifier's glyphs: those held with it, then its own. */
function modGlyphs(b: { mod: Mod; also?: Mod[] }): string {
  return [...(b.also ?? []), b.mod].map((m) => MOD_GLYPH[m]).join('');
}

/** A modifier family as a sentence names it, either side alike. */
export const FAMILY_NAME: Record<ModFamily, string> = {
  shift: 'Shift',
  ctrl: 'Control',
  alt: 'Alt',
  gui: 'Command',
};

/** A choice of modifiers in words: "Shift" for both shifts, "left Shift or left Alt" otherwise. */
export function modChoiceText(choice: ModChoice): string {
  const family = familyOf(choice);
  if (family && sameMods(choice, FAMILY_MODS[family])) return FAMILY_NAME[family];
  const names = [...new Set(choice)].map((m) => MOD_NAME[m]);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

function sameMods(a: ModChoice, b: ModChoice): boolean {
  return a.every((m) => b.includes(m)) && b.every((m) => a.includes(m));
}

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
  if (b.kind === 'dead_key' && b.shifted !== undefined) return b.shifted;
  if (b.kind === 'mod_morph' && modsMet(b.mods, SHIFTS)) {
    const morphed = tapLabel(c, b.morphed);
    return morphed === '' ? null : morphed;
  }
  return null;
}

/** Layer and sticky-modifier keys draw their mode where a held action would otherwise go. */
function holdIsModeOf(b: Binding): boolean {
  return heldPart(b) === null && modeOf(partOf(b)) !== null;
}

/** How a layer or sticky-modifier key brings its layer or modifier on, in the board's words. */
function modeOf(b: Binding): string | null {
  switch (b.kind) {
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

/** The legend printed in the middle of a key: its Plain part's. */
export function tapLabel(c: CompiledLayout, b: Binding): string {
  const p = partOf(b);
  switch (p.kind) {
    case 'kp':
      return symbolText(p.symbol, p.keycode);
    case 'trans':
      return '▽';
    case 'sl':
    case 'mo':
    case 'tog':
    case 'to':
    case 'auto_layer':
      return short(layerName(c, p.layer));
    case 'sk':
      return MOD_GLYPH[p.mod];
    case 'mod':
      return modGlyphs(p);
    case 'caps_word':
      return '⇪';
    case 'key_repeat':
      return '⟳';
    case 'macro':
      return p.symbols ?? (p.steps ? p.steps.map((s) => tapLabel(c, s)).join('') : '⋯');
    // The spacing accent, which every font has; a combining mark on a dotted circle draws as a box in
    // a phone's fallback font. That the key is dead is the board's styling to show (`Legend.dead`).
    case 'dead_key':
      return p.diacritic;
    case 'unicode':
      return p.symbol;
    case 'raw':
      return p.label;
    // A key that does something shows something. An adaptive key with no default has its
    // alternatives listed under the board, where they have room; its mark stands in for them.
    case 'adaptive':
      return BADGE.adaptive;
    case 'tap_dance':
      return BADGE.tapDance;
    case 'ref':
      // Compiling puts the behaviour itself in its place, so only a binding not compiled yet, as the
      // editor's text line previews one, still names it.
      return p.ref;
    default:
      return '';
  }
}

function holdOf(c: CompiledLayout, b: Binding): string {
  if (b.kind === 'mo') return short(layerName(c, b.layer));
  if (b.kind === 'mod') return modGlyphs(b);
  return tapLabel(c, b);
}

/** The smaller legend along the bottom of a key: what a hold does, or how a layer comes on. */
export function holdLabel(c: CompiledLayout, b: Binding): string | null {
  const held = heldPart(b);
  return held ? holdOf(c, held) : modeOf(partOf(b));
}

/** Which colour family a key belongs to: its Plain part's, or a layer-tap's or an adaptive key's. */
export function legendKind(b: Binding): LegendKind {
  const p = partOf(b, { stopAt: COLOURED });
  switch (p.kind) {
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
      return 'adaptive';
    case 'trans':
      return 'trans';
    case 'raw':
      return 'raw';
    default:
      return 'none';
  }
}

function badgeOf(b: Binding): string | null {
  const p = partOf(b, { stopAt: MARKED });
  switch (p.kind) {
    case 'adaptive':
      return BADGE.adaptive;
    case 'macro':
      return BADGE.macro;
    case 'tap_dance':
      return BADGE.tapDance;
    case 'unicode':
      return BADGE.unicode;
    default:
      return null;
  }
}

function layerOf(b: Binding): { layer: string; layerIn: 'tap' | 'hold' } | null {
  // Any layer key on a hold: held, one-shot, toggle, switch or auto.
  const held = heldPart(b);
  const layer = layerKeyOf(held ? partOf(held, HELD) : partOf(b));
  return layer === null ? null : { layer, layerIn: held ? 'hold' : 'tap' };
}

function layerKeyOf(b: Binding): string | null {
  switch (b.kind) {
    case 'mo':
    case 'sl':
    case 'tog':
    case 'to':
    case 'auto_layer':
      return b.layer;
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
      return `holds ${[b.mod, ...(b.also ?? [])].map((m) => MOD_NAME[m]).join(' and ')}`;
    case 'caps_word':
      return 'caps word: capitals until the word ends';
    case 'key_repeat':
      return 'repeats the previous key';
    case 'hold_tap':
      return `tap: ${describe(c, b.tap)}; hold: ${describe(c, b.hold)}`;
    case 'mod_morph':
      return `${describe(c, b.default)}; with ${modChoiceText(b.mods)}: ${describe(c, b.morphed)}`;
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
      // An adaptive key can fall back to another — a document's behaviour can — and saying
      // "adaptive" twice explains nothing. The branches are read
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
      return `dead key ${b.diacritic}${b.shifted ? `, ${b.shifted} with shift` : ''}: accents the next letter`;
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
  // A key that only holds, a layer while it is held or a modifier, is drawn as a tap-hold that
  // taps nothing: an empty centre, and what it holds along the bottom.
  if (b.kind === 'mo' || b.kind === 'mod') {
    const held = legend(c, { kind: 'hold_tap', tap: { kind: 'none' }, hold: b });
    return { ...held, kind: legendKind(b), detail: describe(c, b) };
  }
  const hold = holdLabel(c, b);
  const layer = layerOf(b);
  const direct = partOf(b, { stopAt: SHIFT_MORPHS });
  // A chooser with nothing to choose, an adaptive key with no default or an empty tap dance, is its
  // own Plain part: its mark is drawn in the centre, and not again in the corner. Only the mark of
  // that chooser itself goes; a marked chooser around it keeps its own.
  const plain = partOf(b);
  const empty =
    (plain.kind === 'adaptive' || plain.kind === 'tap_dance') &&
    partOf(b, { stopAt: MARKED }) === plain;
  return {
    tap: tapLabel(c, b),
    hold,
    kind: legendKind(b),
    shifted: shiftedOf(c, direct),
    badge: empty ? null : badgeOf(b),
    layer: layer?.layer ?? null,
    layerIn: layer?.layerIn ?? null,
    holdIsMode: holdIsModeOf(b),
    dead: plain.kind === 'dead_key',
    detail: describe(c, b),
  };
}

/** A legend as one line, for tables and announcements where the key itself is not drawn. */
export function legendText(l: Legend): string {
  const hold =
    l.hold === null
      ? ''
      : l.holdIsMode
        ? ` (${l.hold})`
        : l.tap
          ? ` / ${l.hold}`
          : `hold ${l.hold}`;
  return `${l.tap}${hold}${l.badge ? ` ${l.badge}` : ''}`;
}
