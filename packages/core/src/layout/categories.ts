import { DEFAULT_LAYER_ID_LIST } from '../layouts/templates.js';
import { buildGeometry } from './compile.js';
import { expandFeatures, type WrappingFeature } from './features.js';
import type { Binding, LayerDef, Layout } from './types.js';

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
 * A binding as the compiler reads it: a reference is the behaviour it names, and a binding that
 * builds on one is that behaviour with the binding's own fields over it. `following` holds the
 * behaviours already being followed on the way to it, so one that names itself is followed once,
 * however many times it does; a reference it cannot follow is null. With what to follow next.
 */
function expand(
  layout: Layout,
  b: Binding,
  following: ReadonlySet<string>,
): [Binding, ReadonlySet<string>] | null {
  const ref = refOf(b);
  const target = ref === undefined || following.has(ref) ? undefined : layout.behaviors?.[ref];
  if (b.kind === 'ref') return target && ref ? [target, new Set([...following, ref])] : null;
  if (!target || !ref || target.kind !== b.kind) return [b, following];
  const { ref: _ref, ...own } = b as Binding & { ref?: string };
  return [{ ...target, ...own } as Binding, new Set([...following, ref])];
}

/** Whether a binding is the repeat key, itself or through the behaviours it names. */
function repeats(layout: Layout, b: Binding, following: ReadonlySet<string>): boolean {
  if (b.kind !== 'ref') return b.kind === 'key_repeat';
  const read = expand(layout, b, following);
  return read !== null && repeats(layout, read[0], read[1]);
}

/** The letters a binding types by itself, through its choices and the behaviours it names. */
function lettersOf(
  layout: Layout,
  b: Binding,
  out: Set<string>,
  following: ReadonlySet<string> = new Set(),
): Set<string> {
  const read = expand(layout, b, following);
  if (!read) return out;
  const [m, next] = read;
  if (b.kind === 'ref') return lettersOf(layout, m, out, next);
  const letter = letterOf(m);
  if (letter) out.add(letter);
  for (const c of choices(m)) lettersOf(layout, c, out, next);
  return out;
}

/** The layers that are the layout's own: the default layers never count toward a category. */
function ownLayers(layout: Layout) {
  return layout.layers.filter((l) => !isDefaultLayer(l.id));
}

/** The layers where at least one key types a letter a–z by itself, by id, in the layout's order. */
export function alphaLayers(layout: Layout): string[] {
  const keys = buildGeometry(layout).keys.map((k) => k.id);
  return ownLayers(layout)
    .filter((l) =>
      keys.some((key) => {
        const b = bindingAt(l, key);
        return b !== undefined && lettersOf(layout, b, new Set()).size > 0;
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
      for (const letter of lettersOf(layout, b, new Set()))
        out.push({ layer: layer.id, key, letter });
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
  if (ref !== undefined) emit('custom_behaviour', `Behaviour ${ref}`);
  const read = expand(layout, b, following);
  if (!read) return;
  // A binding that builds on a behaviour is the behaviour with its own fields over it: the feature
  // it is, it is once.
  const [m, next] = read;
  if (b.kind === 'ref') {
    featuresOf(layout, m, at, out, next);
    return;
  }
  switch (m.kind) {
    case 'adaptive':
      if (m.default && repeats(layout, m.default, next))
        emit('alt_repeat', FEATURE_LABELS.alt_repeat);
      else emit('adaptive', FEATURE_LABELS.adaptive);
      break;
    case 'mod_morph':
      emit('mod_morph', FEATURE_LABELS.mod_morph);
      break;
    case 'macro':
      emit('macro', m.symbols ? `Macro “${m.symbols}”` : 'Macro');
      // What it types is not a letter of the layer's, but what its steps use is used.
      for (const c of [...(m.steps ?? []), ...(m.then ?? [])]) featuresOf(layout, c, at, out, next);
      return;
    default:
      break;
  }
  for (const c of choices(m)) featuresOf(layout, c, at, out, next);
}

/**
 * The behaviours a binding names, through its choices, a macro's steps and the behaviours those
 * name: what it types does not count, but a behaviour a macro uses is used.
 */
function namedIn(
  layout: Layout,
  b: Binding,
  out: Set<string>,
  following: ReadonlySet<string> = new Set(),
): Set<string> {
  const ref = refOf(b);
  if (ref !== undefined) out.add(ref);
  const read = expand(layout, b, following);
  if (!read) return out;
  const [m, next] = read;
  if (b.kind === 'ref') return namedIn(layout, m, out, next);
  const steps = m.kind === 'macro' ? [...(m.steps ?? []), ...(m.then ?? [])] : [];
  for (const c of [...choices(m), ...steps]) namedIn(layout, c, out, next);
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
  // One feature at a time: two on one key wrap it twice, and each is a use of its own.
  const owned = (Object.keys(DECLARED) as WrappingFeature[]).map(
    (f) => expandFeatures({ ...layout, features: { [f]: layout.features?.[f] } }).owned,
  );
  const keys = buildGeometry(layout).keys.map((k) => k.id);
  for (const layer of layout.layers) {
    const own = !isDefaultLayer(layer.id);
    // Each key of the board as it is compiled: a layer default no key is left to is not a use.
    for (const key of keys) {
      const b = bindingAt(layer, key);
      if (!b) continue;
      if (own) featuresOf(layout, b, { layer: layer.id, key }, out);
      namedIn(layout, b, used);
    }
    if (!own) continue;
    for (const byLayer of owned)
      for (const [key, f] of byLayer.get(layer.id) ?? [])
        out.push({ ...DECLARED[f], layer: layer.id, key });
  }
  (layout.combos ?? []).forEach((c, i) => {
    if (!onDefaultLayersOnly(c.layers))
      featuresOf(layout, c.binding, { combo: c.id ?? `#${i + 1}` }, out);
    namedIn(layout, c.binding, used);
  });
  // An unused behaviour that another unused one names is reported through it, not again on its own:
  // the ones nothing names go first, then any left in a loop of their own.
  const behaviors = layout.behaviors ?? {};
  const unused = Object.keys(behaviors).filter((name) => !used.has(name));
  const named = new Set<string>();
  for (const name of unused) namedIn(layout, behaviors[name], named);
  const roots = unused.filter((name) => !named.has(name));
  for (const name of [...roots, ...unused.filter((name) => named.has(name))]) {
    if (used.has(name)) continue;
    const root: Binding = { kind: 'ref', ref: name };
    featuresOf(layout, root, {}, out);
    namedIn(layout, root, used);
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
