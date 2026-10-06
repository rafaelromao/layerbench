import type { Binding, LayerDef, Layout, LayoutFeatures, Mod } from './types.js';

const DEFAULT_SENTENCE_END = ['.', '?', '!'];
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
 * Rewrite the arm a tap would reach, leaving hold arms and morph structure alone.
 *
 * A feature has to compose with whatever is already on the key: the space key may be a `hold_tap`
 * that reaches a numbers layer on hold, and sentence case belongs on its tap arm only.
 */
export function mapTapArm(
  b: Binding | undefined,
  f: (tap: Binding | undefined) => Binding,
): Binding {
  if (b === undefined) return f(undefined);
  switch (b.kind) {
    case 'hold_tap':
      return { ...b, tap: mapTapArm(b.tap, f) };
    case 'lt':
      return { ...b, tap: mapTapArm(b.tap, f) };
    case 'mod_morph':
      return { ...b, default: mapTapArm(b.default, f) };
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
  layer.bindings = { ...layer.bindings, [key]: mapTapArm(layer.bindings[key], wrap) };
  const byKey = w.owned.get(layerId) ?? new Map<string, WrappingFeature>();
  byKey.set(key, feature);
  w.owned.set(layerId, byKey);
}

function expandSentenceCase(w: Writer, features: LayoutFeatures, layout: Layout): void {
  const f = features.sentenceCase;
  if (!f || f.enabled === false) return;
  const key = f.key ?? layout.keys.space;
  const layers = f.on ?? [w.layers[0]?.id].filter((x): x is string => x !== undefined);
  const mod = f.mod ?? 'LSHIFT';
  for (const layerId of layers) {
    place(w, layerId, key, 'sentenceCase', (tap) => {
      const space: Binding = tap ?? { kind: 'kp', symbol: ' ' };
      return {
        kind: 'adaptive',
        default: space,
        triggers: [
          {
            afterAny: f.after ?? DEFAULT_SENTENCE_END,
            binding: { kind: 'macro', steps: [space, { kind: 'sk', mod }] },
          },
        ],
      };
    });
  }
}

function expandCapsWord(w: Writer, features: LayoutFeatures, layout: Layout): void {
  const f = features.capsWord;
  if (!f || f.enabled === false) return;
  const key = f.key ?? layout.keys.shift?.key;
  if (key === undefined) {
    w.errors.push('Feature capsWord: no key given and the layout declares no shift key');
    return;
  }
  const layers = f.on ?? [w.layers[0]?.id].filter((x): x is string => x !== undefined);
  const mods: Mod[] = f.mods ?? ['LSHIFT'];
  for (const layerId of layers) {
    place(w, layerId, key, 'capsWord', (tap) => ({
      kind: 'mod_morph',
      mods: f.triggerMods ?? DEFAULT_TRIGGER_MODS,
      default: tap ?? { kind: 'sk', mod: mods[0] ?? 'LSHIFT' },
      morphed: {
        kind: 'caps_word',
        mods,
        ...(f.continueList === undefined ? {} : { continueList: f.continueList }),
      },
    }));
  }
}

/**
 * Wrap the keys `features` belong to in ordinary bindings. The identity when `features` is absent,
 * so a document that spells the same behaviours out by hand keeps compiling unchanged.
 *
 * Order is fixed — sentence case, then caps word — so a document that puts both on one key gets a
 * predictable result.
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
  expandCapsWord(w, features, layout);

  return {
    layout: { ...layout, layers: w.layers },
    owned: w.owned,
    errors: w.errors,
  };
}
