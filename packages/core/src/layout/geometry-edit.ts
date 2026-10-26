import { GEOMETRY_PRESET_IDS, getGeometryPreset } from '../geometry/presets.js';
import type { GeometryKey } from '../geometry/types.js';
import { buildGeometry } from './compile.js';
import type { GeometryRef, Layout } from './types.js';

/** Whether a binding does something: Transparent and None do not, wherever they stand. */
const idle = (b: { kind: string }) => b.kind === 'trans' || b.kind === 'none';

/**
 * The keys the layout uses, by what uses them, which is why they stay when the board changes: a
 * binding that does something on any layer, a combo, the space key, the shift key, or a feature's
 * key. A key that is Transparent or None on every layer, and nothing else uses, is free to go.
 */
export function keysInUse(layout: Layout): Map<string, string> {
  const used = new Map<string, string>();
  const use = (key: string | undefined, why: string) => {
    if (key !== undefined && !used.has(key)) used.set(key, why);
  };
  for (const layer of layout.layers) {
    for (const [key, binding] of Object.entries(layer.bindings)) {
      if (key !== '*' && !idle(binding)) use(key, `it does something on ${layer.name ?? layer.id}`);
    }
  }
  // A layer whose default does something gives it to every key it does not list as idle.
  const board = buildGeometry({ ...layout, fingering: undefined }).keys;
  for (const layer of layout.layers) {
    const fallback = layer.bindings['*'];
    if (!fallback || idle(fallback)) continue;
    for (const { id } of board) {
      const own = layer.bindings[id];
      if (!own || !idle(own)) use(id, `${layer.name ?? layer.id} gives it what it does by default`);
    }
  }
  // An activator names the key that reaches a layer.
  for (const list of Object.values(layout.activators ?? {})) {
    for (const a of list) {
      const key = /^key:[^/]+\/(.+)$/.exec(a.via)?.[1];
      use(key, 'a layer is reached by it');
    }
  }
  for (const combo of layout.combos ?? [])
    for (const key of combo.keys) use(key, 'a combo uses it');
  use(layout.keys.space, 'it is the space key');
  use(layout.keys.shift?.key, 'it is the shift key');
  use(layout.features?.sentenceCase?.key, 'sentence case is on it');
  use(layout.features?.capsWord?.key, 'caps word is on it');
  if (layout.fingering && typeof layout.fingering === 'object') {
    for (const key of Object.keys(layout.fingering)) use(key, 'it has a finger of its own');
  }
  return used;
}

/** The board's keys, as a custom geometry lists them. */
export function boardKeys(layout: Layout): GeometryKey[] {
  return buildGeometry({ ...layout, fingering: undefined }).keys.map((k) => ({ ...k }));
}

/**
 * Keys the board does not have but a preset of its kind does, where that preset puts them: the
 * places a key can be added.
 */
export function addableKeys(layout: Layout): GeometryKey[] {
  const board = buildGeometry({ ...layout, fingering: undefined });
  const have = new Set(board.keys.map((k) => k.id));
  const offsets =
    'preset' in layout.geometry
      ? Object.fromEntries(
          Object.entries(layout.geometry.columnOffsets ?? {}).map(([k, v]) => [Number(k), v]),
        )
      : undefined;
  const found = new Map<string, GeometryKey>();
  for (const id of GEOMETRY_PRESET_IDS) {
    const preset = getGeometryPreset(id, offsets);
    if (preset.family !== board.family) continue;
    for (const key of preset.keys)
      if (!have.has(key.id) && !found.has(key.id)) found.set(key.id, key);
  }
  // A board that was edited keeps its stagger in the keys: a key added takes its column's.
  if (!('preset' in layout.geometry)) {
    for (const [id, key] of found) {
      const mate = board.keys.find(
        (k) => k.hand === key.hand && k.col === key.col && k.row < 3 && key.row < 3,
      );
      if (mate) found.set(id, { ...key, y: mate.y - mate.row + key.row });
    }
  }
  return [...found.values()];
}

/** The preset whose keys are these, with the stagger they were drawn with, or null. */
function presetOf(keys: GeometryKey[], layout: Layout): GeometryRef | null {
  const offsets = 'preset' in layout.geometry ? layout.geometry.columnOffsets : undefined;
  const numeric = offsets
    ? Object.fromEntries(Object.entries(offsets).map(([k, v]) => [Number(k), v]))
    : undefined;
  for (const id of GEOMETRY_PRESET_IDS) {
    const preset = getGeometryPreset(id, numeric);
    if (preset.keys.length !== keys.length) continue;
    const at = new Map(preset.keys.map((k) => [k.id, k]));
    const same = keys.every((k) => {
      const p = at.get(k.id);
      return p && p.x === k.x && p.y === k.y && p.w === k.w && p.h === k.h;
    });
    if (same) return offsets ? { preset: id, columnOffsets: offsets } : { preset: id };
  }
  return null;
}

/** The layout's board with keys added, then keys taken away, as a geometry to set. */
export function geometryWithKeys(
  layout: Layout,
  change: { add?: GeometryKey[]; remove?: string[] },
): GeometryRef {
  const gone = new Set(change.remove ?? []);
  const keys = [...boardKeys(layout), ...(change.add ?? [])].filter((k) => !gone.has(k.id));
  // The keys of a preset are that preset, so a key taken away and put back is the board it was.
  const preset = presetOf(keys, layout);
  if (preset) return preset;
  const name = 'custom' in layout.geometry ? layout.geometry.name : undefined;
  const family = buildGeometry(layout).family;
  return { custom: keys, family, ...(name === undefined ? {} : { name }) };
}
