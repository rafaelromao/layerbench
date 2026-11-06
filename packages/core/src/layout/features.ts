import type { Binding, Layout, Mod } from './types.js';

/** The modifiers that make a key morph into caps word when it is shift: either shift. */
const DEFAULT_TRIGGER_MODS: Mod[] = ['LSHIFT', 'RSHIFT'];

/**
 * Rewrite the part a tap would reach, leaving holds and morph structure alone.
 *
 * A behaviour has to compose with whatever is already on the key: the space key may be a `hold_tap`
 * that reaches a numbers layer on hold, and a sentence space belongs on its tap only.
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

/**
 * `features.sentenceCase` as a document saved before sentence case was only a behaviour declares
 * it: the space key (or `key`), on the layers `on`, its tap made a `sentence_space`.
 */
export interface LegacySentenceCase {
  enabled?: boolean;
  key?: string;
  on?: string[];
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

/** A layout as the schema reads it: a document from before may still declare features. */
export type ReadLayout = Layout & {
  features?: { sentenceCase?: LegacySentenceCase; capsWord?: LegacyCapsWord };
};

/** `layout` with `bind` applied to `key`'s binding on each of the layers `on` it has. */
function onLayers(
  layout: Layout,
  on: string[],
  key: string,
  bind: (b: Binding | undefined) => Binding,
): Layout {
  const layers = layout.layers.map((l) =>
    on.includes(l.id) ? { ...l, bindings: { ...l.bindings, [key]: bind(l.bindings[key]) } } : l,
  );
  return { ...layout, layers };
}

/**
 * The layout with `f` written out as the sentence space it made: the space key's tap, on the layers
 * `on` (the base layer when omitted). What the declaration could not place goes, so the document
 * opens: a feature that was off, a layer in `on` the layout lacks.
 */
function withSentenceCaseAsSpace(layout: Layout, f: LegacySentenceCase): Layout {
  if (f.enabled === false) return layout;
  const on = f.on ?? [layout.layers[0]?.id];
  return onLayers(layout, on, f.key ?? layout.keys.space, (b) =>
    mapTapPart(b, () => ({ kind: 'sentence_space' })),
  );
}

/**
 * The layout with `f` written out as the mod morph it made: the key's tap is the morph's default,
 * and shift pressed while shift is on starts caps word. What the declaration could not place goes,
 * so the document opens: a feature that was off, one with no `key` and no shift key to go on, a
 * layer in `on` the layout lacks (those two made the layout fail to compile).
 */
function withCapsWordAsMorph(layout: Layout, f: LegacyCapsWord): Layout {
  const key = f.key ?? layout.keys.shift?.key;
  if (f.enabled === false || key === undefined) return layout;
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
  return onLayers(layout, f.on ?? [layout.layers[0]?.id], key, (b) => mapTapPart(b, morph));
}

/**
 * The layout with the features a document from before declared written out as the bindings they
 * made, and none left declared: sentence case is a `sentence_space` on the space key's tap, caps word
 * a mod morph on the shift key. Sentence case and caps word are behaviours of a key, made in the key
 * editor like any other, and a layout has no declared features. The layout itself when it declares
 * none.
 */
export function withLegacyFeatures(layout: ReadLayout): Layout {
  const { features, ...rest } = layout;
  if (features === undefined) return layout;
  let out: Layout = rest;
  if (features.sentenceCase) out = withSentenceCaseAsSpace(out, features.sentenceCase);
  if (features.capsWord) out = withCapsWordAsMorph(out, features.capsWord);
  return out;
}
