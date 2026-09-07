import type { CompiledLayout } from './compile.js';
import type { Binding, Mod } from './types.js';

export type LegendKind = 'alpha' | 'layer' | 'mod' | 'repeat' | 'magic' | 'trans' | 'none';

export interface Legend {
  tap: string;
  hold: string | null;
  kind: LegendKind;
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

function adaptiveLabel(c: CompiledLayout, b: Extract<Binding, { kind: 'adaptive' }>): string {
  const def = b.default ? tapLabel(c, b.default) : '';
  const alts: string[] = [];
  for (const t of b.triggers ?? []) {
    const l = tapLabel(c, t.binding);
    if (l !== '' && l !== def && !alts.includes(l)) alts.push(l);
    if (alts.length === 2) break;
  }
  return [def, ...alts].filter((l) => l !== '').join('|');
}

/** The legend printed in the middle of a key. */
export function tapLabel(c: CompiledLayout, b: Binding): string {
  switch (b.kind) {
    case 'kp':
      if (b.symbol === ' ') return '␣';
      return b.symbol ?? b.keycode ?? '';
    case 'trans':
    case 'none':
      return '';
    case 'sl':
      return `→${short(layerName(c, b.layer))}`;
    case 'mo':
      return `⇩${short(layerName(c, b.layer))}`;
    case 'lt':
      return tapLabel(c, b.tap);
    case 'tog':
      return `⇄${short(layerName(c, b.layer))}`;
    case 'to':
      return `⇒${short(layerName(c, b.layer))}`;
    case 'sk':
      return b.mod === 'LSHIFT' || b.mod === 'RSHIFT' ? '⇧' : MOD_GLYPH[b.mod];
    case 'mod':
      return MOD_GLYPH[b.mod];
    case 'caps_word':
      return '⇪';
    case 'auto_layer':
      return `⇪${short(layerName(c, b.layer))}`;
    case 'key_repeat':
      return '⟳';
    case 'hold_tap':
      return tapLabel(c, b.tap);
    case 'mod_morph':
      return tapLabel(c, b.default);
    case 'layer_morph':
      return tapLabel(c, b.inactive);
    case 'adaptive':
      return adaptiveLabel(c, b);
    case 'tap_dance':
      return b.bindings.length > 0 ? tapLabel(c, b.bindings[0]) : '';
    case 'macro':
      return b.symbols ?? (b.steps ? b.steps.map((s) => tapLabel(c, s)).join('') : '⋯') ?? '⋯';
    case 'dead_key':
      return b.diacritic;
    case 'unicode':
      return b.symbol;
    default:
      return '';
  }
}

function holdOf(c: CompiledLayout, b: Binding): string {
  if (b.kind === 'mo') return short(layerName(c, b.layer));
  if (b.kind === 'mod') return MOD_GLYPH[b.mod];
  return tapLabel(c, b);
}

/** The smaller legend along the bottom of a key, for what a hold does. */
export function holdLabel(c: CompiledLayout, b: Binding): string | null {
  if (b.kind === 'hold_tap') return holdOf(c, b.hold);
  if (b.kind === 'lt') return short(layerName(c, b.layer));
  if (b.kind === 'mod_morph') return holdLabel(c, b.default);
  return null;
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
      return 'layer';
    case 'sk':
    case 'mod':
    case 'caps_word':
    case 'auto_layer':
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
    default:
      return 'none';
  }
}

export function legend(c: CompiledLayout, b: Binding): Legend {
  return { tap: tapLabel(c, b), hold: holdLabel(c, b), kind: legendKind(b) };
}
