import { slugWords, unusedId } from '../storage/ids.js';
import { buildGeometry, type CompiledLayout, compileLayout } from './compile.js';
import {
  copyKey,
  duplicateLayer,
  layerReachedFrom,
  moveLayer,
  removeLayer,
  sendKeyToLayer,
  setKeyBinding,
  swapKeys,
} from './ops.js';
import { safeParseLayout } from './schema.js';
import type { Binding, LayerColor, Layout, LayoutFeatures, TypingPathEntry } from './types.js';

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

/** Whether two lists of keys name the same keys, in any order. */
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
    const taken = new Set((layout.combos ?? []).map((c) => c.id));
    const id = unusedId(slugWords(keys.join('-')) || 'combo', taken);
    const combo = { id, keys, binding, layers: [layer], role, timeoutMs: 50, slowRelease: false };
    return { layout: { ...layout, combos: [...(layout.combos ?? []), combo] } };
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

    if (edit.binding) next.binding = edit.binding;
    if (edit.role) next.role = edit.role;
    if (edit.timeoutMs !== undefined) {
      if (!(edit.timeoutMs > 0)) return { refused: 'a combo timeout is a positive number of ms' };
      next.timeoutMs = edit.timeoutMs;
    }

    // The id names the keys, so it follows them when they are others, and what a typing path says
    // about the combo follows the id.
    const sameKeys = sameKeySet(next.keys, current.keys);
    const typingPaths = layout.typingPaths;
    let renamedPaths = typingPaths;
    if (!sameKeys) {
      const taken = new Set(combos.filter((_, i) => i !== edit.combo).map((c) => c.id));
      next = { ...next, id: unusedId(slugWords(next.keys.join('-')) || 'combo', taken) };
      // Twins under one id (older saved layouts) are told apart only by place, so a path naming
      // that id is left to whichever the resolver reads it as; only a combo's own id is followed.
      const owned = !combos.some((c, i) => i !== edit.combo && c.id === current.id);
      if (typingPaths && owned && next.id !== current.id) {
        const from = `combo:${current.id}`;
        const rewrite = (producer: string) =>
          producer === from || producer.startsWith(`${from}#`)
            ? `combo:${next.id}${producer.slice(from.length)}`
            : producer;
        renamedPaths = Object.fromEntries(
          Object.entries(typingPaths).map(([symbol, entries]) => [
            symbol,
            entries.map((e) => ({ ...e, producer: rewrite(e.producer) })),
          ]),
        );
      }
    }

    if (sameValue(next, current) && renamedPaths === typingPaths) return same(layout);
    const out: Layout = { ...layout, combos: combos.map((c, i) => (i === edit.combo ? next : c)) };
    if (renamedPaths) out.typingPaths = renamedPaths;
    return { layout: out };
  },

  setBehavior(layout, { name, binding }) {
    return { layout: { ...layout, behaviors: { ...(layout.behaviors ?? {}), [name]: binding } } };
  },

  replaceBehaviors(layout, { json }) {
    const parsed = parseJson(json);
    if (!parsed.ok) return parsed;
    const value = parsed.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { refused: 'behaviors must be an object' };
    }
    return { layout: { ...layout, behaviors: value as Record<string, Binding> } };
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
    return {
      layout: {
        ...layout,
        name: edit.name ?? layout.name,
        author: edit.author ?? layout.author,
        description: edit.description ?? layout.description,
        languages: edit.languages ?? layout.languages,
      },
    };
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
