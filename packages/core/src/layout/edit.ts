import { enumerateProducers, type Producer } from '../sim/producers.js';
import { ID_PATTERN, slugWords, unusedId } from '../storage/ids.js';
import { buildGeometry, type CompiledLayout, compileLayout } from './compile.js';
import {
  changeLayerId,
  copyKey,
  duplicateLayer,
  layerReachedFrom,
  moveLayer,
  removeLayer,
  sendKeyToLayer,
  setKeyBinding,
  swapKeys,
} from './ops.js';
import { isLayoutLink, NOT_A_LINK, safeParseLayout } from './schema.js';
import {
  type BehaviorDefaults,
  type Binding,
  type ConditionalLayerDef,
  type LayerColor,
  type Layout,
  type LayoutFeatures,
  MAX_CONDITION_LAYERS,
  type TypingPathEntry,
} from './types.js';

/**
 * One change an author makes to a layout, taken whole. Layers are named by id and keys by key id,
 * so an edit says on its own what it changes; combos by their place in the list, since a saved
 * layout may hold two under one id.
 */
export type Edit =
  /** The same binding on every key listed: typing on a key, Delete, a selection's Clear. */
  | { kind: 'bind'; layer: string; keys: string[]; binding: Binding }
  | { kind: 'swap' | 'copy'; layer: string; from: string; to: string }
  /** Keys on `layer` to the same places on `toLayer`, moved or copied. */
  | { kind: 'send'; layer: string; toLayer: string; keys: string[]; mode: 'move' | 'copy' }
  | { kind: 'addLayer'; name: string }
  | { kind: 'removeLayer' | 'duplicateLayer'; layer: string }
  | { kind: 'renameLayer'; layer: string; name: string }
  /** The layer's id, which links and everything that reaches the layer name it by. */
  | { kind: 'setLayerId'; layer: string; id: string }
  /** What the keys a layer lists nothing for do: show the layer below through, or nothing. */
  | { kind: 'setLayerFallback'; layer: string; fallback: 'trans' | 'none' }
  /** How long one-shot layers and keys wait, and what releases them; empty takes it away. */
  | { kind: 'setBehaviorDefaults'; defaults: BehaviorDefaults }
  /** No colour is Automatic: the one the layer's place in the list gives it. */
  | { kind: 'colorLayer'; layer: string; color: LayerColor | undefined }
  /** The layer to another place in the list; the base layer stays first. */
  | { kind: 'moveLayer'; layer: string; to: number }
  | {
      kind: 'addCombo';
      layer: string;
      keys: string[];
      binding: Binding;
      role: 'typing' | 'command';
    }
  | { kind: 'removeCombo' | 'toggleComboRole'; combo: number }
  /**
   * A layer that comes on by itself while every layer it waits for is on, as ZMK's conditional
   * layers: Extras while Numbers and Symbols are both held. Conditions are named by their place in
   * the list, as combos are.
   */
  | { kind: 'addConditionalLayer'; if: string[]; then: string }
  /** What the fields given change in the condition at that place; the others stay. */
  | { kind: 'updateConditionalLayer'; condition: number; if?: string[]; then?: string }
  | { kind: 'removeConditionalLayer'; condition: number }
  /**
   * What the fields given change in the combo at that place; the others stay. Any binding goes, as
   * on a key. The id follows the keys when they change.
   */
  | {
      kind: 'updateCombo';
      combo: number;
      keys?: string[];
      layers?: string[];
      binding?: Binding;
      role?: 'typing' | 'command';
      timeoutMs?: number;
    }
  | { kind: 'setBehavior'; name: string; binding: Binding }
  /** Every behaviour, from the JSON an author wrote. */
  | { kind: 'replaceBehaviors'; json: string }
  /** One symbol's whole list of producers, in order. */
  | { kind: 'setTypingPath'; symbol: string; entries: TypingPathEntry[] }
  | {
      kind: 'setKeys';
      space?: string;
      shift?: string | null;
      shiftKind?: 'sk' | 'hold';
      repeat?: 'repeatKey' | 'tapTwice';
    }
  | {
      kind: 'setMeta';
      name?: string;
      author?: string;
      description?: string;
      /** Where the layout comes from, an http(s) URL; an empty one takes the link away. */
      link?: string;
      /** The languages the layout is for, by tag; an empty list says none. */
      languages?: string[];
    }
  /** Features with nothing in them take the field away. */
  | { kind: 'setFeatures'; features: LayoutFeatures }
  /** The whole layout, from the JSON an author pasted. */
  | { kind: 'replaceLayout'; json: string };

/**
 * Where an edit's subject is once it has landed: the layer it is on, and the keys it is about. An
 * absent field means the edit is not about that, so whoever shows the layout keeps what it had.
 */
export interface Landing {
  layer?: string;
  keys?: string[];
}

/**
 * How an edit went, with the edit and the layout it was made on. An edit lands whole, with a
 * layout that compiles; is refused with the reason, leaving the layout as it was; or would change
 * nothing.
 */
export type EditOutcome = { edit: Edit; before: Layout } & (
  | { status: 'landed'; layout: Layout; compiled: CompiledLayout; at: Landing }
  | { status: 'refused'; message: string }
  | { status: 'unchanged' }
);

/** What one kind of edit makes: a layout and where it landed, the same layout, or a refusal. */
type Step = { layout: Layout; at?: Landing } | { refused: string };

// `Edit & { kind: K }` rather than `Extract`: one member names two kinds (swap and copy, say), and
// `Extract` would hand those handlers `never`, so a misspelt field would still compile.
type Handlers = { [K in Edit['kind']]: (layout: Layout, edit: Edit & { kind: K }) => Step };

const same = (layout: Layout): Step => ({ layout });

/** Whether two plain JSON values hold the same, however their fields are ordered. */
/**
 * Why a condition cannot be, among the layout's others but the one at `at`; or null. The base layer
 * is always on, so it neither waits nor is waited for; a layer waits for others, not itself; and a
 * layer that comes on by a condition is never one another waits for.
 */
function conditionRefused(layout: Layout, c: ConditionalLayerDef, at: number): string | null {
  const base = layout.layers[0]?.id;
  const others = (layout.conditionalLayers ?? []).filter((_, i) => i !== at);
  if (c.then === base) return 'the base layer is always on: it waits for no other';
  if (c.if.length === 0) return 'a conditional layer waits for one layer at least';
  if (c.if.length > MAX_CONDITION_LAYERS) {
    return `a conditional layer waits for ${MAX_CONDITION_LAYERS} layers at most`;
  }
  if (c.if.includes(c.then)) return `${c.then} cannot wait for itself`;
  if (base !== undefined && c.if.includes(base)) {
    return 'the base layer is always on: waiting for it is waiting for nothing';
  }
  const conditional = new Set(others.map((o) => o.then));
  const waits = c.if.find((l) => conditional.has(l));
  if (waits) return `${waits} comes on by a condition itself: no other layer waits for it`;
  if (others.some((o) => o.if.includes(c.then))) {
    return `a condition waits for ${c.then}, so it cannot come on by one itself`;
  }
  const sameIf = (o: ConditionalLayerDef) =>
    o.if.length === c.if.length && o.if.every((l) => c.if.includes(l));
  if (others.some((o) => o.then === c.then && sameIf(o))) return 'that condition is there already';
  return null;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const names = Object.keys(x).filter((k) => x[k] !== undefined);
  const others = Object.keys(y).filter((k) => y[k] !== undefined);
  return names.length === others.length && names.every((k) => sameValue(x[k], y[k]));
}

type ComboOf = NonNullable<Layout['combos']>[number];

/** The id the compiler knows a combo by: the one it has, or `combo` and its place. */
const comboId = (c: ComboOf, place: number) => c.id ?? `combo${place}`;

/**
 * The typing paths of `after`, which is `before` with the combo at `place` changed: what its paths
 * say about the combo follows it. Producer ids are not taken apart as text, since ids may hold the
 * very characters that join them: the simulator's own producers say which of their steps the combo
 * is, and so which part of the id is its. A combo is the source of a dead key's producer
 * (`deadkey:combo:<id>…+<letter>`), the letter it accents (`deadkey:<source>+combo:<id>…`), or the
 * producer itself (`combo:<id>…`). A path that names the combo goes to its new id, and is dropped
 * when the combo no longer makes that symbol that way; the others stay as they were.
 */
function followCombo(before: Layout, after: Layout, place: number): Layout['typingPaths'] {
  const paths = before.typingPaths;
  if (!paths) return paths;
  let was: CompiledLayout;
  let now: CompiledLayout;
  try {
    was = compileLayout(before);
    now = compileLayout(after);
  } catch {
    return paths;
  }
  // Ids are not unique across symbols: a combo's own id can be another's id with a suffix. So a
  // path is read among the producers of its symbol, and left alone when even those disagree.
  const listed = (c: CompiledLayout) => {
    const index = enumerateProducers(c, 'model');
    return [...index.bySymbol.values()].flat().concat(index.excludedByCase);
  };
  const oldProducers = listed(was);
  const madeProducers = listed(now);
  const lookup = (all: Producer[], id: string, symbol: string) =>
    all.filter((p) => p.id === id && p.symbols === symbol);
  const from = `combo:${was.combos[place]?.id}`;
  const to = `combo:${now.combos[place]?.id}`;
  const swap = (id: string) => (id.startsWith(from) ? `${to}${id.slice(from.length)}` : id);
  /** The id the producer has once the combo is the one it now is. */
  const renamed = (producer: string, p: Producer): string => {
    if (p.kind === 'combo') return swap(producer);
    const [first, ...rest] = p.steps;
    const source =
      first.combo !== undefined
        ? `combo:${was.combos[first.combo]?.id}`
        : `${was.layers[first.layer ?? 0]?.id}/${was.keys[first.pos]?.id}`;
    const accent = producer.startsWith(`deadkey:${source}#shifted+`) ? '#shifted' : '';
    const head = `deadkey:${source}${accent}+`;
    if (p.kind !== 'deadkey' || !producer.startsWith(head)) return producer;
    const letter = producer.slice(head.length);
    const sourceNow = first.combo === place ? swap(source) : source;
    const letterNow = rest.some((st) => st.combo === place) ? swap(letter) : letter;
    return `deadkey:${sourceNow}${accent}+${letterNow}`;
  };
  let changed = false;
  const next: NonNullable<Layout['typingPaths']> = {};
  for (const [symbol, entries] of Object.entries(paths)) {
    const kept: TypingPathEntry[] = [];
    for (const e of entries) {
      const named = lookup(oldProducers, e.producer, symbol);
      const ours = named.filter((p) => p.steps.some((st) => st.combo === place));
      if (ours.length === 0 || ours.length < named.length) {
        kept.push(e);
        continue;
      }
      const producer = renamed(e.producer, ours[0]);
      if (lookup(madeProducers, producer, symbol).length === 0) {
        changed = true;
        continue;
      }
      if (producer !== e.producer) changed = true;
      kept.push({ ...e, producer });
    }
    // A list that only named this combo goes with it, rather than staying as an empty ordering.
    if (kept.length > 0 || entries.length === 0) next[symbol] = kept;
    else changed = true;
  }
  return changed ? next : paths;
}

/**
 * A free id for a combo on `keys`, named after them. A combo's producers are its id and its id
 * with a `#…` suffix (`#hold`, `#shifted`, …), so an id is taken when another combo has it, or has
 * it with a `#` after: that one's producer would share an id with one of this combo's.
 */
function freeComboId(keys: string[], others: string[]): string {
  return unusedId(slugWords(keys.join('-')) || 'combo', {
    has: (id) => others.some((o) => o === id || o.startsWith(`${id}#`)),
  });
}

/**
 * The producer ids that the combo at `place` takes part in and that another producer has too: its
 * own (`combo:<id>…`) and the dead-key ones it is the accent or the letter of. A typing path naming
 * one of them would name both. None when the layout does not compile, which the edit then refuses
 * on its own.
 */
function sharedProducerIds(layout: Layout, place: number): string[] {
  let compiled: CompiledLayout;
  try {
    compiled = compileLayout(layout);
  } catch {
    return [];
  }
  const index = enumerateProducers(compiled, 'model');
  const byId = new Map<string, Producer[]>();
  for (const p of [...index.bySymbol.values()].flat().concat(index.excludedByCase)) {
    byId.set(p.id, [...(byId.get(p.id) ?? []), p]);
  }
  const involved = (p: Producer) => p.steps.some((st) => st.combo === place);
  return [...byId].filter(([, ps]) => ps.length > 1 && ps.some(involved)).map(([id]) => id);
}

/** Whether two lists of keys name the same keys, in any order. */
/**
 * A combo has no layer below it to show through, so Transparent, or a behaviour that is, is no
 * binding for one, however it is given.
 */
function transparent(layout: Layout, b: Binding, depth = 0): boolean {
  if (b.kind === 'trans') return true;
  // As deep as the compiler follows references.
  if (b.kind !== 'ref' || depth > 16) return false;
  const named = layout.behaviors?.[b.ref];
  return named !== undefined && transparent(layout, named, depth + 1);
}
const NOT_TRANSPARENT = 'a combo cannot be Transparent: it has no layer below it to show through';

/**
 * The behaviours given, unless they would make a combo that refers to one Transparent. A combo
 * that already was, in an older layout, does not stop the edit.
 */
function withBehaviors(layout: Layout, behaviors: Record<string, Binding>): Step {
  const next = { ...layout, behaviors };
  const turned = (layout.combos ?? []).find(
    (c) => transparent(next, c.binding) && !transparent(layout, c.binding),
  );
  if (turned) {
    return { refused: `${NOT_TRANSPARENT} (combo ${turned.id ?? turned.keys.join('+')})` };
  }
  return { layout: next };
}

const sameKeySet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((k) => b.includes(k));

/** Whether two combos can fire on the same layer; one with no layers fires on all of them. */
const sharesLayer = (a: ComboOf, b: ComboOf) =>
  !a.layers || !b.layers || a.layers.some((l) => b.layers?.includes(l));

const indexOf = (layout: Layout, id: string) => layout.layers.findIndex((l) => l.id === id);

/** The same layout with one layer changed, or the layout itself when there is no such layer. */
function withLayer(
  layout: Layout,
  id: string,
  change: (l: Layout['layers'][number]) => Layout['layers'][number],
): Layout {
  const i = indexOf(layout, id);
  if (i < 0) return layout;
  const layers = [...layout.layers];
  layers[i] = change(layers[i]);
  return { ...layout, layers };
}

function parseJson(json: string): { ok: true; value: unknown } | { ok: false; refused: string } {
  try {
    return { ok: true, value: JSON.parse(json) };
  } catch (e) {
    return { ok: false, refused: `invalid JSON: ${e instanceof Error ? e.message : e}` };
  }
}

const handlers: Handlers = {
  bind(layout, { layer, keys, binding }) {
    const i = indexOf(layout, layer);
    if (i < 0 || keys.length === 0) return same(layout);
    let next = layout;
    for (const key of keys) next = setKeyBinding(next, i, key, binding);
    return { layout: next, at: { keys } };
  },

  swap(layout, { layer, from, to }) {
    const i = indexOf(layout, layer);
    if (i < 0 || from === to) return same(layout);
    return { layout: swapKeys(layout, i, from, to), at: { keys: [to] } };
  },

  copy(layout, { layer, from, to }) {
    const i = indexOf(layout, layer);
    if (i < 0 || from === to) return same(layout);
    return { layout: copyKey(layout, i, from, to), at: { keys: [to] } };
  },

  // The board follows the keys to their layer, where they are still selected: the only way to
  // see that they landed.
  send(layout, { layer, toLayer, keys, mode }) {
    const source = indexOf(layout, layer);
    const target = indexOf(layout, toLayer);
    if (source < 0 || target < 0 || source === target || keys.length === 0) return same(layout);
    let next = layout;
    for (const key of keys) next = sendKeyToLayer(next, source, target, key, mode);
    return { layout: next, at: { layer: toLayer, keys } };
  },

  addLayer(layout, edit) {
    const name = edit.name.trim() || `Layer ${layout.layers.length + 1}`;
    const taken = new Set(layout.layers.map((l) => l.id));
    const id = unusedId(slugWords(name) || 'layer', taken);
    const layer = { id, name, bindings: { '*': { kind: 'trans' } as Binding } };
    return {
      layout: { ...layout, layers: [...layout.layers, layer] },
      at: { layer: id, keys: [] },
    };
  },

  removeLayer(layout, { layer }) {
    if (layout.layers[0]?.id === layer) return { refused: 'cannot remove the base layer' };
    const i = indexOf(layout, layer);
    if (i < 0) return same(layout);
    // A layer something still reaches cannot go without breaking that key; say which, and let the
    // author decide what those keys should do instead.
    const reaching = layerReachedFrom(layout, layer);
    if (reaching.length > 0) {
      const name = layout.layers[i].name ?? layer;
      return {
        refused: `${name} is still reached from ${reaching.join(', ')}. Point those at another layer first.`,
      };
    }
    return { layout: removeLayer(layout, layer) };
  },

  duplicateLayer(layout, { layer }) {
    const copy = duplicateLayer(layout, indexOf(layout, layer));
    return copy ? { layout: copy.layout, at: { layer: copy.id } } : same(layout);
  },

  renameLayer(layout, { layer, name }) {
    const trimmed = name.trim();
    const current = layout.layers[indexOf(layout, layer)];
    if (!current || trimmed === '' || trimmed === current.name) return same(layout);
    return { layout: withLayer(layout, layer, (l) => ({ ...l, name: trimmed })) };
  },

  setLayerId(layout, { layer, id }) {
    const trimmed = id.trim();
    if (indexOf(layout, layer) < 0 || trimmed === layer) return same(layout);
    if (!ID_PATTERN.test(trimmed)) {
      return { refused: 'a layer id is letters, digits, - and _, with no spaces' };
    }
    if (indexOf(layout, trimmed) >= 0) return { refused: `another layer is ${trimmed} already` };
    return { layout: changeLayerId(layout, layer, trimmed), at: { layer: trimmed } };
  },

  setLayerFallback(layout, { layer, fallback }) {
    const current = layout.layers[indexOf(layout, layer)];
    if (!current || current.bindings['*']?.kind === fallback) return same(layout);
    return {
      layout: withLayer(layout, layer, (l) => ({
        ...l,
        bindings: { ...l.bindings, '*': { kind: fallback } },
      })),
    };
  },

  setBehaviorDefaults(layout, { defaults }) {
    const kept = Object.fromEntries(
      Object.entries(defaults).filter(
        ([, v]) => v && Object.values(v).some((x) => x !== undefined),
      ),
    ) as BehaviorDefaults;
    const { behaviorDefaults: _was, ...rest } = layout;
    return { layout: Object.keys(kept).length ? { ...rest, behaviorDefaults: kept } : rest };
  },

  colorLayer(layout, { layer, color }) {
    const current = layout.layers[indexOf(layout, layer)];
    if (!current || current.color === color) return same(layout);
    return {
      layout: withLayer(layout, layer, ({ color: _was, ...rest }) =>
        color ? { ...rest, color } : rest,
      ),
    };
  },

  moveLayer(layout, { layer, to }) {
    return { layout: moveLayer(layout, indexOf(layout, layer), to) };
  },

  addCombo(layout, { layer, keys, binding, role }) {
    if (keys.length < 2) return { refused: 'a combo needs at least two keys and an output' };
    if (transparent(layout, binding)) return { refused: NOT_TRANSPARENT };
    const id = freeComboId(keys, (layout.combos ?? []).map(comboId));
    const combo = { id, keys, binding, layers: [layer], role, timeoutMs: 50, slowRelease: false };
    return { layout: { ...layout, combos: [...(layout.combos ?? []), combo] } };
  },

  addConditionalLayer(layout, edit) {
    const next = { if: [...new Set(edit.if)], then: edit.then };
    const refused = conditionRefused(layout, next, -1);
    if (refused) return { refused };
    return {
      layout: { ...layout, conditionalLayers: [...(layout.conditionalLayers ?? []), next] },
      at: { layer: next.then },
    };
  },

  updateConditionalLayer(layout, edit) {
    const conditions = layout.conditionalLayers ?? [];
    const current = conditions[edit.condition];
    if (!current) return same(layout);
    const next = {
      if: edit.if ? [...new Set(edit.if)] : current.if,
      then: edit.then ?? current.then,
    };
    if (sameValue(next, current)) return same(layout);
    const refused = conditionRefused(layout, next, edit.condition);
    if (refused) return { refused };
    return {
      layout: {
        ...layout,
        conditionalLayers: conditions.map((c, i) => (i === edit.condition ? next : c)),
      },
    };
  },

  removeConditionalLayer(layout, { condition }) {
    const conditions = layout.conditionalLayers ?? [];
    if (!conditions[condition]) return same(layout);
    const rest = conditions.filter((_, i) => i !== condition);
    const { conditionalLayers: _gone, ...without } = layout;
    return { layout: rest.length > 0 ? { ...layout, conditionalLayers: rest } : without };
  },

  removeCombo(layout, { combo }) {
    const combos = layout.combos ?? [];
    if (!combos[combo]) return same(layout);
    return { layout: { ...layout, combos: combos.filter((_, i) => i !== combo) } };
  },

  toggleComboRole(layout, { combo }) {
    const combos = layout.combos ?? [];
    const c = combos[combo];
    if (!c) return same(layout);
    const role = c.role === 'typing' ? ('command' as const) : ('typing' as const);
    return {
      layout: { ...layout, combos: combos.map((x, i) => (i === combo ? { ...c, role } : x)) },
    };
  },

  updateCombo(layout, edit) {
    const combos = layout.combos ?? [];
    const current = combos[edit.combo];
    if (!current) return same(layout);
    let next: ComboOf = { ...current };

    if (edit.keys) {
      const keys = [...new Set(edit.keys)];
      if (keys.length < 2) return { refused: 'a combo needs at least two keys' };
      const known = new Set(buildGeometry(layout).keys.map((k) => k.id));
      const unknown = keys.find((k) => !known.has(k));
      if (unknown !== undefined) return { refused: `the board has no key ${unknown}` };
      // The same keys in another order are the same combo: nothing to change.
      if (!sameKeySet(keys, current.keys)) next.keys = keys;
    }

    if (edit.layers) {
      const layers = [...new Set(edit.layers)];
      if (layers.length === 0) return { refused: 'a combo needs at least one layer' };
      const unknown = layers.find((l) => indexOf(layout, l) < 0);
      if (unknown !== undefined) return { refused: `the layout has no layer ${unknown}` };
      next.layers = layers;
    }

    if (edit.keys || edit.layers) {
      const clash = combos.find(
        (c, i) => i !== edit.combo && sameKeySet(c.keys, next.keys) && sharesLayer(c, next),
      );
      if (clash) {
        return {
          refused: `another combo already uses ${next.keys.join('+')} on a layer of this one`,
        };
      }
    }

    if (edit.binding) {
      if (transparent(layout, edit.binding)) return { refused: NOT_TRANSPARENT };
      next.binding = edit.binding;
    }
    if (edit.role) next.role = edit.role;
    if (edit.timeoutMs !== undefined) {
      if (!(edit.timeoutMs > 0)) return { refused: 'a combo timeout is a positive number of ms' };
      next.timeoutMs = edit.timeoutMs;
    }

    // The id names the keys, so it follows them when they are others.
    const others = combos.flatMap((c, i) => (i === edit.combo ? [] : [comboId(c, i)]));
    if (!sameKeySet(next.keys, current.keys)) {
      next = { ...next, id: freeComboId(next.keys, others) };
    }

    if (sameValue(next, current)) return same(layout);
    const out: Layout = { ...layout, combos: combos.map((c, i) => (i === edit.combo ? next : c)) };
    // A new output can bring a producer whose id another combo's already has (an imported `old`
    // beside an `old#shifted`); a path naming it would then name both, so that is refused.
    const shared = sharedProducerIds(out, edit.combo).filter(
      (id) => !sharedProducerIds(layout, edit.combo).includes(id),
    );
    if (shared.length > 0) {
      return {
        refused: `${shared[0]} would name an output of another combo too. Give that combo another id first.`,
      };
    }
    // Twins under one id (older saved layouts) are told apart by the symbol a path is for; one both
    // make is left to whichever the resolver reads it as.
    if (layout.typingPaths) {
      const paths = followCombo(layout, out, edit.combo);
      if (paths !== layout.typingPaths) out.typingPaths = paths;
    }
    return { layout: out };
  },

  setBehavior(layout, { name, binding }) {
    return withBehaviors(layout, { ...(layout.behaviors ?? {}), [name]: binding });
  },

  replaceBehaviors(layout, { json }) {
    const parsed = parseJson(json);
    if (!parsed.ok) return parsed;
    const value = parsed.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { refused: 'behaviors must be an object' };
    }
    return withBehaviors(layout, value as Record<string, Binding>);
  },

  setTypingPath(layout, { symbol, entries }) {
    const typingPaths = { ...(layout.typingPaths ?? {}), [symbol]: entries };
    return { layout: { ...layout, typingPaths } };
  },

  setKeys(layout, edit) {
    const keys = { ...layout.keys };
    if (edit.space) keys.space = edit.space;
    if (edit.shift !== undefined) {
      keys.shift = edit.shift
        ? { key: edit.shift, kind: edit.shiftKind ?? keys.shift?.kind ?? 'sk' }
        : undefined;
    } else if (edit.shiftKind && keys.shift) {
      keys.shift = { ...keys.shift, kind: edit.shiftKind };
    }
    const repeatPolicy = edit.repeat ? { doubledLetters: edit.repeat } : layout.repeatPolicy;
    return { layout: { ...layout, keys, repeatPolicy } };
  },

  setMeta(layout, edit) {
    const link = edit.link === undefined ? undefined : edit.link.trim();
    if (link && !isLayoutLink(link)) return { refused: NOT_A_LINK };
    const unchanged =
      (edit.name === undefined || edit.name === layout.name) &&
      (edit.author === undefined || edit.author === layout.author) &&
      (edit.description === undefined || edit.description === layout.description) &&
      (link === undefined || (link || undefined) === layout.link) &&
      (edit.languages === undefined || sameValue(edit.languages, layout.languages));
    // Nothing to change changes nothing: no unsaved layout, no step to undo.
    if (unchanged) return same(layout);
    const next: Layout = {
      ...layout,
      name: edit.name ?? layout.name,
      author: edit.author ?? layout.author,
      description: edit.description ?? layout.description,
      languages: edit.languages ?? layout.languages,
    };
    if (link) next.link = link;
    else if (link === '') delete next.link;
    return { layout: next };
  },

  setFeatures(layout, { features }) {
    const next = { ...layout };
    if (Object.values(features).some((v) => v !== undefined)) next.features = features;
    else delete next.features;
    return { layout: next };
  },

  replaceLayout(_layout, { json }) {
    const parsed = parseJson(json);
    if (!parsed.ok) return parsed;
    const layout = safeParseLayout(parsed.value);
    if (!layout.ok) return { refused: layout.error };
    return { layout: layout.layout, at: { keys: [] } };
  },
};

/**
 * Make one edit. It never throws: what the edit itself rules out is refused first, with its reason,
 * and then a result that does not compile is refused with the compile error, so a layout that
 * lands can always be drawn. The layout given is never changed.
 */
export function applyEdit(layout: Layout, edit: Edit): EditOutcome {
  const handle = handlers[edit.kind] as (layout: Layout, edit: Edit) => Step;
  const step = handle(layout, edit);
  if ('refused' in step) return { edit, before: layout, status: 'refused', message: step.refused };
  if (step.layout === layout) return { edit, before: layout, status: 'unchanged' };
  let compiled: CompiledLayout;
  try {
    compiled = compileLayout(step.layout);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { edit, before: layout, status: 'refused', message };
  }
  return {
    edit,
    before: layout,
    status: 'landed',
    layout: step.layout,
    compiled,
    at: step.at ?? {},
  };
}
