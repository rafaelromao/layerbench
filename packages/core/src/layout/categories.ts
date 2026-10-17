import { DEFAULT_LAYER_ID_LIST } from '../layouts/templates.js';
import { buildGeometry } from './compile.js';
import { expandFeatures, type WrappingFeature } from './features.js';
import type { Binding, Layout } from './types.js';

/**
 * What sets a layout apart from one that only places letters and layers: a key that changes with
 * what was typed before it, one that types several symbols, one that changes with the modifiers
 * held, or a behaviour the layout names for itself.
 */
export type SpecialFeatureKind =
  | 'adaptive'
  | 'alt_repeat'
  | 'macro'
  | 'mod_morph'
  | 'custom_behaviour';

/**
 * One use of a special feature: on a key of a layer, on a combo, or, for a named behaviour no key
 * or combo uses, among the layout's behaviours, where it has neither.
 */
export interface SpecialFeature {
  feature: SpecialFeatureKind;
  layer?: string;
  key?: string;
  combo?: string;
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

const isDefaultLayer = (id: string) => DEFAULT_LAYER_ID_LIST.includes(id);

/** The letter a `kp` types by itself, lower-cased, or null for anything else. */
function letterOf(b: Binding): string | null {
  if (b.kind !== 'kp') return null;
  const s = b.symbol ?? b.keycode;
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
    case 'tap_dance':
      return b.bindings;
    case 'adaptive':
      return [...(b.default ? [b.default] : []), ...(b.triggers ?? []).map((t) => t.binding)];
    default:
      return [];
  }
}

/** The named behaviour a binding stands for or builds on, if any. */
function refOf(b: Binding): string | undefined {
  if (b.kind === 'ref') return b.ref;
  return 'ref' in b && typeof b.ref === 'string' && b.ref !== '' ? b.ref : undefined;
}

/**
 * The behaviour a binding names, unless it is one of `following`, the ones already being followed
 * on the way to it: a behaviour that names itself is followed once, however many times it does.
 */
function follow(
  layout: Layout,
  ref: string | undefined,
  following: ReadonlySet<string>,
): [Binding, ReadonlySet<string>] | null {
  if (ref === undefined || following.has(ref)) return null;
  const target = layout.behaviors?.[ref];
  return target ? [target, new Set([...following, ref])] : null;
}

/** The letters a binding types by itself, through its choices and the behaviours it names. */
function lettersOf(
  layout: Layout,
  b: Binding,
  out: Set<string>,
  following: ReadonlySet<string> = new Set(),
): Set<string> {
  const letter = letterOf(b);
  if (letter) out.add(letter);
  const named = follow(layout, refOf(b), following);
  if (named && b.kind === 'ref') lettersOf(layout, named[0], out, named[1]);
  else if (named && b.kind !== 'macro')
    for (const c of choices(named[0])) lettersOf(layout, c, out, named[1]);
  for (const c of choices(b)) lettersOf(layout, c, out, following);
  return out;
}

/** The layers that are the layout's own: the default layers never count toward a category. */
function ownLayers(layout: Layout) {
  return layout.layers.filter((l) => !isDefaultLayer(l.id));
}

/** The layers where at least one key types a letter a–z by itself, by id, in the layout's order. */
export function alphaLayers(layout: Layout): string[] {
  return ownLayers(layout)
    .filter((l) => Object.values(l.bindings).some((b) => lettersOf(layout, b, new Set()).size > 0))
    .map((l) => l.id);
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
      const b = layer.bindings[key];
      if (!b) continue;
      for (const letter of lettersOf(layout, b, new Set()))
        out.push({ layer: layer.id, key, letter });
    }
  }
  return out;
}

/**
 * The board's physical keys, thumbs included. A row-stagger board's space bar is one key that
 * either thumb presses, drawn as two at one spot: it counts once.
 */
export function physicalKeyCount(layout: Layout): number {
  const g = buildGeometry(layout);
  const ids = new Set(g.keys.map((k) => k.id));
  return g.keys.length - (g.family === 'rowstagger' && ids.has('L0') && ids.has('R0') ? 1 : 0);
}

const FEATURE_LABELS: Record<Exclude<SpecialFeatureKind, 'custom_behaviour' | 'macro'>, string> = {
  adaptive: 'Adaptive key',
  alt_repeat: 'Alt repeat',
  mod_morph: 'Mod morph',
};

interface Place {
  layer?: string;
  key?: string;
  combo?: string;
}

/** The special features a binding is or holds, at the place it is bound. */
function featuresOf(
  layout: Layout,
  b: Binding,
  at: Place,
  out: SpecialFeature[],
  following: ReadonlySet<string> = new Set(),
): void {
  const emit = (feature: SpecialFeatureKind, label: string) => out.push({ feature, ...at, label });
  const ref = refOf(b);
  if (ref !== undefined) {
    emit('custom_behaviour', `Behaviour ${ref}`);
    const named = follow(layout, ref, following);
    // A binding that builds on a behaviour is the behaviour with its own fields over it: the
    // feature it is, it is once.
    if (named && b.kind === 'ref') featuresOf(layout, named[0], at, out, named[1]);
    else if (named) for (const c of choices(named[0])) featuresOf(layout, c, at, out, named[1]);
  }
  switch (b.kind) {
    case 'adaptive':
      if (b.default?.kind === 'key_repeat') emit('alt_repeat', FEATURE_LABELS.alt_repeat);
      else emit('adaptive', FEATURE_LABELS.adaptive);
      break;
    case 'mod_morph':
      emit('mod_morph', FEATURE_LABELS.mod_morph);
      break;
    case 'macro':
      emit('macro', b.symbols ? `Macro “${b.symbols}”` : 'Macro');
      return;
    default:
      break;
  }
  for (const c of choices(b)) featuresOf(layout, c, at, out, following);
}

/** The behaviours a binding names, through its choices and the behaviours those name. */
function namedIn(layout: Layout, b: Binding, out: Set<string>): Set<string> {
  const ref = refOf(b);
  if (ref !== undefined && !out.has(ref)) {
    out.add(ref);
    const target = layout.behaviors?.[ref];
    if (target) namedIn(layout, target, out);
  }
  for (const c of choices(b)) namedIn(layout, c, out);
  return out;
}

/**
 * What a declared feature makes of the key it wraps: caps word turns the shift key into a mod morph,
 * sentence case the space key into an adaptive key. Each is one feature, named as itself.
 */
const DECLARED: Record<WrappingFeature, { feature: SpecialFeatureKind; label: string }> = {
  capsWord: { feature: 'mod_morph', label: 'Caps word' },
  sentenceCase: { feature: 'adaptive', label: 'Sentence case' },
};

/** Whether a combo fires only on the default layers. */
const onDefaultLayersOnly = (layers: string[] | undefined) =>
  layers !== undefined && layers.length > 0 && layers.every(isDefaultLayer);

/**
 * Each use of a special feature: on the keys of the layout's own layers, on its combos, and among
 * its behaviours, and the keys its declared features wrap. A named behaviour of its own is one
 * wherever it is used; one that nothing uses
 * still counts, once, with no place. Nothing on the default layers counts, and a behaviour only they
 * use is theirs.
 */
export function specialFeatures(layout: Layout): SpecialFeature[] {
  const out: SpecialFeature[] = [];
  const used = new Set<string>();
  const { owned } = expandFeatures(layout);
  for (const layer of layout.layers) {
    const own = !isDefaultLayer(layer.id);
    for (const [key, b] of Object.entries(layer.bindings)) {
      if (own) featuresOf(layout, b, { layer: layer.id, key }, out);
      namedIn(layout, b, used);
    }
    if (!own) continue;
    for (const [key, f] of owned.get(layer.id) ?? [])
      out.push({ ...DECLARED[f], layer: layer.id, key });
  }
  (layout.combos ?? []).forEach((c, i) => {
    if (!onDefaultLayersOnly(c.layers))
      featuresOf(layout, c.binding, { combo: c.id ?? `#${i + 1}` }, out);
    namedIn(layout, c.binding, used);
  });
  for (const name of Object.keys(layout.behaviors ?? {})) {
    if (!used.has(name)) featuresOf(layout, { kind: 'ref', ref: name }, {}, out);
  }
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
