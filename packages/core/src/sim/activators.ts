import type { CompiledLayout } from '../layout/compile.js';
import { modChoiceText } from '../layout/labels.js';
import { partOf } from '../layout/parts.js';
import type { ActivatorDef, Binding, ModChoice } from '../layout/types.js';
import { heldChoices, intoMorph, type MorphPath, NO_PATH } from './mod-needs.js';

/** A key the planner can press to bring a layer on. */
export interface ActivatorCandidate {
  pos: number;
  viaLayer: number;
  mode: 'tap' | 'hold';
  target: number;
  user: boolean;
  order: number;
  /** Modifiers that must be active for this part of the binding to be chosen (a mod-morph's). */
  requiredMods?: ModChoice[];
  /** Source layer restriction (user-declared activators). */
  from?: number;
  /** A combo rather than a key: its keys pressed together. `pos` is the combo's own position. */
  combo?: number;
  /** How many times it is tapped, for a tap dance's later branch. Absent for once. */
  taps?: number;
}

interface LayerTarget {
  mode: 'tap' | 'hold';
  target: number;
  kind: string;
  requiredMods?: ModChoice[];
  /** A tap dance's branch past its first: the taps that choose it. */
  taps?: number;
}

/**
 * The most taps that can still choose something a tap less does not, however many branches the
 * dances have. Past its last branch a tap dance stays on that branch, but a tap dance inside it
 * goes on choosing by the same taps.
 */
function tapsThatChoose(b: Binding, depth = 0): number {
  if (depth > 8) return 1;
  const most = (...xs: (Binding | undefined)[]) =>
    Math.max(1, ...xs.filter((x) => x !== undefined).map((x) => tapsThatChoose(x, depth + 1)));
  switch (b.kind) {
    case 'tap_dance':
      return Math.max(b.bindings.length, most(b.bindings.at(-1)));
    case 'hold_tap':
      return most(b.tap, b.hold);
    case 'lt':
      return most(b.tap);
    case 'mod_morph':
      return most(b.default, b.morphed);
    case 'layer_morph':
      return most(b.inactive, b.active);
    case 'adaptive':
      return most(b.default, ...(b.triggers ?? []).map((t) => t.binding));
    default:
      return 1;
  }
}

/** The branch of a tap dance a press of `taps` taps runs, as the machine picks it. */
const branchFor = (b: Extract<Binding, { kind: 'tap_dance' }>, taps: number) =>
  b.bindings[Math.min(taps, b.bindings.length) - 1];

/**
 * The rank of a way in: by the kind of key, then one needing modifiers after one that does not,
 * then a tap dance's later branch after a first tap, then the order it was found in. Each band is
 * wider than the ones after it can reach.
 */
const orderOf = (t: LayerTarget, order: number) =>
  (KIND_ORDER[t.kind] ?? 5) * 1e9 +
  (t.requiredMods?.length ? 5e8 : 0) +
  ((t.taps ?? 1) - 1) * 1e6 +
  order;

function collectLayerTargets(
  compiled: CompiledLayout,
  b: Binding,
  mode: 'tap' | 'hold',
  out: LayerTarget[],
  depth = 0,
  path: MorphPath = NO_PATH,
  /** Inside a tap-hold's hold, where a tap's behaviour runs when the key is held. */
  holdArm = false,
  /**
   * The taps of the press, once a tap dance has chosen a branch by them; undefined outside one. A
   * tap dance inside a branch chooses by the same taps, as the machine does.
   */
  taps?: number,
): void {
  if (depth > 8) return;
  const li = (id: string) => compiled.layerIndex.get(id);
  const push = (target: number | undefined, kind: string) => {
    if (target === undefined) return;
    // A part no modifiers held can choose is no way in.
    const requiredMods = heldChoices(path);
    if (requiredMods === null) return;
    out.push({
      mode,
      target,
      kind,
      ...(requiredMods.length ? { requiredMods } : {}),
      ...(taps !== undefined && taps > 1 ? { taps } : {}),
    });
  };
  const next = (x: Binding, p = path, arm = holdArm, t = taps) =>
    collectLayerTargets(compiled, x, mode, out, depth + 1, p, arm, t);
  switch (b.kind) {
    case 'sl':
    case 'tog':
    case 'to':
      // On a tap-hold's hold too: the key is held past its tapping term, and comes up again.
      if (mode === 'tap' || holdArm) push(li(b.layer), b.kind);
      return;
    case 'mo':
      if (mode === 'hold') push(li(b.layer), 'mo');
      return;
    case 'lt':
      if (mode === 'hold') push(li(b.layer), 'lt');
      else next(b.tap);
      return;
    case 'hold_tap':
      next(mode === 'hold' ? b.hold : b.tap, path, mode === 'hold');
      return;
    case 'mod_morph':
      next(b.default, intoMorph(path, b, false));
      next(b.morphed, intoMorph(path, b, true));
      return;
    case 'layer_morph':
      next(b.inactive);
      next(b.active);
      return;
    case 'tap_dance':
      // Inside a branch, the branch the press's taps choose, as the machine picks it. Tapped, each
      // branch is a way in, chosen by its number of taps; held, a key is pressed once.
      if (taps !== undefined) {
        const x = branchFor(b, taps);
        if (x) next(x, path, holdArm, taps);
      } else if (mode === 'tap' && !holdArm) {
        for (let t = 1; t <= tapsThatChoose(b); t++) {
          const x = branchFor(b, t);
          if (x) next(x, path, holdArm, t);
        }
      } else if (b.bindings[0]) next(b.bindings[0], path, holdArm, 1);
      return;
    case 'adaptive':
      if (b.default) next(b.default);
      return;
    default:
      return;
  }
}

const KIND_ORDER: Record<string, number> = { sl: 0, mo: 1, lt: 1, tog: 2, to: 3 };

/**
 * Every key the planner may press to bring each layer on, best first: the ones a layout declares
 * in `activators`, then what its keys do when tapped or held — one-shot, hold, toggle, switch — and
 * what its typing combos do when their keys are tapped together, from each layer they fire on.
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
            order: orderOf(t, order++),
            requiredMods: t.requiredMods,
            ...(t.taps ? { taps: t.taps } : {}),
          });
          activators.set(t.target, list);
        }
      }
    }
  }
  for (const combo of c.combos) {
    if (combo.role !== 'typing') continue;
    for (const mode of ['tap', 'hold'] as const) {
      const targets: LayerTarget[] = [];
      collectLayerTargets(c, combo.binding, mode, targets);
      for (const t of targets) {
        // A held chord is let go in the same action: a layer it holds is off again at once, and
        // only one it turns on and leaves on (a one-shot, a toggle, a switch) is a way in.
        if (mode === 'hold' && (t.kind === 'mo' || t.kind === 'lt')) continue;
        for (const layer of c.layers) {
          const fires = combo.layerMask === null || (combo.layerMask & (1 << layer.idx)) !== 0;
          if (!fires || layer.idx === t.target) continue;
          const list = activators.get(t.target) ?? [];
          list.push({
            pos: combo.pos,
            viaLayer: layer.idx,
            mode,
            target: t.target,
            user: false,
            order: orderOf(t, order++),
            requiredMods: t.requiredMods,
            combo: combo.idx,
            ...(t.taps ? { taps: t.taps } : {}),
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
      // The key's own best way in that fits what the declaration says of the modifiers: how it is
      // pressed and, for a tap dance's later branch, how often, both from that one route.
      const declaredMods = d.requires?.mods;
      const fits = (a: ActivatorCandidate) =>
        declaredMods?.length
          ? (a.requiredMods ?? []).length > 0 &&
            (a.requiredMods ?? []).every((choice) => choice.some((m) => declaredMods.includes(m)))
          : !a.requiredMods?.length;
      const own = list
        .filter((a) => a.pos === pos && a.viaLayer === viaLayer)
        .sort((a, b) => a.order - b.order);
      const existing = own.find(fits) ?? own[0];
      const mode = existing?.mode ?? 'tap';
      const cand: ActivatorCandidate = {
        pos,
        viaLayer,
        mode,
        target,
        user: true,
        order: -1000 + i,
        requiredMods: d.requires?.mods?.map((m) => [m]) ?? existing?.requiredMods,
        ...(existing?.taps ? { taps: existing.taps } : {}),
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
      // A combo is not a key another key could stand in for, nor is a tap dance's later branch.
      if (cand.mode !== 'tap' || cand.requiredMods?.length || cand.combo !== undefined || cand.taps)
        continue;
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
  /** Modifiers held for the part of the key that does it, a choice each. */
  mods?: ModChoice[];
  /** An adaptive key's branch: only after these. */
  after?: { afterAny?: string[]; afterTags?: string[] };
  /** The tap of a tap dance that does it, from the second on. */
  taps?: number;
  /** For a layer that comes on with others: the one this press brings on, and the rest it needs. */
  through?: { layer: number; with: number[] };
  /** A combo's key: the other keys pressed together with it. */
  chord?: number[];
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
  /** What the key's mod morphs need of the modifiers on the way to this part. */
  path?: MorphPath;
  after?: ReachRoute['after'];
  taps?: number;
  /** Inside a tap dance's branch, where a tap dance inside chooses by the same taps. */
  inDance?: boolean;
  /** Inside a tap-hold's hold, where a tap's behaviour runs when the key is held. */
  holdArm?: boolean;
}

/**
 * The routes the machine runs but the planner has no need to press for: a macro that arms the
 * layer, an adaptive key's branch, a later tap of a tap dance, an auto layer. Only those are
 * emitted, so together with the planner's own activators nothing is counted twice.
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
  const reach = (m: 'tap' | 'hold') => {
    // A part no modifiers held can choose is no way in.
    const mods = heldChoices(ctx.path ?? NO_PATH);
    if (mods === null) return;
    out.push({
      mode: m,
      origin: ctx.origin,
      via,
      ...(mods.length ? { mods } : {}),
      ...(ctx.after ? { after: ctx.after } : {}),
      ...(ctx.taps ? { taps: ctx.taps } : {}),
    });
  };
  const next = (x: Binding, m: 'tap' | 'hold', more: Partial<Extra> = {}) =>
    extraRoutes(c, x, m, target, via, { ...ctx, ...more }, out, depth + 1);
  switch (b.kind) {
    case 'sl':
    case 'tog':
    case 'to':
      if (ctx.extra && (mode === 'tap' || ctx.holdArm) && reaches(b.layer)) reach(mode);
      return;
    case 'auto_layer':
      if ((mode === 'tap' || ctx.holdArm) && reaches(b.layer)) reach(mode);
      return;
    case 'mo':
      if (ctx.extra && mode === 'hold' && reaches(b.layer)) reach('hold');
      return;
    case 'lt':
      if (mode === 'hold') {
        if (ctx.extra && reaches(b.layer)) reach('hold');
      } else next(b.tap, mode);
      return;
    case 'hold_tap':
      next(mode === 'hold' ? b.hold : b.tap, mode, { holdArm: mode === 'hold' });
      return;
    case 'mod_morph':
      next(b.default, mode, { path: intoMorph(ctx.path ?? NO_PATH, b, false) });
      next(b.morphed, mode, { path: intoMorph(ctx.path ?? NO_PATH, b, true) });
      return;
    case 'layer_morph':
      next(b.inactive, mode);
      next(b.active, mode);
      return;
    case 'tap_dance':
      // Tapped, the planner presses a later branch itself, as `collectLayerTargets` finds it; held,
      // or inside another tap dance, a later branch is a route it does not press.
      if (ctx.inDance) {
        const x = branchFor(b, ctx.taps ?? 1);
        if (x) next(x, mode);
        return;
      }
      {
        const planned = mode === 'tap' && !ctx.holdArm;
        // Held, on its own or in a tap-hold's hold, a tap dance is pressed once: its first branch.
        const last = mode === 'hold' ? 1 : tapsThatChoose(b);
        for (let t = 1; t <= last; t++) {
          const x = branchFor(b, t);
          if (!x) continue;
          next(x, mode, {
            inDance: true,
            ...(t === 1 ? {} : planned ? { taps: t } : { extra: true, taps: t }),
          });
        }
      }
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

/** Whether any part of a binding brings the layer on: a layer key, a macro step, a branch, a tap. */
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
    const route: ReachRoute = {
      mode: a.mode,
      origin: 'key',
      via: a.viaLayer,
      ...(a.requiredMods?.length ? { mods: a.requiredMods } : {}),
      ...(a.taps ? { taps: a.taps } : {}),
    };
    if (a.combo === undefined) {
      add(a.pos, route);
      continue;
    }
    // Every key of a combo is marked, each naming the others it is pressed with.
    const keys = c.combos[a.combo].keys;
    for (const pos of keys) add(pos, { ...route, chord: keys.filter((k) => k !== pos) });
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
    l.bindings.forEach((b, pos) => {
      if (b.kind === 'trans' || b.kind === 'none') return;
      for (const mode of ['tap', 'hold'] as const) {
        const out: ReachRoute[] = [];
        extraRoutes(c, b, mode, layer, via, { extra: false, origin: 'key' }, out);
        for (const r of out) {
          // On the layer itself, a key is how to leave it or stay in it, but one that types and
          // then turns it on again, as a macro ending in a one-shot to it does, brings it back
          // for the next key after its own press used it up.
          if (via === layer && r.origin !== 'macro') continue;
          add(pos, r);
        }
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

/** The text a key's macro types, found on its Plain part: what a reader knows it by. */
function macroText(b: Binding | undefined): string {
  const p = b && partOf(b);
  if (p?.kind !== 'macro') return '';
  return (
    p.symbols ??
    (p.steps ?? [])
      .map((s) => (s.kind === 'kp' ? (s.symbol ?? '') : s.kind === 'macro' ? macroText(s) : ''))
      .join('')
  );
}

/** `a`, `a or b`, `a, b or c`. */
function orList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

/** `a`, `a and b`, `a, b and c`. */
function andList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
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
    if (r.chord?.length)
      qualifiers.push(`together with ${andList(r.chord.map((p) => c.keys[p].id))}`);
    if (r.mods?.length) qualifiers.push(`with ${andList(r.mods.map(modChoiceText))}`);
    if (r.origin === 'macro') {
      const text = macroText(c.layers[r.via].bindings[key.pos]);
      qualifiers.push(text ? `by the ${text} macro` : 'by its macro');
    }
    const entry = verbs.get(verb) ?? { plain: [], qualified: [] };
    const where = name(r.via);
    if (qualifiers.length === 0) {
      if (!entry.plain.includes(where)) entry.plain.push(where);
    } else {
      const phrase = `${r.via === layer ? 'on' : 'from'} ${where} ${qualifiers.join(', ')}`;
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
  // Pressed only on the layer itself, the key brings it back, after its own press used it up.
  const again = key.routes.every((r) => r.via === layer) ? ' again' : '';
  const target = through.size > 0 ? [...through].join('; or ') : name(layer);
  return `${parts.join(' or ')} to reach ${target}${again}`.replace(/,\s+to reach/, ', to reach');
}
