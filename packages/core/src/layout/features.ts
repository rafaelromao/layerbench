import type {
  AdaptiveTrigger,
  Binding,
  FeaturePlacement,
  LayerDef,
  Layout,
  LayoutFeatures,
  Mod,
} from './types.js';

/** Suffix for the behaviour that carries a feature's tag-matched second stage. */
export const SECOND_STAGE_SUFFIX = '@2';

const DEFAULT_SENTENCE_END = ['.', '?', '!'];
const DEFAULT_TRIGGER_MODS: Mod[] = ['LSHIFT', 'RSHIFT'];

export interface ExpandedLayout {
  /** The document the layers and combos were compiled from. */
  layout: Layout;
  /** `layerId` → `keyId` → the feature that owns the binding. The editor shows these read-only. */
  owned: Map<string, Map<string, string>>;
  errors: string[];
}

/**
 * Rewrite the arm a tap would reach, leaving hold arms and morph structure alone.
 *
 * A feature has to compose with whatever is already on the key: the space key may be a `hold_tap`
 * that reaches a numbers layer on hold, and sentence case belongs on its tap arm only.
 */
function mapTapArm(b: Binding | undefined, f: (tap: Binding | undefined) => Binding): Binding {
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
  behaviors: Record<string, Binding>;
  owned: Map<string, Map<string, string>>;
  errors: string[];
}

function place(w: Writer, at: FeaturePlacement, feature: string, wrap: (tap?: Binding) => Binding) {
  const layer = w.layers.find((l) => l.id === at.layer);
  if (!layer) {
    w.errors.push(`Feature ${feature}: unknown layer ${at.layer}`);
    return;
  }
  layer.bindings = { ...layer.bindings, [at.key]: mapTapArm(layer.bindings[at.key], wrap) };
  const byKey = w.owned.get(at.layer) ?? new Map<string, string>();
  byKey.set(at.key, feature);
  w.owned.set(at.layer, byKey);
}

function defineBehavior(w: Writer, name: string, binding: Binding, feature: string): void {
  if (Object.hasOwn(w.behaviors, name)) {
    w.errors.push(`Feature ${feature}: behaviour ${name} is already defined by the document`);
    return;
  }
  w.behaviors[name] = binding;
}

function expandAdaptiveKeys(w: Writer, features: LayoutFeatures): void {
  for (const a of features.adaptiveKeys ?? []) {
    // The behaviour is written even when disabled, so the editor keeps the definition to re-enable.
    defineBehavior(
      w,
      a.id,
      {
        kind: 'adaptive',
        default: a.default,
        triggers: a.triggers,
        ...(a.strictModifiers === undefined ? {} : { strictModifiers: a.strictModifiers }),
        ...(a.deadKeys === undefined ? {} : { deadKeys: a.deadKeys }),
      },
      a.id,
    );
    if (a.enabled === false) continue;
    for (const at of a.at ?? []) place(w, at, a.id, () => ({ kind: 'ref', ref: a.id }));
  }
}

function expandAltRepeat(w: Writer, features: LayoutFeatures): void {
  const f = features.altRepeat;
  if (!f) return;
  const id = f.id ?? 'altRepeat';
  defineBehavior(
    w,
    id,
    { kind: 'adaptive', default: { kind: 'key_repeat' }, triggers: f.triggers },
    id,
  );
  let ref = id;
  if (f.secondStage) {
    const staged = `${id}${SECOND_STAGE_SUFFIX}`;
    const triggers: AdaptiveTrigger[] = f.secondStage.triggers.map((t) => ({
      ...t,
      afterTags: f.secondStage?.afterTags,
    }));
    // Falls through to the first stage, so the two read as one key with two states.
    defineBehavior(
      w,
      staged,
      { kind: 'adaptive', default: { kind: 'ref', ref: id }, triggers },
      id,
    );
    ref = staged;
  }
  if (f.enabled === false) return;
  for (const at of f.at ?? []) place(w, at, id, () => ({ kind: 'ref', ref }));
}

function expandSentenceCase(w: Writer, features: LayoutFeatures, layout: Layout): void {
  const f = features.sentenceCase;
  if (!f || f.enabled === false) return;
  const key = f.key ?? layout.keys.space;
  const layers = f.on ?? [w.layers[0]?.id].filter((x): x is string => x !== undefined);
  const mod = f.mod ?? 'LSHIFT';
  for (const layerId of layers) {
    place(w, { layer: layerId, key }, 'sentenceCase', (tap) => {
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
    place(w, { layer: layerId, key }, 'capsWord', (tap) => ({
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
 * Desugar `features` into named behaviours and layer bindings. The identity when `features` is
 * absent, so a document that spells the same behaviours out by hand keeps compiling unchanged.
 *
 * Order is fixed: adaptive keys, alt repeat, sentence case, caps word — so a document that places
 * two features on one key gets a predictable result.
 */
export function expandFeatures(layout: Layout): ExpandedLayout {
  const features = layout.features;
  if (!features) return { layout, owned: new Map(), errors: [] };

  const w: Writer = {
    layers: layout.layers.map((l) => ({ ...l, bindings: { ...l.bindings } })),
    behaviors: { ...(layout.behaviors ?? {}) },
    owned: new Map(),
    errors: [],
  };

  expandAdaptiveKeys(w, features);
  expandAltRepeat(w, features);
  expandSentenceCase(w, features, layout);
  expandCapsWord(w, features, layout);

  return {
    layout: { ...layout, layers: w.layers, behaviors: w.behaviors },
    owned: w.owned,
    errors: w.errors,
  };
}
