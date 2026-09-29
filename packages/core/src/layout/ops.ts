import { referencedLayers } from './compile.js';
import type { Binding, FeaturePlacement, Layout } from './types.js';

type Remap = (p: FeaturePlacement) => FeaturePlacement[];

function remapAt(at: FeaturePlacement[] | undefined, f: Remap): FeaturePlacement[] | undefined {
  if (!at) return at;
  const next = at.flatMap(f);
  return next.length === at.length && next.every((p, i) => p === at[i]) ? at : next;
}

/**
 * Rewrite where the placed features sit — magic keys and the alt-repeat key — leaving the
 * document untouched when none moves. The features that follow a role instead (sentence case on
 * the space key, caps word on the shift key) are not placements, and stay with their role.
 */
function mapPlacements(layout: Layout, f: Remap): Layout {
  const features = layout.features;
  if (!features) return layout;
  const adaptive = features.adaptiveKeys;
  const adaptiveKeys = adaptive?.map((a) => {
    const at = remapAt(a.at, f);
    return at === a.at ? a : { ...a, at };
  });
  const altAt = remapAt(features.altRepeat?.at, f);
  const adaptiveMoved = adaptiveKeys?.some((a, i) => a !== adaptive?.[i]) ?? false;
  const altMoved = features.altRepeat !== undefined && altAt !== features.altRepeat.at;
  if (!adaptiveMoved && !altMoved) return layout;
  return {
    ...layout,
    features: {
      ...features,
      ...(adaptiveMoved ? { adaptiveKeys } : {}),
      ...(altMoved && features.altRepeat
        ? { altRepeat: { ...features.altRepeat, at: altAt } }
        : {}),
    },
  };
}

const isAt = (p: FeaturePlacement, layer: string, key: string) =>
  p.layer === layer && p.key === key;

/**
 * Take the placed features off a key — what clearing a magic key means. Its own binding is a
 * separate matter, left to the caller.
 */
export function removeFeaturesAt(layout: Layout, layerIdx: number, keyId: string): Layout {
  const layer = layout.layers[layerIdx];
  if (!layer) return layout;
  return mapPlacements(layout, (p) => (isAt(p, layer.id, keyId) ? [] : [p]));
}

/**
 * The binding a key carries on one layer *as authored*. A key with no entry of its own returns
 * `undefined` even though the compiled layer shows it as `trans` (or `none` on the base layer):
 * the difference is exactly what these operations have to preserve.
 */
export function keyBinding(layout: Layout, layerIdx: number, keyId: string): Binding | undefined {
  return layout.layers[layerIdx]?.bindings[keyId];
}

/**
 * Put a binding on a key, or take its binding away with `undefined`. Removing the entry rather
 * than writing a `trans` is what keeps an implicit key implicit, so an upper layer goes on falling
 * through to the one below it.
 */
export function setKeyBinding(
  layout: Layout,
  layerIdx: number,
  keyId: string,
  binding: Binding | undefined,
): Layout {
  const layer = layout.layers[layerIdx];
  if (!layer) return layout;
  const bindings: Record<string, Binding> = { ...layer.bindings };
  if (binding === undefined) delete bindings[keyId];
  else bindings[keyId] = binding;
  const layers = layout.layers.map((l, i) => (i === layerIdx ? { ...l, bindings } : l));
  return { ...layout, layers };
}

/**
 * Exchange the bindings of two keys on one layer. A key with no explicit binding stays implicit, so
 * swapping an explicit key with an implicit one moves the binding rather than duplicating it. A
 * magic key placed on either goes with it.
 */
export function swapKeys(layout: Layout, layerIdx: number, from: string, to: string): Layout {
  const layer = layout.layers[layerIdx];
  if (!layer || from === to) return layout;
  const a: Binding | undefined = layer.bindings[from];
  const b: Binding | undefined = layer.bindings[to];
  const bindings: Record<string, Binding> = { ...layer.bindings };
  delete bindings[from];
  delete bindings[to];
  if (b !== undefined) bindings[from] = b;
  if (a !== undefined) bindings[to] = a;
  const layers = layout.layers.map((l, i) => (i === layerIdx ? { ...l, bindings } : l));
  return mapPlacements({ ...layout, layers }, (p) =>
    isAt(p, layer.id, from)
      ? [{ layer: layer.id, key: to }]
      : isAt(p, layer.id, to)
        ? [{ layer: layer.id, key: from }]
        : [p],
  );
}

/**
 * Put what `from` carries onto `to`, leaving `from` as it was. Overwrites whatever `to` held,
 * including a magic key placed there; one placed on `from` is placed on `to` as well.
 */
export function copyKey(layout: Layout, layerIdx: number, from: string, to: string): Layout {
  const layer = layout.layers[layerIdx];
  if (!layer || from === to) return layout;
  const copied = setKeyBinding(layout, layerIdx, to, keyBinding(layout, layerIdx, from));
  return mapPlacements(copied, (p) =>
    isAt(p, layer.id, to) ? [] : isAt(p, layer.id, from) ? [p, { layer: layer.id, key: to }] : [p],
  );
}

/**
 * Send a key's binding to the same position on another layer. Moving clears the source, which is
 * what makes dragging a key onto a layer tab feel like moving it there rather than duplicating it.
 */
export function sendKeyToLayer(
  layout: Layout,
  fromLayerIdx: number,
  toLayerIdx: number,
  keyId: string,
  mode: 'copy' | 'move',
): Layout {
  if (fromLayerIdx === toLayerIdx) return layout;
  const source = layout.layers[fromLayerIdx];
  const target = layout.layers[toLayerIdx];
  if (!source || !target) return layout;
  const binding = keyBinding(layout, fromLayerIdx, keyId);
  const sent = setKeyBinding(layout, toLayerIdx, keyId, binding);
  const moved = mode === 'move' ? setKeyBinding(sent, fromLayerIdx, keyId, undefined) : sent;
  return mapPlacements(moved, (p) => {
    if (isAt(p, target.id, keyId)) return [];
    if (!isAt(p, source.id, keyId)) return [p];
    const there = { layer: target.id, key: keyId };
    return mode === 'move' ? [there] : [p, there];
  });
}

/**
 * Move a layer to another place in the list. Layers are referred to by id everywhere, so nothing
 * else in the document changes — only which layer wins when two are on at once, which is the one
 * further down the list, as in ZMK. The base layer is what every key falls back to and stays first.
 */
export function moveLayer(layout: Layout, from: number, to: number): Layout {
  const n = layout.layers.length;
  if (from === to || from < 1 || to < 1 || from >= n || to >= n) return layout;
  const layers = [...layout.layers];
  const [moved] = layers.splice(from, 1);
  layers.splice(to, 0, moved);
  return { ...layout, layers };
}

/**
 * A copy of a layer, placed right after it under an id and a name of its own. A copy of the base
 * layer becomes an upper layer, where a key with no binding would fall through instead of doing
 * nothing; it is given the base layer's meaning explicitly, so the copy does what the original did.
 */
export function duplicateLayer(
  layout: Layout,
  layerIdx: number,
): { layout: Layout; id: string } | null {
  const layer = layout.layers[layerIdx];
  if (!layer) return null;
  const taken = new Set(layout.layers.map((l) => l.id));
  let id = `${layer.id}-copy`;
  for (let n = 2; taken.has(id); n++) id = `${layer.id}-copy-${n}`;
  const bindings: Record<string, Binding> =
    layerIdx === 0 && layer.bindings['*'] === undefined
      ? { '*': { kind: 'none' }, ...layer.bindings }
      : { ...layer.bindings };
  const copy = { id, name: `${layer.name ?? layer.id} copy`, bindings };
  const layers = [...layout.layers];
  layers.splice(layerIdx + 1, 0, copy);
  return { layout: { ...layout, layers }, id };
}

/**
 * Everything that still takes a typist to a layer: keys, combos, behaviours and feature branches
 * whose binding reaches it. A layer cannot go while any of these would be left pointing at nothing,
 * and which of them should change instead is the author's call, not something to guess.
 */
export function layerReachedFrom(layout: Layout, layerId: string): string[] {
  const reaches = (b: Binding | undefined) => b !== undefined && referencedLayers(b).has(layerId);
  const out: string[] = [];
  for (const l of layout.layers) {
    if (l.id === layerId) continue;
    for (const [keyId, b] of Object.entries(l.bindings)) {
      if (reaches(b)) out.push(`${l.name ?? l.id} ${keyId === '*' ? '(unlisted keys)' : keyId}`);
    }
  }
  for (const c of layout.combos ?? []) {
    if (reaches(c.binding)) out.push(`combo ${c.keys.join('+')}`);
  }
  for (const [name, b] of Object.entries(layout.behaviors ?? {})) {
    if (reaches(b)) out.push(`behaviour ${name}`);
  }
  const f = layout.features;
  for (const a of f?.adaptiveKeys ?? []) {
    if (reaches(a.default) || a.triggers.some((t) => reaches(t.binding))) out.push(a.label ?? a.id);
  }
  const alt = f?.altRepeat;
  if (
    alt &&
    (alt.triggers.some((t) => reaches(t.binding)) ||
      alt.secondStage?.triggers.some((t) => reaches(t.binding)))
  ) {
    out.push('alt repeat');
  }
  return out;
}

/**
 * Take a layer out, with what only makes sense while it exists: combos that fire only there, the
 * features placed on it, the typing paths that name its keys, how it is reached. Anything that
 * still *reaches* it is left to `layerReachedFrom` to report first — this does not rewrite keys.
 */
export function removeLayer(layout: Layout, layerId: string): Layout {
  if (layout.layers[0]?.id === layerId || !layout.layers.some((l) => l.id === layerId)) {
    return layout;
  }
  const next: Layout = { ...layout, layers: layout.layers.filter((l) => l.id !== layerId) };
  if (layout.combos) {
    next.combos = layout.combos.flatMap((c) => {
      if (!c.layers?.includes(layerId)) return [c];
      const layers = c.layers.filter((l) => l !== layerId);
      return layers.length > 0 ? [{ ...c, layers }] : [];
    });
  }
  if (layout.conditionalLayers) {
    next.conditionalLayers = layout.conditionalLayers.filter(
      (c) => c.then !== layerId && !c.if.includes(layerId),
    );
  }
  if (layout.activators) {
    const activators: NonNullable<Layout['activators']> = {};
    for (const [target, list] of Object.entries(layout.activators)) {
      if (target === layerId) continue;
      const kept = list.filter((a) => a.from !== layerId && !a.via.startsWith(`key:${layerId}/`));
      if (kept.length > 0) activators[target] = kept;
    }
    next.activators = activators;
  }
  if (layout.typingPaths) {
    const paths: NonNullable<Layout['typingPaths']> = {};
    for (const [symbol, entries] of Object.entries(layout.typingPaths)) {
      paths[symbol] = entries.filter((e) => !e.producer.includes(`:${layerId}/`));
    }
    next.typingPaths = paths;
  }
  const f = layout.features;
  if (f) {
    const onOther = (on: string[] | undefined) => on?.filter((l) => l !== layerId);
    next.features = {
      ...f,
      ...(f.adaptiveKeys
        ? {
            adaptiveKeys: f.adaptiveKeys.map((a) =>
              a.at ? { ...a, at: a.at.filter((p) => p.layer !== layerId) } : a,
            ),
          }
        : {}),
      ...(f.altRepeat?.at
        ? { altRepeat: { ...f.altRepeat, at: f.altRepeat.at.filter((p) => p.layer !== layerId) } }
        : {}),
      ...(f.sentenceCase?.on
        ? { sentenceCase: { ...f.sentenceCase, on: onOther(f.sentenceCase.on) } }
        : {}),
      ...(f.capsWord?.on ? { capsWord: { ...f.capsWord, on: onOther(f.capsWord.on) } } : {}),
    };
  }
  return next;
}
