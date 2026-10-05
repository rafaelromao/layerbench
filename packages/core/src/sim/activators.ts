import type { CompiledLayout } from '../layout/compile.js';
import { MOD_NAME } from '../layout/labels.js';
import type { ActivatorDef, Binding, Mod } from '../layout/types.js';

/** A key the planner can press to bring a layer on. */
export interface ActivatorCandidate {
  pos: number;
  viaLayer: number;
  mode: 'tap' | 'hold';
  target: number;
  user: boolean;
  order: number;
  /** Modifiers that must be active for this arm of the binding to be selected (mod-morph arms). */
  requiredMods?: Mod[];
  /** Source layer restriction (user-declared activators). */
  from?: number;
}

interface LayerTarget {
  mode: 'tap' | 'hold';
  target: number;
  kind: string;
  requiredMods?: Mod[];
}

function collectLayerTargets(
  compiled: CompiledLayout,
  b: Binding,
  mode: 'tap' | 'hold',
  out: LayerTarget[],
  depth = 0,
  requiredMods?: Mod[],
  /** Inside a tap-hold's hold, where a tap's behaviour runs when the key is held. */
  holdArm = false,
): void {
  if (depth > 8) return;
  const li = (id: string) => compiled.layerIndex.get(id);
  switch (b.kind) {
    case 'sl':
    case 'tog':
    case 'to': {
      // On a tap-hold's hold too: the key is held past its tapping term, and comes up again.
      const t = li(b.layer);
      if (t !== undefined && (mode === 'tap' || holdArm))
        out.push({ mode, target: t, kind: b.kind, requiredMods });
      return;
    }
    case 'mo': {
      const t = li(b.layer);
      if (t !== undefined && mode === 'hold')
        out.push({ mode, target: t, kind: 'mo', requiredMods });
      return;
    }
    case 'lt': {
      const t = li(b.layer);
      if (mode === 'hold') {
        if (t !== undefined) out.push({ mode, target: t, kind: 'lt', requiredMods });
      } else collectLayerTargets(compiled, b.tap, mode, out, depth + 1, requiredMods, holdArm);
      return;
    }
    case 'hold_tap':
      collectLayerTargets(
        compiled,
        mode === 'hold' ? b.hold : b.tap,
        mode,
        out,
        depth + 1,
        requiredMods,
        mode === 'hold',
      );
      return;
    case 'mod_morph':
      collectLayerTargets(compiled, b.default, mode, out, depth + 1, requiredMods, holdArm);
      collectLayerTargets(
        compiled,
        b.morphed,
        mode,
        out,
        depth + 1,
        [...(requiredMods ?? []), b.mods[0]],
        holdArm,
      );
      return;
    case 'layer_morph':
      collectLayerTargets(compiled, b.inactive, mode, out, depth + 1, requiredMods, holdArm);
      collectLayerTargets(compiled, b.active, mode, out, depth + 1, requiredMods, holdArm);
      return;
    case 'tap_dance':
      if (b.bindings[0])
        collectLayerTargets(compiled, b.bindings[0], mode, out, depth + 1, requiredMods, holdArm);
      return;
    case 'adaptive':
      if (b.default)
        collectLayerTargets(compiled, b.default, mode, out, depth + 1, requiredMods, holdArm);
      return;
    default:
      return;
  }
}

const KIND_ORDER: Record<string, number> = { sl: 0, mo: 1, lt: 1, tog: 2, to: 3 };

/**
 * Every key the planner may press to bring each layer on, best first: the ones a layout declares
 * in `activators`, then what its keys do when tapped or held — one-shot, hold, toggle, switch.
 * Keyed by target layer index.
 */
export function discoverActivators(
  c: CompiledLayout,
  user: Record<string, ActivatorDef[]>,
): Map<number, ActivatorCandidate[]> {
  const activators = new Map<number, ActivatorCandidate[]>();
  let order = 0;
  for (const layer of c.layers) {
    for (let pos = 0; pos < c.keys.length; pos++) {
      const b = layer.bindings[pos];
      if (b.kind === 'trans' || b.kind === 'none') continue;
      for (const mode of ['tap', 'hold'] as const) {
        const targets: LayerTarget[] = [];
        collectLayerTargets(c, b, mode, targets);
        for (const t of targets) {
          const list = activators.get(t.target) ?? [];
          list.push({
            pos,
            viaLayer: layer.idx,
            mode,
            target: t.target,
            user: false,
            order: (KIND_ORDER[t.kind] ?? 5) * 1000 + (t.requiredMods?.length ? 500 : 0) + order++,
            requiredMods: t.requiredMods,
          });
          activators.set(t.target, list);
        }
      }
    }
  }
  for (const [targetId, defs] of Object.entries(user)) {
    const target = c.layerIndex.get(targetId);
    if (target === undefined) continue;
    defs.forEach((d, i) => {
      const m = /^key:([^/]+)\/(.+)$/.exec(d.via);
      if (!m) return;
      const viaLayer = c.layerIndex.get(m[1]);
      const pos = c.keyIndex.get(m[2]);
      if (viaLayer === undefined || pos === undefined) return;
      const list = activators.get(target) ?? [];
      const existing = list.find((a) => a.pos === pos && a.viaLayer === viaLayer);
      const mode = existing?.mode ?? 'tap';
      const cand: ActivatorCandidate = {
        pos,
        viaLayer,
        mode,
        target,
        user: true,
        order: -1000 + i,
        requiredMods: d.requires?.mods ?? existing?.requiredMods,
      };
      if (d.from && d.from !== '*') cand.from = c.layerIndex.get(d.from);
      list.unshift(cand);
      activators.set(target, list);
    });
  }
  for (const list of activators.values()) list.sort((a, b) => a.order - b.order);
  return activators;
}

/**
 * The keys that could each make the same tap. For each tap that brings a layer on, the other keys
 * that bring the same layer on from the same layer by a tap, needing no modifier, in the order they
 * are tried after it. A declared way in is among them, so it is not a key no other can stand in
 * for. Whether a key really does stand in is settled when it is pressed: the same kind of tap, and
 * the board left exactly as the first key leaves it.
 */
export function standInPeers(
  activators: Map<number, ActivatorCandidate[]>,
): Map<ActivatorCandidate, ActivatorCandidate[]> {
  const out = new Map<ActivatorCandidate, ActivatorCandidate[]>();
  for (const list of activators.values()) {
    const byLayer = new Map<number, ActivatorCandidate[]>();
    for (const cand of list) {
      if (cand.mode !== 'tap' || cand.requiredMods?.length) continue;
      const group = byLayer.get(cand.viaLayer) ?? [];
      group.push(cand);
      byLayer.set(cand.viaLayer, group);
    }
    for (const group of byLayer.values()) {
      group.forEach((cand, i) => {
        const peers: ActivatorCandidate[] = [];
        for (const other of group.slice(i + 1)) {
          if (other.pos !== cand.pos && !peers.some((p) => p.pos === other.pos)) peers.push(other);
        }
        if (peers.length) out.set(cand, peers);
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- the keys that reach a layer

/** How a press on a key reaches the layer: what kind of thing on the key does it. */
export type ReachOrigin = 'key' | 'activator' | 'macro' | 'adaptive';

/** One way a key brings the layer on. */
export interface ReachRoute {
  mode: 'hold' | 'tap';
  origin: ReachOrigin;
  /** The layer the key is pressed on. */
  via: number;
  /** The layout declares this press as the way in (`activators`). */
  declared?: boolean;
  /** A declared way in that applies only from this layer. */
  from?: number;
  /** Modifiers held for the arm of the key that does it. */
  mods?: Mod[];
  /** A magic key's branch: only after these. */
  after?: { afterAny?: string[]; afterTags?: string[] };
  /** The tap of a tap dance that does it, from the second on. */
  taps?: number;
  /** For a layer that comes on with others: the one this press brings on, and the rest it needs. */
  through?: { layer: number; with: number[] };
}

/** A key held or tapped to bring a layer on, and every way it does. */
export interface ReachKey {
  pos: number;
  how: 'held' | 'tapped' | 'both';
  routes: ReachRoute[];
}

interface Extra {
  /** Inside something the planner does not press to change layers: a macro, a branch, a tap dance. */
  extra: boolean;
  origin: ReachOrigin;
  mods?: Mod[];
  after?: ReachRoute['after'];
  taps?: number;
  /** Inside a tap-hold's hold, where a tap's behaviour runs when the key is held. */
  holdArm?: boolean;
}

/**
 * The routes the machine runs but the planner has no need to press for: a macro that arms the
 * layer, a magic key's branch, a later tap of a tap dance, an auto layer. Only those are emitted,
 * so together with the planner's own activators nothing is counted twice.
 */
function extraRoutes(
  c: CompiledLayout,
  b: Binding,
  mode: 'tap' | 'hold',
  target: number,
  via: number,
  ctx: Extra,
  out: ReachRoute[],
  depth = 0,
): void {
  if (depth > 8) return;
  const reaches = (layer: string) => c.layerIndex.get(layer) === target;
  const route = (m: 'tap' | 'hold'): ReachRoute => ({
    mode: m,
    origin: ctx.origin,
    via,
    ...(ctx.mods?.length ? { mods: ctx.mods } : {}),
    ...(ctx.after ? { after: ctx.after } : {}),
    ...(ctx.taps ? { taps: ctx.taps } : {}),
  });
  const next = (x: Binding, m: 'tap' | 'hold', more: Partial<Extra> = {}) =>
    extraRoutes(c, x, m, target, via, { ...ctx, ...more }, out, depth + 1);
  switch (b.kind) {
    case 'sl':
    case 'tog':
    case 'to':
      if (ctx.extra && (mode === 'tap' || ctx.holdArm) && reaches(b.layer)) out.push(route(mode));
      return;
    case 'auto_layer':
      if ((mode === 'tap' || ctx.holdArm) && reaches(b.layer)) out.push(route(mode));
      return;
    case 'mo':
      if (ctx.extra && mode === 'hold' && reaches(b.layer)) out.push(route('hold'));
      return;
    case 'lt':
      if (mode === 'hold') {
        if (ctx.extra && reaches(b.layer)) out.push(route('hold'));
      } else next(b.tap, mode);
      return;
    case 'hold_tap':
      next(mode === 'hold' ? b.hold : b.tap, mode, { holdArm: mode === 'hold' });
      return;
    case 'mod_morph':
      next(b.default, mode);
      next(b.morphed, mode, { mods: [...(ctx.mods ?? []), b.mods[0]] });
      return;
    case 'layer_morph':
      next(b.inactive, mode);
      next(b.active, mode);
      return;
    case 'tap_dance':
      b.bindings.forEach((x, i) => {
        next(x, mode, i === 0 ? {} : { extra: true, taps: i + 1 });
      });
      return;
    case 'adaptive':
      if (b.default) next(b.default, mode);
      if (mode !== 'tap' && !ctx.holdArm) return;
      for (const t of b.triggers ?? []) {
        const after = {
          ...(t.afterAny?.length ? { afterAny: t.afterAny } : {}),
          ...(t.afterTags?.length ? { afterTags: t.afterTags } : {}),
        };
        next(t.binding, mode, { extra: true, origin: 'adaptive', after });
      }
      return;
    case 'macro':
      // Held or tapped, the press runs the macro's steps; the key is marked the way it is pressed.
      if (mode !== 'tap' && !ctx.holdArm) return;
      for (const s of [...(b.steps ?? []), ...(b.then ?? [])]) {
        next(s, mode, { extra: true, origin: ctx.origin === 'key' ? 'macro' : ctx.origin });
      }
      return;
    default:
      return;
  }
}

const sameRoute = (a: ReachRoute, b: ReachRoute) => JSON.stringify(a) === JSON.stringify(b);

/** Whether any arm of a binding brings the layer on: a layer key, a macro step, a branch, a tap. */
export function bindingReaches(c: CompiledLayout, b: Binding, layer: number, via: number): boolean {
  const out: ReachRoute[] = [];
  for (const mode of ['tap', 'hold'] as const) {
    extraRoutes(c, b, mode, layer, via, { extra: true, origin: 'key' }, out);
  }
  return out.length > 0;
}

/** The routes straight into a layer, not through another that turns it on. */
function directRoutes(
  c: CompiledLayout,
  layer: number,
  declared: Record<string, ActivatorDef[]>,
): Map<number, ReachRoute[]> {
  const byPos = new Map<number, ReachRoute[]>();
  const add = (pos: number, r: ReachRoute) => {
    const list = byPos.get(pos) ?? [];
    if (!list.some((x) => sameRoute(x, r))) list.push(r);
    byPos.set(pos, list);
  };
  const candidates = (discoverActivators(c, declared).get(layer) ?? []).filter(
    // A key on the layer itself is how to leave it, or stay in it, not how to get there.
    (a) => a.viaLayer !== layer,
  );
  for (const a of candidates.filter((x) => !x.user)) {
    add(a.pos, {
      mode: a.mode,
      origin: 'key',
      via: a.viaLayer,
      ...(a.requiredMods?.length ? { mods: a.requiredMods } : {}),
    });
  }
  for (const a of candidates.filter((x) => x.user)) {
    const own = byPos.get(a.pos)?.find((r) => r.via === a.viaLayer && r.mode === a.mode);
    if (own) {
      own.declared = true;
      if (a.from !== undefined) own.from = a.from;
      continue;
    }
    // The simulator passes over a declared key that no longer brings the layer on; so does the board.
    const b = c.layers[a.viaLayer]?.bindings[a.pos];
    if (!b || !bindingReaches(c, b, layer, a.viaLayer)) continue;
    add(a.pos, {
      mode: a.mode,
      origin: 'activator',
      via: a.viaLayer,
      declared: true,
      ...(a.from !== undefined ? { from: a.from } : {}),
      ...(a.requiredMods?.length ? { mods: a.requiredMods } : {}),
    });
  }
  c.layers.forEach((l, via) => {
    if (via === layer) return;
    l.bindings.forEach((b, pos) => {
      if (b.kind === 'trans' || b.kind === 'none') return;
      for (const mode of ['tap', 'hold'] as const) {
        const out: ReachRoute[] = [];
        extraRoutes(c, b, mode, layer, via, { extra: false, origin: 'key' }, out);
        for (const r of out) add(pos, r);
      }
    });
  });
  return byPos;
}

/**
 * The keys held or tapped to bring a layer on, as the board marks them on that layer: the keys the
 * simulator presses to get there, the ones a layout declares, and what the machine also runs — a
 * macro that arms the layer (the only way into Magic Romak's Ç extension), a magic key's branch,
 * an auto layer, a later tap of a tap dance. A layer that comes on when others are on together is
 * reached through those, and through nothing else: the machine turns it off any other way.
 *
 * The base layer is never reached; it is always on.
 */
export function reachKeys(
  c: CompiledLayout,
  layer: number,
  declared: Record<string, ActivatorDef[]> = c.layout.activators ?? {},
  seen: ReadonlySet<number> = new Set(),
): ReachKey[] {
  if (layer <= 0 || layer >= c.layers.length || seen.has(layer)) return [];
  const conditions = c.conditionalLayers.filter((x) => x.then === layer);
  let byPos: Map<number, ReachRoute[]>;
  if (conditions.length > 0) {
    byPos = new Map();
    const inner = new Set([...seen, layer]);
    for (const cond of conditions) {
      const ifs = c.layers.map((l) => l.idx).filter((i) => (cond.ifMask & (1 << i)) !== 0);
      for (const through of ifs) {
        for (const k of reachKeys(c, through, declared, inner)) {
          const list = byPos.get(k.pos) ?? [];
          for (const r of k.routes) {
            if (r.via === layer) continue;
            const routed: ReachRoute = {
              ...r,
              through: { layer: through, with: ifs.filter((i) => i !== through) },
            };
            if (!list.some((x) => sameRoute(x, routed))) list.push(routed);
          }
          if (list.length > 0) byPos.set(k.pos, list);
        }
      }
    }
  } else {
    byPos = directRoutes(c, layer, declared);
  }
  return [...byPos.entries()]
    .filter(([, routes]) => routes.length > 0)
    .sort(([a], [b]) => a - b)
    .map(([pos, routes]) => {
      const held = routes.some((r) => r.mode === 'hold');
      const tapped = routes.some((r) => r.mode === 'tap');
      return { pos, how: held && tapped ? 'both' : held ? 'held' : 'tapped', routes };
    });
}

/** The text a key's macro types, found on the arm a tap reaches: what a reader knows it by. */
function macroText(b: Binding | undefined): string {
  switch (b?.kind) {
    case 'macro':
      return (
        b.symbols ??
        (b.steps ?? [])
          .map((s) => (s.kind === 'kp' ? (s.symbol ?? '') : s.kind === 'macro' ? macroText(s) : ''))
          .join('')
      );
    case 'hold_tap':
    case 'lt':
      return macroText(b.tap);
    case 'mod_morph':
      return macroText(b.default);
    case 'tap_dance':
      return macroText(b.bindings[0]);
    default:
      return '';
  }
}

/** `a`, `a or b`, `a, b or c`. */
function orList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

const TIMES = ['', '', 'twice', 'three times', 'four times'];

/**
 * A reach key in words, for its spoken name and the legend under the board: "held from Alpha 1 or
 * Numbers to reach Symbols", "tapped from Ç extension, or from Alpha 1 after v, x or j, to reach
 * Alpha 2".
 */
export function describeReach(c: CompiledLayout, layer: number, key: ReachKey): string {
  const name = (i: number) => c.layers[i]?.name ?? String(i);
  const verbs = new Map<string, { plain: string[]; qualified: string[] }>();
  const through = new Set<string>();
  for (const r of key.routes) {
    const verb =
      r.mode === 'hold'
        ? 'held'
        : r.taps && r.taps > 1
          ? `tapped ${TIMES[r.taps] ?? `${r.taps} times`}`
          : 'tapped';
    const qualifiers: string[] = [];
    if (r.after?.afterAny?.length) qualifiers.push(`after ${orList(r.after.afterAny)}`);
    if (r.after?.afterTags?.length)
      qualifiers.push(`after a key tagged ${orList(r.after.afterTags)}`);
    if (r.mods?.length) qualifiers.push(`with ${orList(r.mods.map((m) => MOD_NAME[m]))}`);
    if (r.origin === 'macro') {
      const text = macroText(c.layers[r.via].bindings[key.pos]);
      qualifiers.push(text ? `by the ${text} macro` : 'by its macro');
    }
    const entry = verbs.get(verb) ?? { plain: [], qualified: [] };
    const where = name(r.via);
    if (qualifiers.length === 0) {
      if (!entry.plain.includes(where)) entry.plain.push(where);
    } else {
      const phrase = `from ${where} ${qualifiers.join(', ')}`;
      if (!entry.qualified.includes(phrase)) entry.qualified.push(phrase);
    }
    verbs.set(verb, entry);
    if (r.through) {
      const others = r.through.with.map(name);
      through.add(
        `${name(r.through.layer)}, which turns ${name(layer)} on together with ${orList(others).replace(/ or ([^,]+)$/, ' and $1')}`,
      );
    }
  }
  const parts = [...verbs.entries()].map(([verb, { plain, qualified }]) => {
    const phrases = [...(plain.length ? [`from ${orList(plain)}`] : []), ...qualified];
    return qualified.length > 0 && phrases.length > 1
      ? `${verb} ${phrases.join(', or ')},`
      : `${verb} ${phrases.join('')}`;
  });
  const target = through.size > 0 ? [...through].join('; or ') : name(layer);
  return `${parts.join(' or ')} to reach ${target}`.replace(/,\s+to reach/, ', to reach');
}
