import { mapTapArm } from './features.js';
import type {
  AdaptiveTrigger,
  Binding,
  LayerDef,
  Layout,
  LayoutFeatures,
  TypingPathEntry,
} from './types.js';

/** Where a document of the feature era put a magic key: a key on a layer. */
export interface LegacyPlacement {
  layer: string;
  key: string;
}

/** A magic key as documents declared it in `features.adaptiveKeys`, before it was a binding. */
export interface LegacyAdaptiveKey {
  id: string;
  label?: string;
  enabled?: boolean;
  default: Binding;
  triggers: AdaptiveTrigger[];
  strictModifiers?: boolean;
  deadKeys?: string[];
  at?: LegacyPlacement[];
}

/** The alt repeat as documents declared it in `features.altRepeat`. */
export interface LegacyAltRepeat {
  enabled?: boolean;
  id?: string;
  at?: LegacyPlacement[];
  triggers: AdaptiveTrigger[];
  /** Branches tried first, and only after a press tagged with one of `afterTags`. */
  secondStage?: { afterTags: string[]; triggers: AdaptiveTrigger[] };
}

/** A document as it may still be stored: magic keys and the alt repeat declared as features. */
export type LegacyLayout = Omit<Layout, 'features'> & {
  features?: LayoutFeatures & {
    adaptiveKeys?: LegacyAdaptiveKey[];
    altRepeat?: LegacyAltRepeat;
  };
};

/** Every behaviour a binding names, at any depth. */
function namesIn(b: Binding, out: Set<string>): void {
  if ('ref' in b && typeof b.ref === 'string') out.add(b.ref);
  const record = b as Record<string, unknown>;
  for (const k of ['tap', 'hold', 'default', 'morphed', 'active', 'inactive'] as const) {
    const child = record[k];
    if (child && typeof child === 'object') namesIn(child as Binding, out);
  }
  if (b.kind === 'tap_dance') for (const x of b.bindings) namesIn(x, out);
  if (b.kind === 'macro') for (const x of [...(b.steps ?? []), ...(b.then ?? [])]) namesIn(x, out);
  if (b.kind === 'adaptive') for (const t of b.triggers ?? []) namesIn(t.binding, out);
}

/**
 * A typing-path id on a key whose alt repeat had a second stage. The two stages were nested — the
 * second's default was the first — so the first stage's branches were `#default#t<i>` and the
 * repeat `#default#default`; on one list they are `#t<staged + i>` and `#default`.
 */
function flattenedId(id: string, at: LegacyPlacement, staged: number): string {
  const m = /^([a-z]+):([^#]+)(#.*)$/s.exec(id);
  if (!m || m[2] !== `${at.layer}/${at.key}`) return id;
  const rest = m[3];
  const branch = /^#default#t(\d+)(.*)$/s.exec(rest);
  if (branch) return `${m[1]}:${m[2]}#t${staged + Number(branch[1])}${branch[2]}`;
  if (rest.startsWith('#default#default')) return `${m[1]}:${m[2]}${rest.slice('#default'.length)}`;
  return id;
}

/**
 * Magic keys and the alt repeat used to be declared in `features` and placed on keys; they are now
 * `adaptive` bindings on the keys themselves. This turns a document of the earlier shape into the
 * current one, typing exactly as it did:
 *
 * - each magic key and alt repeat that is switched on is written onto the keys it was placed on,
 *   on the arm a tap reaches, as the compiler used to place it;
 * - the alt repeat's two stages become one list, its tagged branches first, which is the order
 *   they were tried in;
 * - a name something still refers to, or one on no key, is kept as a named behaviour, so nothing
 *   the author wrote is lost; the document's own behaviour of that name wins, as it had to;
 * - typing-path ids on a key whose stages were folded together are renamed to match.
 *
 * A document with nothing to convert comes back as the same object.
 */
export function upgradeLegacyFeatures(doc: LegacyLayout): Layout {
  const features = doc.features;
  if (!features || (features.adaptiveKeys === undefined && features.altRepeat === undefined)) {
    return doc as Layout;
  }
  const { adaptiveKeys, altRepeat, ...kept } = features;
  const layers: LayerDef[] = doc.layers.map((l) => ({ ...l, bindings: { ...l.bindings } }));
  /** What each feature-defined name meant, for a reference that still uses it. */
  const meaning: Record<string, Binding> = {};
  /** Names whose definition is on no key: switched off, or never placed. */
  const unplaced: string[] = [];
  const folded: { at: LegacyPlacement; staged: number }[] = [];

  const define = (name: string, b: Binding) => {
    if (!Object.hasOwn(meaning, name)) meaning[name] = b;
  };
  /** Put a binding on the arm of a key a tap reaches. A layer that does not exist never compiled. */
  const put = (at: LegacyPlacement, b: Binding): boolean => {
    const layer = layers.find((l) => l.id === at.layer);
    if (!layer) return false;
    layer.bindings[at.key] = mapTapArm(layer.bindings[at.key], () => b);
    return true;
  };

  for (const a of adaptiveKeys ?? []) {
    const b: Binding = {
      kind: 'adaptive',
      default: a.default,
      triggers: a.triggers,
      ...(a.strictModifiers === undefined ? {} : { strictModifiers: a.strictModifiers }),
      ...(a.deadKeys === undefined ? {} : { deadKeys: a.deadKeys }),
    };
    define(a.id, b);
    const placed = a.enabled === false ? 0 : (a.at ?? []).filter((at) => put(at, b)).length;
    if (placed === 0) unplaced.push(a.id);
  }

  if (altRepeat) {
    const id = altRepeat.id ?? 'altRepeat';
    define(id, { kind: 'adaptive', default: { kind: 'key_repeat' }, triggers: altRepeat.triggers });
    const stage = altRepeat.secondStage;
    const staged: AdaptiveTrigger[] = (stage?.triggers ?? []).map((t) => ({
      ...t,
      afterTags: stage?.afterTags,
    }));
    if (stage) {
      define(`${id}@2`, { kind: 'adaptive', default: { kind: 'ref', ref: id }, triggers: staged });
    }
    const flat: Binding = {
      kind: 'adaptive',
      default: { kind: 'key_repeat' },
      triggers: [...staged, ...altRepeat.triggers],
    };
    let placed = 0;
    for (const at of altRepeat.enabled === false ? [] : (altRepeat.at ?? [])) {
      if (!put(at, flat)) continue;
      placed++;
      if (stage) folded.push({ at, staged: staged.length });
    }
    if (placed === 0) unplaced.push(stage ? `${id}@2` : id);
  }

  // Keep every feature name still in use, and what those names use in turn.
  const behaviors: Record<string, Binding> = { ...(doc.behaviors ?? {}) };
  const wanted = new Set<string>(unplaced);
  for (const l of layers) for (const b of Object.values(l.bindings)) namesIn(b, wanted);
  for (const c of doc.combos ?? []) namesIn(c.binding, wanted);
  for (const b of Object.values(behaviors)) namesIn(b, wanted);
  const queue = [...wanted];
  let added = false;
  while (queue.length > 0) {
    const name = queue.pop() as string;
    if (!Object.hasOwn(meaning, name) || Object.hasOwn(behaviors, name)) continue;
    behaviors[name] = meaning[name];
    added = true;
    const more = new Set<string>();
    namesIn(meaning[name], more);
    queue.push(...more);
  }

  const out: LegacyLayout = { ...doc, layers };
  if (kept.sentenceCase === undefined && kept.capsWord === undefined) delete out.features;
  else out.features = kept;
  if (added) out.behaviors = behaviors;

  if (folded.length > 0 && doc.typingPaths) {
    const rename = (id: string) => folded.reduce((acc, f) => flattenedId(acc, f.at, f.staged), id);
    out.typingPaths = Object.fromEntries(
      Object.entries(doc.typingPaths).map(([symbol, entries]) => [
        symbol,
        entries.map((e): TypingPathEntry => ({ ...e, producer: rename(e.producer) })),
      ]),
    );
  }
  return out as Layout;
}
