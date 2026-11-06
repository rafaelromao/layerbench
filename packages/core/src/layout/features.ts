import type { Binding, LayerDef, Layout, LayoutFeatures, Mod } from './types.js';

/** The modifiers that make a key morph into caps word when it is shift: either shift. */
const DEFAULT_TRIGGER_MODS: Mod[] = ['LSHIFT', 'RSHIFT'];

/** A feature that wraps the tap of the key it belongs to. */
export type WrappingFeature = keyof LayoutFeatures;

export interface ExpandedLayout {
  /** The document the layers and combos were compiled from. */
  layout: Layout;
  /**
   * `layerId` → `keyId` → the feature that wraps the key's tap. The editor edits such a key as
   * that feature, since the next compile would wrap anything written on the key again.
   */
  owned: Map<string, Map<string, WrappingFeature>>;
  errors: string[];
}

/**
 * Rewrite the part a tap would reach, leaving holds and morph structure alone.
 *
 * A feature has to compose with whatever is already on the key: the space key may be a `hold_tap`
 * that reaches a numbers layer on hold, and sentence case belongs on its tap only.
 */
export function mapTapPart(
  b: Binding | undefined,
  f: (tap: Binding | undefined) => Binding,
): Binding {
  if (b === undefined) return f(undefined);
  switch (b.kind) {
    case 'hold_tap':
      return { ...b, tap: mapTapPart(b.tap, f) };
    case 'lt':
      return { ...b, tap: mapTapPart(b.tap, f) };
    case 'mod_morph':
      return { ...b, default: mapTapPart(b.default, f) };
    default:
      return f(b);
  }
}

interface Writer {
  layers: LayerDef[];
  owned: Map<string, Map<string, WrappingFeature>>;
  errors: string[];
}

function place(
  w: Writer,
  layerId: string,
  key: string,
  feature: WrappingFeature,
  wrap: (tap?: Binding) => Binding,
) {
  const layer = w.layers.find((l) => l.id === layerId);
  if (!layer) {
    w.errors.push(`Feature ${feature}: unknown layer ${layerId}`);
    return;
  }
  layer.bindings = { ...layer.bindings, [key]: mapTapPart(layer.bindings[key], wrap) };
  const byKey = w.owned.get(layerId) ?? new Map<string, WrappingFeature>();
  byKey.set(key, feature);
  w.owned.set(layerId, byKey);
}

/**
 * The space key's tap is `&sentence_space`, as zmk-sentence-case has a keymap bind it in place of
 * `&kp SPACE`: it types the space the key typed, and a capital follows a sentence's end.
 */
function expandSentenceCase(w: Writer, features: LayoutFeatures, layout: Layout): void {
  const f = features.sentenceCase;
  if (!f || f.enabled === false) return;
  const key = f.key ?? layout.keys.space;
  const layers = f.on ?? [w.layers[0]?.id].filter((x): x is string => x !== undefined);
  for (const layerId of layers) {
    place(w, layerId, key, 'sentenceCase', () => ({ kind: 'sentence_space' }));
  }
}

/**
 * Wrap the keys `features` belong to in ordinary bindings. The identity when `features` is absent,
 * so a document that spells the same behaviours out by hand keeps compiling unchanged.
 */
export function expandFeatures(layout: Layout): ExpandedLayout {
  const features = layout.features;
  if (!features) return { layout, owned: new Map(), errors: [] };

  const w: Writer = {
    layers: layout.layers.map((l) => ({ ...l, bindings: { ...l.bindings } })),
    owned: new Map(),
    errors: [],
  };

  expandSentenceCase(w, features, layout);

  return {
    layout: { ...layout, layers: w.layers },
    owned: w.owned,
    errors: w.errors,
  };
}

/**
 * The same keymap with its features written out as the bindings they wrap, and none left declared,
 * so a change to its bindings sees each key as it types.
 */
export function inlineFeatures(authored: Layout): Layout {
  return { ...expandFeatures(authored).layout, features: undefined };
}

/**
 * `features.capsWord` as a document saved before caps word was only a behaviour declares it: the
 * shift key (or `key`), on the layers `on`, made a mod morph that turns into `caps_word`.
 */
export interface LegacyCapsWord {
  enabled?: boolean;
  key?: string;
  on?: string[];
  triggerMods?: Mod[];
  mods?: Mod[];
  continueList?: string[];
}

/** A layout as the schema reads it: a document from before may still declare caps word. */
export type ReadLayout = Omit<Layout, 'features'> & {
  features?: LayoutFeatures & { capsWord?: LegacyCapsWord };
};

/**
 * The layout with `features.capsWord` written out as the mod morph it made, and not declared: the
 * key's tap is the morph's default, and shift pressed while shift is on starts caps word. What the
 * declaration could not place goes, so the document opens: a feature that was off, one with no `key`
 * and no shift key to go on, a layer in `on` the layout lacks (those two made the layout fail to
 * compile). The layout itself when it declares no caps word.
 */
export function withCapsWordAsMorph(layout: ReadLayout): Layout {
  const { capsWord: f, ...features } = layout.features ?? {};
  if (f === undefined) return layout as Layout;
  const { features: _declared, ...rest } = layout;
  const kept = Object.keys(features).length > 0 ? { features } : {};
  const key = f.key ?? layout.keys.shift?.key;
  if (f.enabled === false || key === undefined) return { ...rest, ...kept } as Layout;

  const on = f.on ?? [layout.layers[0]?.id];
  const mods = f.mods ?? ['LSHIFT'];
  const morph = (tap?: Binding): Binding => ({
    kind: 'mod_morph',
    mods: f.triggerMods ?? [...DEFAULT_TRIGGER_MODS],
    default: tap ?? { kind: 'sk', mod: mods[0] ?? 'LSHIFT' },
    morphed: {
      kind: 'caps_word',
      mods,
      ...(f.continueList === undefined ? {} : { continueList: f.continueList }),
    },
  });
  const layers = layout.layers.map((l) =>
    on.includes(l.id)
      ? { ...l, bindings: { ...l.bindings, [key]: mapTapPart(l.bindings[key], morph) } }
      : l,
  );
  return { ...rest, layers, ...kept } as Layout;
}
