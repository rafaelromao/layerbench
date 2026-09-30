import { applyFingering, getGeometryPreset } from '../geometry/presets.js';
import type { Finger, Geometry, GeometryKey, Hand } from '../geometry/types.js';
import { expandFeatures } from './features.js';
import type { BehaviorDefaults, Binding, HostLocale, Layout, Mod } from './types.js';

export interface CompiledLayer {
  idx: number;
  id: string;
  name: string;
  /** Binding per position index (physical keys only). Refs resolved, `*` default applied. */
  bindings: Binding[];
  explicit: boolean[];
}

export interface CompiledCombo {
  idx: number;
  id: string;
  keys: number[];
  binding: Binding;
  /** Bitmask of layers where the combo fires, or null for all layers. */
  layerMask: number | null;
  role: 'typing' | 'command';
  /** Virtual position index used in the key stream for this chord. */
  pos: number;
}

/** Physical key or chord virtual position. */
export interface PositionInfo {
  idx: number;
  id: string;
  key: GeometryKey | null;
  /** Member key indices (single element for physical keys). */
  members: number[];
  hand: Hand | 'both';
  fingers: Finger[];
  x: number;
  y: number;
  row: number;
  col: number;
  thumb: boolean;
  home: boolean;
  inner: boolean;
}

export interface ResolvedBehaviorDefaults {
  sl: { quickRelease: boolean; ignoreModifiers: boolean; releaseAfterMs: number };
  sk: { quickRelease: boolean; ignoreModifiers: boolean; releaseAfterMs: number };
}

export interface CompiledLayout {
  /** The authored document. Hashing, storage and share links use this. */
  layout: Layout;
  /** The document after feature expansion: what the layers and combos were compiled from. */
  expanded: Layout;
  /** `layerId` → `keyId` → the feature that generated the binding, for the editor. */
  featureOwned: Map<string, Map<string, string>>;
  geometry: Geometry;
  keys: GeometryKey[];
  positions: PositionInfo[];
  keyIndex: Map<string, number>;
  layers: CompiledLayer[];
  layerIndex: Map<string, number>;
  combos: CompiledCombo[];
  conditionalLayers: { ifMask: number; then: number }[];
  spaceKey: number;
  shiftKey: { key: number; kind: 'sk' | 'hold' } | null;
  hostLocale: HostLocale;
  behaviorDefaults: ResolvedBehaviorDefaults;
  /** Bitmask of layers that are `then` layers of conditional layers. */
  conditionalThenMask: number;
  errors: string[];
  warnings: string[];
}

export class LayoutCompileError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join('\n'));
  }
}

const CHILD_KEYS = ['tap', 'hold', 'default', 'morphed', 'active', 'inactive'] as const;

function resolveRefs(
  b: Binding,
  behaviors: Record<string, Binding>,
  depth: number,
  errors: string[],
): Binding {
  if (depth > 16) {
    errors.push('Behavior reference chain too deep (cycle?)');
    return { kind: 'none' };
  }
  let cur: Binding = b;
  if (cur.kind === 'ref') {
    const target = behaviors[cur.ref];
    if (!target) {
      errors.push(`Unknown behavior reference: ${cur.ref}`);
      return { kind: 'none' };
    }
    return resolveRefs(target, behaviors, depth + 1, errors);
  }
  if ('ref' in cur && cur.ref) {
    const target = behaviors[cur.ref];
    if (!target) {
      errors.push(`Unknown behavior reference: ${cur.ref}`);
      return { kind: 'none' };
    }
    if (target.kind !== cur.kind) {
      errors.push(`Behavior ${cur.ref} is ${target.kind} but referenced as ${cur.kind}`);
      return { kind: 'none' };
    }
    const { ref: _ref, ...rest } = cur as Binding & { ref?: string };
    const merged = { ...(target as object), ...(rest as object) } as Binding;
    cur = merged;
  }
  const out: Record<string, unknown> = { ...(cur as object) };
  for (const k of CHILD_KEYS) {
    const child = (cur as Record<string, unknown>)[k];
    if (child && typeof child === 'object')
      out[k] = resolveRefs(child as Binding, behaviors, depth + 1, errors);
  }
  if (cur.kind === 'tap_dance')
    out.bindings = cur.bindings.map((x) => resolveRefs(x, behaviors, depth + 1, errors));
  if (cur.kind === 'macro') {
    if (cur.steps) out.steps = cur.steps.map((x) => resolveRefs(x, behaviors, depth + 1, errors));
    if (cur.then) out.then = cur.then.map((x) => resolveRefs(x, behaviors, depth + 1, errors));
  }
  if (cur.kind === 'adaptive' && cur.triggers) {
    out.triggers = cur.triggers.map((t) => ({
      afterAny: t.afterAny,
      afterTags: t.afterTags,
      binding: resolveRefs(t.binding, behaviors, depth + 1, errors),
    }));
  }
  return out as Binding;
}

/**
 * The same keymap with its features desugared and every behaviour reference replaced by what it
 * names, so nothing is left to look up. A change to the bindings needs this first: a named behaviour
 * changed in place would no longer be the kind that refers to it.
 */
export function inlineBehaviors(authored: Layout): Layout {
  const { layout } = expandFeatures(authored);
  const behaviors = layout.behaviors ?? {};
  const errors: string[] = [];
  const inline = (b: Binding) => resolveRefs(b, behaviors, 0, errors);
  return {
    ...layout,
    features: undefined,
    behaviors: {},
    layers: layout.layers.map((l) => ({
      ...l,
      bindings: Object.fromEntries(Object.entries(l.bindings).map(([k, b]) => [k, inline(b)])),
    })),
    combos: layout.combos?.map((c) => ({ ...c, binding: inline(c.binding) })),
  };
}

function applyDefaults(b: Binding, defaults: ResolvedBehaviorDefaults): Binding {
  const walk = (x: Binding): Binding => {
    switch (x.kind) {
      case 'sl':
        return {
          ...x,
          quickRelease: x.quickRelease ?? defaults.sl.quickRelease,
          ignoreModifiers: x.ignoreModifiers ?? defaults.sl.ignoreModifiers,
          releaseAfterMs: x.releaseAfterMs ?? defaults.sl.releaseAfterMs,
        };
      case 'sk':
        return {
          ...x,
          quickRelease: x.quickRelease ?? defaults.sk.quickRelease,
          ignoreModifiers: x.ignoreModifiers ?? defaults.sk.ignoreModifiers,
          releaseAfterMs: x.releaseAfterMs ?? defaults.sk.releaseAfterMs,
        };
      case 'lt':
        return { ...x, tap: walk(x.tap) };
      case 'hold_tap':
        return { ...x, tap: walk(x.tap), hold: walk(x.hold) };
      case 'mod_morph':
        return { ...x, default: walk(x.default), morphed: walk(x.morphed) };
      case 'layer_morph':
        return { ...x, active: walk(x.active), inactive: walk(x.inactive) };
      case 'tap_dance':
        return { ...x, bindings: x.bindings.map(walk) };
      case 'macro':
        return { ...x, steps: x.steps?.map(walk), then: x.then?.map(walk) };
      case 'adaptive':
        return {
          ...x,
          default: x.default ? walk(x.default) : undefined,
          triggers: x.triggers?.map((t) => ({
            afterAny: t.afterAny,
            afterTags: t.afterTags,
            binding: walk(t.binding),
          })),
        };
      default:
        return x;
    }
  };
  return walk(b);
}

/** Collect every layer id referenced by a binding (for validation). */
export function referencedLayers(b: Binding, out: Set<string> = new Set()): Set<string> {
  switch (b.kind) {
    case 'mo':
    case 'sl':
    case 'tog':
    case 'to':
    case 'auto_layer':
      out.add(b.layer);
      break;
    case 'lt':
      out.add(b.layer);
      referencedLayers(b.tap, out);
      break;
    case 'hold_tap':
      referencedLayers(b.tap, out);
      referencedLayers(b.hold, out);
      break;
    case 'mod_morph':
      referencedLayers(b.default, out);
      referencedLayers(b.morphed, out);
      break;
    case 'layer_morph':
      for (const l of b.layers) out.add(l);
      referencedLayers(b.active, out);
      referencedLayers(b.inactive, out);
      break;
    case 'tap_dance':
      for (const x of b.bindings) referencedLayers(x, out);
      break;
    case 'macro':
      for (const x of b.steps ?? []) referencedLayers(x, out);
      for (const x of b.then ?? []) referencedLayers(x, out);
      break;
    case 'adaptive':
      if (b.default) referencedLayers(b.default, out);
      for (const t of b.triggers ?? []) referencedLayers(t.binding, out);
      break;
    default:
      break;
  }
  return out;
}

function resolveDefaults(d: BehaviorDefaults | undefined): ResolvedBehaviorDefaults {
  return {
    sl: {
      quickRelease: d?.sl?.quickRelease ?? true,
      ignoreModifiers: d?.sl?.ignoreModifiers ?? false,
      releaseAfterMs: d?.sl?.releaseAfterMs ?? 1000,
    },
    sk: {
      quickRelease: d?.sk?.quickRelease ?? false,
      ignoreModifiers: d?.sk?.ignoreModifiers ?? true,
      releaseAfterMs: d?.sk?.releaseAfterMs ?? 1000,
    },
  };
}

export function buildGeometry(layout: Layout): Geometry {
  let g: Geometry;
  if ('preset' in layout.geometry) {
    const offsets: Record<number, number> = {};
    for (const [k, v] of Object.entries(layout.geometry.columnOffsets ?? {}))
      offsets[Number(k)] = v;
    g = getGeometryPreset(layout.geometry.preset, offsets);
  } else {
    const keys = layout.geometry.custom.map((k) => ({ ...k }));
    const rows: string[][] = [[], [], []];
    const thumbs: string[] = [];
    const sorted = [...keys].sort((a, b) => a.x - b.x);
    for (const k of sorted) {
      if (k.row === 3) thumbs.push(k.id);
      else rows[k.row].push(k.id);
    }
    g = {
      id: 'custom',
      name: layout.geometry.name ?? 'Custom geometry',
      family: layout.geometry.family ?? 'columnar',
      keys,
      supportsAngleMod: layout.geometry.family === 'rowstagger',
      textRows: rows,
      textThumbs: thumbs,
    };
  }
  return applyFingering(g, layout.fingering ?? 'standard');
}

export function compileLayout(authored: Layout): CompiledLayout {
  const errors: string[] = [];
  const warnings: string[] = [];
  // Features desugar into behaviours and layer bindings before anything else looks at the layers,
  // so the rest of the compiler — and the whole simulator — sees only ordinary bindings.
  const expansion = expandFeatures(authored);
  const layout = expansion.layout;
  errors.push(...expansion.errors);
  const geometry = buildGeometry(layout);
  const keys = geometry.keys;
  const keyIndex = new Map<string, number>();
  keys.forEach((k, i) => {
    keyIndex.set(k.id, i);
  });

  const layerIndex = new Map<string, number>();
  layout.layers.forEach((l, i) => {
    if (layerIndex.has(l.id)) errors.push(`Duplicate layer id: ${l.id}`);
    layerIndex.set(l.id, i);
  });
  if (layout.layers.length > 32) errors.push('At most 32 layers are supported');

  const behaviors = layout.behaviors ?? {};
  const defaults = resolveDefaults(layout.behaviorDefaults);
  const prep = (b: Binding): Binding =>
    applyDefaults(resolveRefs(b, behaviors, 0, errors), defaults);

  const layers: CompiledLayer[] = layout.layers.map((l, idx) => {
    const fallback: Binding = l.bindings['*']
      ? prep(l.bindings['*'])
      : idx === 0
        ? { kind: 'none' }
        : { kind: 'trans' };
    const bindings: Binding[] = keys.map(() => fallback);
    const explicit: boolean[] = keys.map(() => false);
    for (const [keyId, b] of Object.entries(l.bindings)) {
      if (keyId === '*') continue;
      const ki = keyIndex.get(keyId);
      if (ki === undefined) {
        errors.push(`Layer ${l.id}: unknown key id ${keyId}`);
        continue;
      }
      bindings[ki] = prep(b);
      explicit[ki] = true;
    }
    for (const b of bindings) {
      for (const ref of referencedLayers(b)) {
        if (!layerIndex.has(ref))
          errors.push(`Layer ${l.id}: binding references unknown layer ${ref}`);
      }
    }
    return { idx, id: l.id, name: l.name ?? l.id, bindings, explicit };
  });

  const positions: PositionInfo[] = keys.map((k, idx) => ({
    idx,
    id: k.id,
    key: k,
    members: [idx],
    hand: k.hand,
    fingers: [k.finger],
    x: k.x,
    y: k.y,
    row: k.row,
    col: k.col,
    thumb: k.thumb,
    home: k.home,
    inner: k.inner,
  }));

  const combos: CompiledCombo[] = (layout.combos ?? []).map((c, idx) => {
    const memberIdx: number[] = [];
    for (const kid of c.keys) {
      const ki = keyIndex.get(kid);
      if (ki === undefined) errors.push(`Combo ${c.id ?? idx}: unknown key id ${kid}`);
      else memberIdx.push(ki);
    }
    let layerMask: number | null = null;
    if (c.layers) {
      layerMask = 0;
      for (const lid of c.layers) {
        const li = layerIndex.get(lid);
        if (li === undefined) errors.push(`Combo ${c.id ?? idx}: unknown layer ${lid}`);
        else layerMask |= 1 << li;
      }
    }
    const binding = prep(c.binding);
    const memberKeys = memberIdx.map((i) => keys[i]);
    const hands = new Set(memberKeys.map((k) => k.hand));
    const pos = positions.length;
    positions.push({
      idx: pos,
      id: `combo:${c.id ?? `combo${idx}`}`,
      key: null,
      members: memberIdx,
      hand: hands.size === 1 ? memberKeys[0].hand : 'both',
      fingers: [...new Set(memberKeys.map((k) => k.finger))],
      x: memberKeys.reduce((s, k) => s + k.x, 0) / Math.max(1, memberKeys.length),
      y: memberKeys.reduce((s, k) => s + k.y, 0) / Math.max(1, memberKeys.length),
      row: memberKeys.length
        ? Math.round(memberKeys.reduce((s, k) => s + k.row, 0) / memberKeys.length)
        : 1,
      col: memberKeys.length
        ? Math.round(memberKeys.reduce((s, k) => s + k.col, 0) / memberKeys.length)
        : 3,
      thumb: memberKeys.every((k) => k.thumb),
      home: memberKeys.every((k) => k.home),
      inner: memberKeys.some((k) => k.inner),
    });
    return {
      idx,
      id: c.id ?? `combo${idx}`,
      keys: memberIdx,
      binding,
      layerMask,
      role: c.role ?? 'command',
      pos,
    };
  });

  const conditionalLayers = (layout.conditionalLayers ?? []).map((c) => {
    let ifMask = 0;
    for (const lid of c.if) {
      const li = layerIndex.get(lid);
      if (li === undefined) errors.push(`Conditional layer: unknown layer ${lid}`);
      else ifMask |= 1 << li;
    }
    const then = layerIndex.get(c.then);
    if (then === undefined) errors.push(`Conditional layer: unknown then-layer ${c.then}`);
    return { ifMask, then: then ?? 0 };
  });
  let conditionalThenMask = 0;
  for (const c of conditionalLayers) conditionalThenMask |= 1 << c.then;

  const spaceKey = keyIndex.get(layout.keys.space);
  if (spaceKey === undefined) errors.push(`Unknown space key: ${layout.keys.space}`);
  let shiftKey: CompiledLayout['shiftKey'] = null;
  if (layout.keys.shift) {
    const si = keyIndex.get(layout.keys.shift.key);
    if (si === undefined) errors.push(`Unknown shift key: ${layout.keys.shift.key}`);
    else shiftKey = { key: si, kind: layout.keys.shift.kind };
  }

  if (errors.length) throw new LayoutCompileError(dedupe(errors));

  return {
    layout: authored,
    expanded: layout,
    featureOwned: expansion.owned,
    geometry,
    keys,
    positions,
    keyIndex,
    layers,
    layerIndex,
    combos,
    conditionalLayers,
    spaceKey: spaceKey ?? 0,
    shiftKey,
    hostLocale: layout.hostLocale ?? 'symbols',
    behaviorDefaults: defaults,
    conditionalThenMask,
    errors,
    warnings,
  };
}

export function modsOf(list: Iterable<Mod>): Set<Mod> {
  return new Set(list);
}

/** Compile without throwing: returns the accumulated errors instead. */
export function safeCompile(
  layout: Layout,
): { ok: true; compiled: CompiledLayout } | { ok: false; errors: string[] } {
  try {
    return { ok: true, compiled: compileLayout(layout) };
  } catch (e) {
    if (e instanceof LayoutCompileError) return { ok: false, errors: e.errors };
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)] };
  }
}

function dedupe(errors: string[]): string[] {
  return [...new Set(errors)];
}
