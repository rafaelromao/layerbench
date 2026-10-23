import { DEFAULT_LAYER_ID_LIST, hasDefaultLayers } from '../layouts/templates.js';
import { buildGeometry } from './compile.js';
import { expandFeatures, type WrappingFeature } from './features.js';
import type { Binding, LayerDef, Layout } from './types.js';

/**
 * What sets a layout apart from one that only places letters and layers: a key that changes with
 * what was typed before it, one that types several symbols, or one that changes with the modifiers
 * held.
 */
export type SpecialFeatureKind = 'adaptive' | 'alt_repeat' | 'macro' | 'mod_morph';

/** One use of a special feature: on a key of a layer, or on a combo. */
export interface SpecialFeature {
  feature: SpecialFeatureKind;
  layer?: string;
  key?: string;
  combo?: string;
  /** Where the combo stands in the layout's list: two combos may share an id. */
  comboIndex?: number;
  label: string;
}

/** Every layout is in exactly one, worked out from its own keys. */
export type LayoutCategory = 'standard' | 'thumb_alpha' | 'special';

/** In the order the Library lists them. */
export const LAYOUT_CATEGORIES: readonly LayoutCategory[] = ['standard', 'thumb_alpha', 'special'];

export const CATEGORY_NAMES: Record<LayoutCategory, string> = {
  standard: 'Standard',
  thumb_alpha: 'Thumb Alpha',
  special: 'Special',
};

/** Fewer physical keys than this and a board is Special by its size. */
export const STANDARD_MIN_KEYS = 34;

/** A thumb key typing a letter on an alpha layer. */
export interface ThumbAlpha {
  layer: string;
  key: string;
  letter: string;
}

/**
 * Whether a layer of a layout is one of the default layers, which never count toward a category: a
 * layer of their ids on a layout that has them. A layout that keeps its author's layers has none, its
 * Numbers and Symbols being its author's own.
 */
const isDefaultLayer = (layout: Pick<Layout, 'layers'>) => {
  const defaults = hasDefaultLayers(layout);
  return (id: string) => defaults && DEFAULT_LAYER_ID_LIST.includes(id);
};

/** The letter a key types by itself, a `kp` or a `unicode` one, lower-cased, or null for anything else. */
function letterOf(b: Binding): string | null {
  const s = b.kind === 'kp' ? (b.symbol ?? b.keycode) : b.kind === 'unicode' ? b.symbol : undefined;
  return s !== undefined && /^[a-z]$/i.test(s) ? s.toLowerCase() : null;
}

/**
 * The parts a binding can amount to, past the ones that choose: both halves of a tap-hold, a
 * layer-tap's tap, both sides of a morph, every tap of a tap dance, an adaptive key's default and
 * branches. A macro has none: what it types is not a key typing a letter by itself.
 */
function choices(b: Binding): Binding[] {
  switch (b.kind) {
    case 'hold_tap':
      return [b.tap, b.hold];
    case 'lt':
      return [b.tap];
    case 'mod_morph':
      return [b.default, b.morphed];
    case 'layer_morph':
      return [b.active, b.inactive];
    case 'sentence_morph':
      return [b.default, b.pending];
    case 'tap_dance':
      return b.bindings;
    case 'adaptive':
      return [...(b.default ? [b.default] : []), ...(b.triggers ?? []).map((t) => t.binding)];
    default:
      return [];
  }
}

/** The letters a binding types by itself, through its choices. */
function lettersOf(b: Binding, out: Set<string>): Set<string> {
  const letter = letterOf(b);
  if (letter) out.add(letter);
  for (const c of choices(b)) lettersOf(c, out);
  return out;
}

/** The layers that are the layout's own: the default layers, where it has them, never count. */
function ownLayers(layout: Layout) {
  const isDefault = isDefaultLayer(layout);
  return layout.layers.filter((l) => !isDefault(l.id));
}

/** The layers where at least one key types a letter a–z by itself, by id, in the layout's order. */
export function alphaLayers(layout: Layout): string[] {
  const keys = buildGeometry(layout).keys.map((k) => k.id);
  return ownLayers(layout)
    .filter((l) =>
      keys.some((key) => {
        const b = bindingAt(l, key);
        return b !== undefined && lettersOf(b, new Set()).size > 0;
      }),
    )
    .map((l) => l.id);
}

/** What a key of the board does on a layer: its own binding, or the layer's default, as compiled. */
function bindingAt(layer: LayerDef, key: string): Binding | undefined {
  return layer.bindings[key] ?? layer.bindings['*'];
}

/** Every letter a thumb key types on an alpha layer. */
export function thumbAlphas(layout: Layout): ThumbAlpha[] {
  const thumbs = buildGeometry(layout)
    .keys.filter((k) => k.thumb)
    .map((k) => k.id);
  const alphas = new Set(alphaLayers(layout));
  const out: ThumbAlpha[] = [];
  for (const layer of layout.layers) {
    if (!alphas.has(layer.id)) continue;
    for (const key of thumbs) {
      const b = bindingAt(layer, key);
      if (!b) continue;
      for (const letter of lettersOf(b, new Set())) out.push({ layer: layer.id, key, letter });
    }
  }
  return out;
}

/**
 * The board's physical keys, thumbs included. A row-stagger board's space bar is one key that
 * either thumb presses, drawn as two of the same shape at one spot: it counts once. Two thumb keys
 * of their own, as on a split space bar, count as two.
 */
export function physicalKeyCount(layout: Layout): number {
  const g = buildGeometry(layout);
  const l0 = g.keys.find((k) => k.id === 'L0');
  const r0 = g.keys.find((k) => k.id === 'R0');
  const same = (['x', 'y', 'w', 'h', 'rotation'] as const).every((k) => l0?.[k] === r0?.[k]);
  const oneBar = g.family === 'rowstagger' && l0 && r0 && same;
  return g.keys.length - (oneBar ? 1 : 0);
}

const FEATURE_LABELS: Record<Exclude<SpecialFeatureKind, 'macro'>, string> = {
  adaptive: 'Adaptive key',
  alt_repeat: 'Alt repeat',
  mod_morph: 'Mod morph',
};

interface Place {
  layer?: string;
  key?: string;
  combo?: string;
  comboIndex?: number;
}

/** The special features a binding is or holds, at the place it is bound. */
function featuresOf(b: Binding, at: Place, out: SpecialFeature[]): void {
  const emit = (feature: SpecialFeatureKind, label: string) => out.push({ feature, ...at, label });
  switch (b.kind) {
    case 'adaptive':
      if (b.default?.kind === 'key_repeat') emit('alt_repeat', FEATURE_LABELS.alt_repeat);
      else emit('adaptive', FEATURE_LABELS.adaptive);
      break;
    case 'mod_morph':
      emit('mod_morph', FEATURE_LABELS.mod_morph);
      break;
    // A space that changes what follows with what came before it, as sentence case is.
    case 'sentence_space':
      emit('adaptive', DECLARED.sentenceCase.label);
      break;
    case 'macro':
      emit('macro', b.symbols ? `Macro “${b.symbols}”` : 'Macro');
      // What it types is not a letter of the layer's, but what its steps use is used.
      for (const c of [...(b.steps ?? []), ...(b.then ?? [])]) featuresOf(c, at, out);
      return;
    default:
      break;
  }
  for (const c of choices(b)) featuresOf(c, at, out);
}

/**
 * What a declared feature makes of the key it goes on: caps word turns the shift key into a mod
 * morph, sentence case the space key into a sentence space, which changes with the key before it as
 * an adaptive key does. Each is one feature, named as itself.
 */
const DECLARED: Record<WrappingFeature, { feature: SpecialFeatureKind; label: string }> = {
  capsWord: { feature: 'mod_morph', label: 'Caps word' },
  sentenceCase: { feature: 'adaptive', label: 'Sentence case' },
};

/**
 * Whether a combo can fire on none of the layout's own layers: only on the default layers, or, with
 * an empty list, on none at all. A combo with no list fires on every layer.
 */
const onDefaultLayersOnly = (isDefault: (id: string) => boolean, layers: string[] | undefined) =>
  layers?.every(isDefault) === true;

/**
 * Each use of a special feature: on the keys of the layout's own layers, on its combos, and the keys
 * its declared features wrap. Nothing on the default layers counts.
 */
export function specialFeatures(layout: Layout): SpecialFeature[] {
  const out: SpecialFeature[] = [];
  // One feature at a time: two on one key wrap it twice, and each is a use of its own.
  const owned = (Object.keys(DECLARED) as WrappingFeature[]).map(
    (f) => expandFeatures({ ...layout, features: { [f]: layout.features?.[f] } }).owned,
  );
  const keys = buildGeometry(layout).keys.map((k) => k.id);
  const isDefault = isDefaultLayer(layout);
  for (const layer of ownLayers(layout)) {
    // Each key of the board as it is compiled: a layer default no key is left to is not a use.
    for (const key of keys) {
      const b = bindingAt(layer, key);
      if (b) featuresOf(b, { layer: layer.id, key }, out);
    }
    for (const byLayer of owned)
      for (const [key, f] of byLayer.get(layer.id) ?? [])
        out.push({ ...DECLARED[f], layer: layer.id, key });
  }
  (layout.combos ?? []).forEach((c, i) => {
    if (!onDefaultLayersOnly(isDefault, c.layers))
      featuresOf(c.binding, { combo: c.id ?? `#${i + 1}`, comboIndex: i }, out);
  });
  return out;
}

/**
 * Special with a special feature, more than one alpha layer, or a board of fewer than 34 keys;
 * otherwise Thumb Alpha when a thumb types a letter on an alpha layer; otherwise Standard.
 */
export function layoutCategory(layout: Layout): LayoutCategory {
  if (
    specialFeatures(layout).length > 0 ||
    alphaLayers(layout).length > 1 ||
    physicalKeyCount(layout) < STANDARD_MIN_KEYS
  )
    return 'special';
  return thumbAlphas(layout).length > 0 ? 'thumb_alpha' : 'standard';
}
