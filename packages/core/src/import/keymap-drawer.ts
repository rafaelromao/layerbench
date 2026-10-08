import {
  columnFinger,
  GEOMETRY_PRESET_IDS,
  getGeometryPreset,
  keyId,
} from '../geometry/presets.js';
import type { GeometryFamily, GeometryKey, Hand, Row } from '../geometry/types.js';
import { parseKeycode, translateKeycode } from '../host/locale.js';
import { BADGE } from '../layout/labels.js';
import type { Binding, ComboDef, GeometryRef, LayerDef, Layout, Mod } from '../layout/types.js';
import { slug } from '../storage/ids.js';
import { parseYaml } from './yaml.js';

/**
 * keymap-drawer (https://github.com/caksoylar/keymap-drawer, MIT) describes a keymap as the
 * legends drawn on each key, layer by layer, over a physical layout. This reads that description
 * into a layout, and writes one back.
 *
 * A legend is what a key shows, not what it does, so reading one is interpretation: `A` is the
 * letter, `LSHFT` with `sticky` underneath is a one-shot shift, a layer's name is a key that
 * reaches it. Whatever cannot be read as something the simulator models — Bluetooth, media, a
 * firmware behaviour it has no model of — is kept as an imported key with its legend, so nothing
 * on the board is lost and every key can still be selected and replaced.
 */

export class KeymapDrawerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeymapDrawerError';
  }
}

/** One key's legends, keymap-drawer's `LayoutKey`. */
export interface KdKey {
  tap: string;
  hold: string;
  shifted: string;
  left: string;
  right: string;
  tl: string;
  tr: string;
  bl: string;
  br: string;
  type: string;
}

export interface KdCombo {
  positions: number[] | null;
  triggers: KdKey[] | null;
  key: KdKey;
  layers: string[];
}

export interface KdOrtho {
  split: boolean;
  rows: number;
  columns: number;
  thumbs: number | 'MIT' | '2x2u';
  dropPinky: boolean;
  dropInner: boolean;
}

/** The physical layout, as the file names it. */
export type KdLayoutSpec =
  | { kind: 'ortho'; ortho: KdOrtho }
  | { kind: 'cpt'; spec: string }
  | {
      kind: 'named';
      source: 'qmk_keyboard' | 'zmk_keyboard' | 'qmk_info_json' | 'dts_layout';
      name: string;
      layoutName?: string;
    }
  | { kind: 'none' };

export interface KdDocument {
  layout: KdLayoutSpec;
  layers: { name: string; keys: KdKey[] }[];
  combos: KdCombo[];
}

// ------------------------------------------------------------------ reading the file

const EMPTY_KEY: KdKey = {
  tap: '',
  hold: '',
  shifted: '',
  left: '',
  right: '',
  tl: '',
  tr: '',
  bl: '',
  br: '',
  type: '',
};

const text = (v: unknown): string =>
  v === null || v === undefined ? '' : typeof v === 'string' ? v : String(v);

/** keymap-drawer's `LayoutKey.from_key_spec`: a string or number is the tap, null is empty. */
function readKey(spec: unknown): KdKey {
  if (spec === null || spec === undefined) return { ...EMPTY_KEY };
  if (typeof spec !== 'object' || Array.isArray(spec)) return { ...EMPTY_KEY, tap: text(spec) };
  const o = spec as Record<string, unknown>;
  return {
    tap: text(o.t ?? o.tap ?? o.center),
    hold: text(o.h ?? o.hold ?? o.bottom),
    shifted: text(o.s ?? o.shifted ?? o.top),
    left: text(o.left),
    right: text(o.right),
    tl: text(o.tl),
    tr: text(o.tr),
    bl: text(o.bl),
    br: text(o.br),
    type: text(o.type),
  };
}

/** A layer may be written flat or as rows; either way it is the keys in order. */
function flatten(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [value];
  return value.flatMap((v) => (Array.isArray(v) ? v : [v]));
}

/**
 * More keys than any keyboard has. A file is the user's own, but a mistyped or hostile one must
 * not have the tab build a board of a billion keys before anything else is checked.
 */
export const MAX_KEYS = 10_000;

function readOrtho(o: Record<string, unknown>): KdOrtho {
  const rows = Number(o.rows);
  const columns = Number(o.columns);
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || columns < 1) {
    throw new KeymapDrawerError('ortho_layout needs whole numbers of rows and columns');
  }
  if (rows * columns > MAX_KEYS) {
    throw new KeymapDrawerError(`ortho_layout has more than ${MAX_KEYS} keys`);
  }
  const thumbs = o.thumbs ?? 0;
  if (!(thumbs === 'MIT' || thumbs === '2x2u' || Number.isInteger(thumbs))) {
    throw new KeymapDrawerError('ortho_layout thumbs is a number, MIT or 2x2u');
  }
  return {
    split: o.split === true,
    rows,
    columns,
    thumbs: thumbs as KdOrtho['thumbs'],
    dropPinky: o.drop_pinky === true,
    dropInner: o.drop_inner === true,
  };
}

function readLayout(value: unknown): KdLayoutSpec {
  if (value === null || value === undefined) return { kind: 'none' };
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new KeymapDrawerError('`layout` must be a mapping');
  }
  const o = value as Record<string, unknown>;
  if (o.ortho_layout && typeof o.ortho_layout === 'object') {
    return { kind: 'ortho', ortho: readOrtho(o.ortho_layout as Record<string, unknown>) };
  }
  if (typeof o.cols_thumbs_notation === 'string') {
    return { kind: 'cpt', spec: o.cols_thumbs_notation };
  }
  for (const source of ['qmk_keyboard', 'zmk_keyboard', 'qmk_info_json', 'dts_layout'] as const) {
    if (typeof o[source] === 'string') {
      const layoutName = typeof o.layout_name === 'string' ? o.layout_name : undefined;
      return { kind: 'named', source, name: o[source] as string, layoutName };
    }
  }
  return { kind: 'none' };
}

/** Read a keymap-drawer YAML file. Throws a `KeymapDrawerError` or `YamlError` saying what is wrong. */
export function readKeymapDrawer(source: string): KdDocument {
  const doc = parseYaml(source);
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new KeymapDrawerError(
      'not a keymap-drawer file: expected `layout`, `layers` and `combos`',
    );
  }
  const o = doc as Record<string, unknown>;
  if (!o.layers || typeof o.layers !== 'object' || Array.isArray(o.layers)) {
    throw new KeymapDrawerError('not a keymap-drawer file: there is no `layers` mapping');
  }
  const layers: KdDocument['layers'] = [];
  let total = 0;
  for (const [name, keys] of Object.entries(o.layers as Record<string, unknown>)) {
    const flat = flatten(keys);
    // Aliases let a few lines of YAML stand for any number of keys; the count is what matters.
    total += flat.length;
    if (total > MAX_KEYS) throw new KeymapDrawerError(`the layers have more than ${MAX_KEYS} keys`);
    layers.push({ name, keys: flat.map(readKey) });
  }
  if (layers.length === 0) throw new KeymapDrawerError('the file has no layers');
  const combos: KdCombo[] = [];
  for (const c of Array.isArray(o.combos) ? o.combos : []) {
    if (!c || typeof c !== 'object') continue;
    const co = c as Record<string, unknown>;
    const p = co.p ?? co.key_positions;
    const tk = co.tk ?? co.trigger_keys;
    const l = co.l ?? co.layers;
    combos.push({
      positions: Array.isArray(p) ? p.map((n) => Number(n)) : null,
      triggers: Array.isArray(tk) ? tk.map(readKey) : null,
      key: readKey(co.k ?? co.key),
      layers: Array.isArray(l) ? l.map(text) : [],
    });
  }
  return { layout: readLayout(o.layout), layers, combos };
}

// ------------------------------------------------------------------ physical layouts

/** A key of a physical layout, in keymap-drawer's order, with its centre in key units. */
export interface PhysicalKey {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  /** Which half of a split board it belongs to, when the layout says. */
  part: number | null;
  /** Whether it is a thumb key, when the layout says. */
  thumb: boolean | null;
}

const SPLIT_GAP = 1;

/** keymap-drawer's `OrthoLayout.generate`, with keys a unit wide and a unit apart. */
export function orthoKeys(o: KdOrtho): PhysicalKey[] {
  const special = typeof o.thumbs !== 'number';
  const nrows = special ? o.rows - 1 : o.rows;
  const ncols = o.columns;
  const key = (x: number, y: number, part: number | null, thumb: boolean, w = 1): PhysicalKey => ({
    x: x + w / 2,
    y: y + 0.5,
    w,
    h: 1,
    r: 0,
    part,
    thumb,
  });
  const row = (x: number, y: number, n: number, part: number | null, thumb: boolean) =>
    Array.from({ length: n }, (_, i) => key(x + i, y, part, thumb));

  const keys: PhysicalKey[] = [];
  for (let r = 0; r < nrows; r++) {
    const rowKeys = row(0, r, ncols, o.split ? 0 : null, false);
    if (o.split) rowKeys.push(...row(ncols + SPLIT_GAP, r, ncols, 1, false));
    const half = Math.floor(rowKeys.length / 2);
    const drop = [...(o.dropPinky ? [0, -1] : []), ...(o.dropInner ? [half - 1, half] : [])];
    for (const c of [...drop].reverse()) {
      const at = c < 0 ? rowKeys.length + c : c;
      if (r < nrows - 1) rowKeys[at] = { ...rowKeys[at], y: rowKeys[at].y + 0.5 };
      else rowKeys.splice(at, 1);
    }
    keys.push(...rowKeys);
  }
  if (!o.thumbs) return keys;
  const y = nrows;
  if (typeof o.thumbs === 'number') {
    keys.push(...row(ncols - o.thumbs, y, o.thumbs, o.split ? 0 : null, true));
    keys.push(...row(ncols + SPLIT_GAP, y, o.thumbs, o.split ? 1 : null, true));
  } else if (o.thumbs === 'MIT') {
    const side = Math.floor(ncols / 2) - 1;
    keys.push(...row(0, y, side, null, true));
    keys.push(key(ncols / 2 - 1, y, null, true, 2));
    keys.push(...row(ncols / 2 + 1, y, side, null, true));
  } else {
    const side = Math.floor(ncols / 2) - 2;
    keys.push(...row(0, y, side, null, true));
    keys.push(key(ncols / 2 - 2, y, null, true, 2));
    keys.push(key(ncols / 2, y, null, true, 2));
    keys.push(...row(ncols / 2 + 2, y, side, null, true));
  }
  return keys;
}

const CPT_COL = /\d[v^ud]*/g;
const CPT_PART =
  /^(?:(?<al>(?:\d[v^ud]*){2,})(?:\+(?<tl>\d[><lr]*))?|(?:(?<tr>\d[><lr]*)\+)?(?<ar>(?:\d[v^ud]*){2,}))$/;

function count(s: string, chars: string): number {
  let n = 0;
  for (const c of s.slice(1)) if (chars.includes(c)) n++;
  return n;
}

/** keymap-drawer's `CPTLayout.generate`: `33333+2 2+33333` and the like. */
export function cptKeys(spec: string): PhysicalKey[] {
  const parts = spec.split(/[ _]+/).filter(Boolean);
  const matches = parts.map((p) => CPT_PART.exec(p)?.groups);
  if (parts.length === 0 || matches.some((m) => m === undefined)) {
    throw new KeymapDrawerError(
      `cols_thumbs_notation "${spec}" does not read as columns and thumbs`,
    );
  }
  const groups = matches as Record<string, string | undefined>[];
  const maxRows = Math.max(
    ...groups.flatMap((g) => [...(g.al ?? g.ar ?? '')].filter((c) => /\d/.test(c)).map(Number)),
  );
  type Pt = { x: number; y: number; thumb: boolean };
  const placed: { key: Pt; part: number }[] = [];
  let offset = 0;
  const offsets: number[] = [];
  groups.forEach((g, part) => {
    const cols = (g.al ?? g.ar ?? '').match(CPT_COL) ?? [];
    const keys: Pt[] = [];
    cols.forEach((c, x) => {
      const n = Number(c[0]);
      const shift = count(c, 'vd') - count(c, '^u');
      const top = (maxRows - n + shift) / 2;
      for (let i = 0; i < n; i++) keys.push({ x, y: top + i, thumb: false });
    });
    const t = g.tl ?? g.tr;
    if (t) {
      const n = Number(t[0]);
      const shift = count(t, '>r') - count(t, '<l');
      const left = (g.tl !== undefined ? cols.length - n : 0) + shift / 2;
      for (let i = 0; i < n; i++) keys.push({ x: left + i, y: maxRows, thumb: true });
    }
    const minX = Math.min(...keys.map((k) => k.x));
    const minY = Math.min(...keys.map((k) => k.y));
    const shifted = keys.map((k) => ({ ...k, x: k.x - minX, y: k.y - minY }));
    offsets.push(offset);
    offset += Math.max(...shifted.map((k) => k.x)) + 1;
    for (const key of shifted) placed.push({ key, part });
  });
  placed.sort(
    (a, b) =>
      Math.trunc(a.key.y) - Math.trunc(b.key.y) ||
      a.part - b.part ||
      Math.trunc(a.key.x) - Math.trunc(b.key.x),
  );
  const split = groups.length > 1;
  return placed.map(({ key, part }) => ({
    x: key.x + 0.5 + offsets[part] + part * SPLIT_GAP,
    y: key.y + 0.5,
    w: 1,
    h: 1,
    r: 0,
    part: split ? part : null,
    thumb: key.thumb,
  }));
}

/** A QMK `info.json`: the keys of one of its layouts, in the order the file lists them. */
export function qmkInfoKeys(
  info: unknown,
  layoutName?: string,
): { keys: PhysicalKey[]; name: string } {
  const layouts = (info as { layouts?: Record<string, { layout?: unknown[] }> } | null)?.layouts;
  if (!layouts || typeof layouts !== 'object') {
    throw new KeymapDrawerError('not a QMK info.json: it has no `layouts`');
  }
  const names = Object.keys(layouts);
  const name = layoutName && layouts[layoutName] ? layoutName : names[0];
  const list = layouts[name]?.layout;
  if (!Array.isArray(list) || list.length === 0) {
    throw new KeymapDrawerError(`layout ${name} in the info.json has no keys`);
  }
  const keys = list.map((k) => {
    const o = k as Record<string, number | undefined>;
    const w = o.w ?? 1;
    const h = o.h ?? 1;
    let x = (o.x ?? 0) + w / 2;
    let y = (o.y ?? 0) + h / 2;
    const r = o.r ?? 0;
    if (r !== 0) {
      const rx = o.rx ?? o.x ?? 0;
      const ry = o.ry ?? o.y ?? 0;
      const a = (r * Math.PI) / 180;
      const dx = x - rx;
      const dy = y - ry;
      x = rx + dx * Math.cos(a) - dy * Math.sin(a);
      y = ry + dx * Math.sin(a) + dy * Math.cos(a);
    }
    return { x, y, w, h, r, part: null, thumb: null };
  });
  return { keys, name };
}

// ------------------------------------------------------------------ placing keys on the model

export interface Placement {
  hand: Hand;
  row: Row;
  col: number;
}

/** Columns a hand of `n` columns occupies, outermost first, in the model's numbering. */
const FIRST_COLUMN: Record<number, number> = { 1: 4, 2: 3, 3: 2, 4: 1, 5: 1, 6: 0 };

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * Put each physical key on the model's grid: a hand, one of three rows or the thumb row, and a
 * column counted from the outer pinky. Keys the model has no place for — a fourth row, a seventh
 * column — come back as null, so the caller can say which were left out.
 */
export function placeKeys(keys: PhysicalKey[]): {
  placed: (Placement | null)[];
  dropped: number[];
} {
  const hands: Hand[] = new Array(keys.length);
  const parts = new Set(keys.map((k) => k.part));
  if (parts.size === 2 && !parts.has(null)) {
    keys.forEach((k, i) => {
      hands[i] = k.part === 0 ? 'L' : 'R';
    });
  } else {
    const xs = [...new Set(keys.map((k) => k.x))].sort((a, b) => a - b);
    let cut = (xs[0] + xs[xs.length - 1]) / 2;
    let widest = 0;
    for (let i = 1; i < xs.length; i++) {
      if (xs[i] - xs[i - 1] > widest) {
        widest = xs[i] - xs[i - 1];
        if (widest >= 1.5) cut = (xs[i] + xs[i - 1]) / 2;
      }
    }
    keys.forEach((k, i) => {
      hands[i] = k.x < cut ? 'L' : 'R';
    });
  }

  // Thumbs, where the layout does not say: the keys turned more than a few degrees, or the lowest
  // band of a hand when it has fewer keys than the band above it.
  const thumb: boolean[] = keys.map((k) => k.thumb ?? false);
  if (keys.some((k) => k.thumb === null)) {
    for (const hand of ['L', 'R'] as Hand[]) {
      const idx = keys.map((_, i) => i).filter((i) => hands[i] === hand);
      if (idx.length === 0) continue;
      const maxY = Math.max(...idx.map((i) => keys[i].y));
      const bottom = idx.filter((i) => keys[i].y > maxY - 0.75);
      const above = idx.filter((i) => keys[i].y <= maxY - 0.75 && keys[i].y > maxY - 1.75);
      for (const i of idx) if (Math.abs(keys[i].r) >= 5) thumb[i] = true;
      if (bottom.length < above.length) for (const i of bottom) thumb[i] = true;
    }
  }

  const placed: (Placement | null)[] = keys.map(() => null);
  const dropped: number[] = [];
  for (const hand of ['L', 'R'] as Hand[]) {
    // Alpha columns, outermost first.
    const alphas = keys.map((_, i) => i).filter((i) => hands[i] === hand && !thumb[i]);
    const byX = [...alphas].sort((a, b) => keys[a].x - keys[b].x);
    const columns: number[][] = [];
    for (const i of byX) {
      const last = columns[columns.length - 1];
      if (last && keys[i].x - keys[last[last.length - 1]].x <= 0.5) last.push(i);
      else columns.push([i]);
    }
    const outerFirst = hand === 'L' ? columns : [...columns].reverse();
    const kept = outerFirst.slice(Math.max(0, outerFirst.length - 6));
    for (const col of outerFirst.slice(0, outerFirst.length - kept.length)) dropped.push(...col);
    const first = FIRST_COLUMN[kept.length] ?? 0;
    const cols = kept.map((c) => [...c].sort((a, b) => keys[a].y - keys[b].y));
    // A column taller than three keeps its bottom three: the extra is a number row.
    for (const c of cols) if (c.length > 3) dropped.push(...c.splice(0, c.length - 3));
    const full = Math.max(0, ...cols.map((c) => c.length));
    const ref: number[] = [];
    if (full >= 2) {
      const tall = cols.filter((c) => c.length === full);
      for (let r = 0; r < full; r++) ref.push(median(tall.map((c) => keys[c[r]].y)));
      while (ref.length < 3) ref.push(ref[ref.length - 1] + 1);
    } else if (full === 1) {
      const y = median(cols.map((c) => keys[c[0]].y));
      ref.push(y - 1, y, y + 1);
    }
    cols.forEach((c, k) => {
      let best = 0;
      let bestCost = Number.POSITIVE_INFINITY;
      for (let s = 0; s + c.length <= 3; s++) {
        const cost = c.reduce((sum, i, j) => sum + Math.abs(keys[i].y - ref[s + j]), 0);
        if (cost < bestCost - 1e-9) {
          best = s;
          bestCost = cost;
        }
      }
      // A board no taller than two keys is its top and home rows, as the 18-key preset has it.
      if (full === 1) best = 1;
      c.forEach((i, j) => {
        placed[i] = { hand, row: (best + j) as Row, col: first + k };
      });
    });

    // Thumbs, innermost first.
    const thumbs = keys.map((_, i) => i).filter((i) => hands[i] === hand && thumb[i]);
    thumbs.sort((a, b) => (hand === 'L' ? keys[b].x - keys[a].x : keys[a].x - keys[b].x));
    thumbs.forEach((i, j) => {
      if (j < 6) placed[i] = { hand, row: 3, col: j };
      else dropped.push(i);
    });
  }
  return { placed, dropped: dropped.sort((a, b) => a - b) };
}

/** The board a file is imported onto, and the model's key id for each of its positions. */
export interface ResolvedBoard {
  geometry: GeometryRef;
  /** For each keymap-drawer position, the key it lands on, or null where the board has none. */
  ids: (string | null)[];
  description: string;
}

/**
 * The keys of a board grouped by column — each hand's alpha columns top to bottom, and its thumbs —
 * which is what two boards must share to be the same board, whatever rows their short columns sit
 * on. A two-key column drawn half a key down is on the top two rows to keymap-drawer and may be on
 * the lower two in a preset; either way its upper key is the upper key.
 */
function columnsOf<T extends { hand: Hand; row: Row; col: number }>(keys: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const k of keys) {
    const g = `${k.hand}${k.row === 3 ? 'T' : 'A'}${k.col}`;
    groups.set(g, [...(groups.get(g) ?? []), k]);
  }
  for (const list of groups.values()) list.sort((a, b) => a.row - b.row);
  return groups;
}

/** The preset a set of placed keys is, and the preset key each lands on — or null. */
function matchPreset(
  placed: (Placement | null)[],
  only?: string,
): { presetId: string; ids: (string | null)[] } | null {
  const present = placed
    .map((p, i) => (p ? { ...p, i } : null))
    .filter((p): p is Placement & { i: number } => p !== null);
  const mine = columnsOf(present);
  for (const presetId of only ? [only] : GEOMETRY_PRESET_IDS) {
    const g = getGeometryPreset(presetId);
    if (g.family !== 'columnar') continue;
    const theirs = columnsOf(g.keys);
    if (theirs.size !== mine.size) continue;
    let same = true;
    for (const [group, list] of mine) {
      if ((theirs.get(group)?.length ?? -1) !== list.length) same = false;
    }
    if (!same) continue;
    const ids: (string | null)[] = placed.map(() => null);
    for (const [group, list] of mine) {
      const target = theirs.get(group) as GeometryKey[];
      list.forEach((k, j) => {
        ids[k.i] = target[j].id;
      });
    }
    return { presetId, ids };
  }
  return null;
}

/**
 * The board for a physical layout: a preset when the keys are one of the presets' — so an import
 * gets the preset's drawing and every analysis tuned for it — and otherwise a board of its own,
 * drawn from the file's positions.
 */
export function boardFromKeys(keys: PhysicalKey[], name: string): ResolvedBoard {
  const { placed, dropped } = placeKeys(keys);
  const note = dropped.length > 0 ? `; ${dropped.length} keys the model has no place for` : '';
  const preset = matchPreset(placed);
  if (preset) {
    return {
      geometry: { preset: preset.presetId },
      ids: preset.ids,
      description: `${getGeometryPreset(preset.presetId).name}${note}`,
    };
  }
  const ids = placed.map((p) => (p ? keyId(p.hand, p.row, p.col) : null));
  const minX = Math.min(...keys.map((k) => k.x));
  const minY = Math.min(...keys.map((k) => k.y));
  const custom: GeometryKey[] = [];
  placed.forEach((p, i) => {
    if (!p) return;
    const k = keys[i];
    custom.push({
      id: keyId(p.hand, p.row, p.col),
      hand: p.hand,
      finger: p.row === 3 ? (p.hand === 'L' ? 'LT' : 'RT') : columnFinger(p.hand, p.col),
      row: p.row,
      col: p.col,
      x: Math.round((k.x - minX) * 100) / 100,
      y: Math.round((k.y - minY) * 100) / 100,
      w: k.w,
      h: k.h,
      rotation: k.r,
      home: p.row === 1,
      thumb: p.row === 3,
      inner: p.col === 5 && p.row !== 3,
    });
  });
  return {
    geometry: { custom, family: 'columnar', name },
    ids,
    description: `a board of its own, ${custom.length} keys${note}`,
  };
}

/**
 * A preset in cols+thumbs notation with its short columns centred — how someone describing the
 * keyboard to keymap-drawer would write it, and so the order keymap-drawer would list its keys in.
 */
function centredNotation(presetId: string): string {
  const g = getGeometryPreset(presetId);
  const counts = (hand: Hand) => {
    const cols = new Map<number, number>();
    for (const k of g.keys)
      if (k.hand === hand && k.row !== 3) cols.set(k.col, (cols.get(k.col) ?? 0) + 1);
    const order = [...cols.keys()].sort((a, b) => (hand === 'L' ? a - b : b - a));
    return order.map((c) => cols.get(c)).join('');
  };
  const thumbs = (hand: Hand) => g.keys.filter((k) => k.hand === hand && k.row === 3).length;
  const l = counts('L') + (thumbs('L') ? `+${thumbs('L')}` : '');
  const r = (thumbs('R') ? `${thumbs('R')}+` : '') + counts('R');
  return `${l} ${r}`;
}

/** A preset's keys in the order keymap-drawer lists a keyboard of that shape. */
export function presetOrder(presetId: string): string[] {
  const placed = placeKeys(cptKeys(centredNotation(presetId))).placed;
  return (matchPreset(placed, presetId)?.ids ?? []).filter((id): id is string => id !== null);
}

/**
 * Presets with this many keys, for a board the file only names. Only the columnar ones: the
 * row-staggered presets draw one space bar as two keys, so no keyboard's key count is theirs.
 */
export function presetsWithKeys(n: number): string[] {
  return GEOMETRY_PRESET_IDS.filter((id) => {
    const g = getGeometryPreset(id);
    return g.family === 'columnar' && g.keys.length === n;
  });
}

/** The board for a preset, laid over a file that only names its keyboard. */
export function boardFromPreset(presetId: string, positions: number): ResolvedBoard {
  const order = presetOrder(presetId);
  const g = getGeometryPreset(presetId);
  const ids = Array.from({ length: positions }, (_, i) => order[i] ?? null);
  const extra = positions - order.length;
  const note =
    extra > 0
      ? `; the last ${extra} positions have no key on it`
      : extra < 0
        ? `; ${-extra} of its keys get nothing from the file`
        : '';
  return { geometry: { preset: presetId }, ids, description: `${g.name}${note}` };
}

// ------------------------------------------------------------------ legends to bindings

const MOD_NAMES: Record<string, Mod> = {
  LSHFT: 'LSHIFT',
  LSHIFT: 'LSHIFT',
  LSFT: 'LSHIFT',
  LEFT_SHIFT: 'LSHIFT',
  SHIFT: 'LSHIFT',
  SHFT: 'LSHIFT',
  '⇧': 'LSHIFT',
  RSHFT: 'RSHIFT',
  RSHIFT: 'RSHIFT',
  RSFT: 'RSHIFT',
  RIGHT_SHIFT: 'RSHIFT',
  LCTRL: 'LCTRL',
  LCTL: 'LCTRL',
  LEFT_CONTROL: 'LCTRL',
  CTRL: 'LCTRL',
  CTL: 'LCTRL',
  CONTROL: 'LCTRL',
  '⌃': 'LCTRL',
  RCTRL: 'RCTRL',
  RCTL: 'RCTRL',
  RIGHT_CONTROL: 'RCTRL',
  LALT: 'LALT',
  LEFT_ALT: 'LALT',
  ALT: 'LALT',
  LOPT: 'LALT',
  OPT: 'LALT',
  OPTION: 'LALT',
  '⌥': 'LALT',
  RALT: 'RALT',
  RIGHT_ALT: 'RALT',
  ROPT: 'RALT',
  ALTGR: 'RALT',
  LGUI: 'LGUI',
  LEFT_GUI: 'LGUI',
  GUI: 'LGUI',
  LCMD: 'LGUI',
  CMD: 'LGUI',
  COMMAND: 'LGUI',
  LWIN: 'LGUI',
  WIN: 'LGUI',
  SUPER: 'LGUI',
  META: 'LGUI',
  LMETA: 'LGUI',
  '⌘': 'LGUI',
  RGUI: 'RGUI',
  RIGHT_GUI: 'RGUI',
  RCMD: 'RGUI',
  RWIN: 'RGUI',
};

/** The ZMK spelling written back for each modifier, the one `keymap parse` writes. */
const MOD_LEGEND: Record<Mod, string> = {
  LSHIFT: 'LSHFT',
  RSHIFT: 'RSHFT',
  LCTRL: 'LCTRL',
  RCTRL: 'RCTRL',
  LALT: 'LALT',
  RALT: 'RALT',
  LGUI: 'LGUI',
  RGUI: 'RGUI',
};

/** QMK's short names, for the ZMK ones the host tables know. */
const QMK_NAMES: Record<string, string> = {
  SCLN: 'SEMI',
  QUOT: 'SQT',
  COMM: 'COMMA',
  SLSH: 'FSLH',
  MINS: 'MINUS',
  EQL: 'EQUAL',
  LBRC: 'LBKT',
  RBRC: 'RBKT',
  BSLS: 'BSLH',
  GRV: 'GRAVE',
  SPC: 'SPACE',
};

const SPACE_NAMES = new Set(['␣', '⎵', 'SPACE', 'SPC', 'KC_SPC', 'KC_SPACE']);
const CAPS_WORD_NAMES = new Set(['CAPS_WORD', 'CAPSWORD', 'CAPS WORD', 'CW', 'CAPS_WRD']);
const REPEAT_NAMES = new Set([
  'REPEAT',
  'REP',
  'KEY_REPEAT',
  'REPEAT KEY',
  'RPT',
  'QK_REP',
  '⟳',
  '↻',
]);
const TRANS_LEGENDS = new Set(['▽', '▼', 'TRANS', '_______', 'KC_TRNS']);
const STICKY_WORDS = new Set(['sticky', 'one-shot', 'oneshot', 'one shot', 'os', '1×']);

/**
 * Keys every keyboard has that type no text — editing, navigation, function and lock keys — in
 * the spellings of ZMK's and QMK's keycode lists (https://zmk.dev/docs/keymaps/list-of-keycodes,
 * https://docs.qmk.fm/keycodes_basic), with or without `KC_`, and the glyphs drawings use for them.
 * The simulator does not model them, so they stay imported keys, but they are read, not guessed.
 */
const NAMED_KEY =
  /^(?:KC_)?(?:ESC|ESCAPE|TAB|ENTER|ENT|RET|RETURN|BSPC|BKSP|BACKSPACE|DEL|DELETE|INS|INSERT|HOME|END|PG ?UP|PG_UP|PGUP|PAGE_UP|PG ?DN|PG_DN|PGDN|PAGE_DOWN|LEFT|RIGHT|UP|DOWN|[LRUD]ARW|(?:LEFT|RIGHT|UP|DOWN)_ARROW|CAPS|CAPSLOCK|CAPS_LOCK|CLCK|PSCRN|PSCR|PRINTSCREEN|PRINT_SCREEN|SLCK|SCRL|SCROLLLOCK|SCROLL_LOCK|PAUSE|PAUSE_BREAK|NLCK|NUMLOCK|NUM_LOCK|APP|K_APP|MENU|K_MENU|F(?:[1-9]|1[0-9]|2[0-4]))$/;
const NAMED_KEY_GLYPHS = new Set([
  '←',
  '→',
  '↑',
  '↓',
  '⇥',
  '⏎',
  '↵',
  '⌫',
  '⌦',
  '⎋',
  '⇞',
  '⇟',
  '⇱',
  '⇲',
  '⇪',
]);
/** A shortcut, a key pressed with Control, Alt or Command the way ZMK writes it: `LC(Z)`, `LG(LS(Z))`. */
const SHORTCUT = /^[LR][SCAG]\(.+\)$/;

function isNamedKey(legend: string): boolean {
  const t = legend.trim();
  return NAMED_KEY_GLYPHS.has(t) || NAMED_KEY.test(t.toUpperCase()) || SHORTCUT.test(t);
}

function modOf(legend: string): Mod | undefined {
  return MOD_NAMES[legend] ?? MOD_NAMES[legend.toUpperCase()];
}

/** A legend read as the text a key types, where it is one. */
function symbolOf(legend: string): { symbol: string; shifted?: string } | null {
  const t = legend.trim();
  // An adaptive key or a macro drawn only by its mark says what it is, not what it types.
  if (t === '' || NAMED_KEY_GLYPHS.has(t) || t === BADGE.adaptive || t === BADGE.macro) {
    return null;
  }
  if (SPACE_NAMES.has(t.toUpperCase()) || SPACE_NAMES.has(t)) return { symbol: ' ' };
  const graphemes = [...t];
  if (graphemes.length === 1) {
    // A letter legend is drawn as a capital, the way a keycap is; the key types the letter.
    return /^[A-Z]$/.test(t) ? { symbol: t.toLowerCase() } : { symbol: t };
  }
  let name = t.toUpperCase().replace(/^KC_/, '');
  name = QMK_NAMES[name] ?? name;
  const number = /^(?:NUMBER_|NUM_)?([0-9])$/.exec(name);
  if (number) name = `N${number[1]}`;
  // A chord with Control, Alt or Command is a shortcut, not text.
  if (parseKeycode(name).mods.some((m) => m !== 'LSHIFT' && m !== 'RSHIFT')) return null;
  const plain = translateKeycode('us', name);
  if (!plain || plain.deadKey || plain.symbol === '') return null;
  const shift = translateKeycode('us', name, ['LSHIFT']);
  const shifted = shift && !shift.deadKey ? shift.symbol : undefined;
  return shifted && shifted !== plain.symbol.toUpperCase()
    ? { symbol: plain.symbol, shifted }
    : { symbol: plain.symbol };
}

export interface LegendContext {
  /** Layer names as the file writes them, lower-cased, to the id each got — null if not imported. */
  layers: Map<string, string | null>;
}

export type LegendReading =
  /** Nothing of its own: an upper layer falls through here. */
  { kind: 'transparent' } | { kind: 'binding'; binding: Binding; exact: boolean };

function legendText(k: KdKey): string {
  const parts = [
    k.tap && `t: ${k.tap}`,
    k.hold && `h: ${k.hold}`,
    k.shifted && `s: ${k.shifted}`,
    k.type && `type: ${k.type}`,
  ].filter(Boolean);
  return parts.join(' · ');
}

/** A tap legend as a binding a tap-hold can carry: a key press, a modifier, caps word, repeat. */
function tapBinding(k: KdKey): Binding | null {
  const tap = k.tap.trim();
  if (tap === '') return { kind: 'none' };
  // The mark LayerBench draws in a macro's corner: the legend is the text it types.
  if (k.tr.trim() === BADGE.macro && [...tap].length > 1) return { kind: 'macro', symbols: tap };
  const upper = tap.toUpperCase();
  if (CAPS_WORD_NAMES.has(upper)) return { kind: 'caps_word' };
  if (REPEAT_NAMES.has(upper) || REPEAT_NAMES.has(tap)) return { kind: 'key_repeat' };
  const mod = modOf(tap);
  if (mod) return { kind: 'mod', mod };
  const symbol = symbolOf(tap);
  if (!symbol) return null;
  const shifted = [...k.shifted.trim()].length === 1 ? k.shifted.trim() : symbol.shifted;
  return shifted !== undefined && shifted !== symbol.symbol.toUpperCase()
    ? { kind: 'kp', symbol: symbol.symbol, shifted }
    : { kind: 'kp', symbol: symbol.symbol };
}

/**
 * What a key's legends mean, as far as they say. `exact` is false when the reading is a guess the
 * legends leave open, or when the key is kept as an imported key because nothing better fits.
 */
export function readLegend(k: KdKey, ctx: LegendContext): LegendReading {
  const tap = k.tap.trim();
  const hold = k.hold.trim();
  if (k.type === 'trans' || k.type === 'held' || TRANS_LEGENDS.has(tap.toUpperCase())) {
    return { kind: 'transparent' };
  }
  const raw = (): LegendReading => ({
    kind: 'binding',
    binding: { kind: 'raw', label: tap || hold || '?', source: legendText(k) },
    exact: false,
  });
  if (tap === '' && hold === '') return { kind: 'binding', binding: { kind: 'none' }, exact: true };

  const layerOf = (name: string) => ctx.layers.get(name.toLowerCase());
  const tapLayer = layerOf(tap);
  const holdWord = hold.toLowerCase();
  const exact = (binding: Binding): LegendReading => ({ kind: 'binding', binding, exact: true });

  if (tapLayer === null || layerOf(hold) === null) return raw();
  if (STICKY_WORDS.has(holdWord)) {
    if (tapLayer) return exact({ kind: 'sl', layer: tapLayer });
    const mod = modOf(tap);
    if (mod) return exact({ kind: 'sk', mod });
    return raw();
  }
  if (tapLayer) {
    if (hold === '') return exact({ kind: 'mo', layer: tapLayer });
    if (holdWord === 'toggle') return exact({ kind: 'tog', layer: tapLayer });
    if (holdWord === 'to' || holdWord === 'switch') return exact({ kind: 'to', layer: tapLayer });
    if (holdWord === 'auto') return exact({ kind: 'auto_layer', layer: tapLayer });
  }
  if (hold !== '') {
    const holdLayer = layerOf(hold);
    const holdMod = modOf(hold);
    if (!holdLayer && !holdMod) return raw();
    // A tap that types no text — Escape, Backspace — still leaves the hold, and a layer reached
    // by holding that key must stay reachable.
    const read = tapBinding(k);
    const tapped: Binding = read ?? { kind: 'raw', label: tap, source: `t: ${tap}` };
    const binding: Binding = holdLayer
      ? { kind: 'lt', layer: holdLayer, tap: tapped }
      : { kind: 'hold_tap', tap: tapped, hold: { kind: 'mod', mod: holdMod as Mod } };
    return { kind: 'binding', binding, exact: read !== null || isNamedKey(tap) };
  }
  const tapped = tapBinding(k);
  if (tapped) return exact(tapped);
  if (isNamedKey(tap)) {
    return exact({ kind: 'raw', label: tap, source: legendText(k) });
  }
  // Letters beyond ASCII, several of them, read as text a macro types: `ão`, `ões`. A word in
  // capitals, or in plain ASCII, is far likelier to be a key's name, and is kept as it is.
  if (
    [...tap].length > 1 &&
    /^\p{L}+$/u.test(tap) &&
    /[^\p{ASCII}]/u.test(tap) &&
    tap === tap.toLowerCase()
  ) {
    return exact({ kind: 'macro', symbols: tap });
  }
  return raw();
}

// ------------------------------------------------------------------ the import

export interface ImportedLayer {
  /** The layer's name in the file. */
  source: string;
  name: string;
}

export interface KeymapDrawerImport {
  name: string;
  /** The layers to take, in the order to take them; the first becomes the base layer. */
  layers: ImportedLayer[];
  board: ResolvedBoard;
}

export interface LayerReport {
  name: string;
  keys: number;
  /** Keys whose legends read as something the simulator models. */
  read: number;
  /**
   * Legends it could not read, kept as imported keys as they were drawn. Keys it reads but does
   * not simulate — Escape, an arrow, a shortcut — are imported keys too, but are not listed.
   */
  kept: string[];
}

export interface ImportReport {
  board: string;
  layers: LayerReport[];
  combos: { imported: number; skipped: string[] };
  notes: string[];
}

function sameKey(a: KdKey, b: KdKey): boolean {
  return (Object.keys(EMPTY_KEY) as (keyof KdKey)[]).every((f) => a[f] === b[f]);
}

/** keymap-drawer's trigger keys: the positions of those legends on the first layer that has all. */
function triggerPositions(doc: KdDocument, combo: KdCombo): number[] | null {
  const triggers = combo.triggers ?? [];
  const layers = combo.layers.length > 0 ? combo.layers : doc.layers.map((l) => l.name);
  for (const name of layers) {
    const layer = doc.layers.find((l) => l.name === name);
    if (!layer) continue;
    const at = triggers.map((t) => layer.keys.findIndex((k) => sameKey(k, t)));
    if (at.every((i) => i >= 0)) return at;
  }
  return null;
}

/** Build a layout from a keymap-drawer file: the chosen layers, on the chosen board. */
export function importKeymapDrawer(
  doc: KdDocument,
  opts: KeymapDrawerImport,
): { layout: Layout; report: ImportReport } {
  if (opts.layers.length === 0) throw new KeymapDrawerError('choose at least one layer');
  const notes: string[] = [];
  const taken = new Set<string>();
  const ids = opts.layers.map((l) => {
    const base = slug(l.name) || 'layer';
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    taken.add(id);
    return id;
  });
  const ctx: LegendContext = { layers: new Map() };
  for (const l of doc.layers) ctx.layers.set(l.name.toLowerCase(), null);
  opts.layers.forEach((l, i) => {
    ctx.layers.set(l.source.toLowerCase(), ids[i]);
    ctx.layers.set(l.name.toLowerCase(), ids[i]);
  });

  const positions = opts.board.ids.length;
  const layers: LayerDef[] = [];
  const reports: LayerReport[] = [];
  opts.layers.forEach((choice, li) => {
    const source = doc.layers.find((l) => l.name === choice.source);
    if (!source) throw new KeymapDrawerError(`there is no layer ${choice.source} in the file`);
    if (source.keys.length !== positions) {
      notes.push(
        `${choice.source} has ${source.keys.length} keys where the board has ${positions} positions; the keys were taken in order.`,
      );
    }
    const bindings: Record<string, Binding> = li === 0 ? {} : { '*': { kind: 'trans' } };
    const report: LayerReport = { name: choice.name, keys: 0, read: 0, kept: [] };
    source.keys.forEach((k, i) => {
      const id = opts.board.ids[i];
      if (!id) return;
      report.keys++;
      const reading = readLegend(k, ctx);
      if (reading.kind === 'transparent') {
        report.read++;
        // On the base layer there is nothing below to show through.
        if (li === 0) bindings[id] = { kind: 'none' };
        return;
      }
      bindings[id] = reading.binding;
      if (reading.exact) report.read++;
      else report.kept.push(k.tap.trim() || k.hold.trim() || '?');
    });
    layers.push({ id: ids[li], name: choice.name, bindings });
    reports.push(report);
  });

  // The keys the analysis needs to know about: the one that types a space, and shift.
  const base = layers[0].bindings;
  const tapOf = (b: Binding | undefined): Binding | undefined =>
    b?.kind === 'lt' || b?.kind === 'hold_tap' ? b.tap : b;
  const allIds = opts.board.ids.filter((id): id is string => id !== null);
  const space =
    allIds.find((id) => {
      const t = tapOf(base[id]);
      return t?.kind === 'kp' && t.symbol === ' ';
    }) ??
    allIds.find((id) => /^[LR]\d$/.test(id)) ??
    allIds[0];
  if (
    !allIds.some(
      (id) =>
        tapOf(base[id])?.kind === 'kp' && (tapOf(base[id]) as { symbol?: string }).symbol === ' ',
    )
  ) {
    notes.push(
      'No key on the base layer types a space; the analysis takes the first thumb key as the space bar.',
    );
  }
  const shiftKey = allIds.find((id) => {
    const b = base[id];
    return (b?.kind === 'sk' || b?.kind === 'mod') && (b.mod === 'LSHIFT' || b.mod === 'RSHIFT');
  });

  const combos: ComboDef[] = [];
  const skipped: string[] = [];
  const comboIds = new Set<string>();
  for (const c of doc.combos) {
    const label = c.key.tap || c.key.hold || '?';
    const at = c.positions ?? triggerPositions(doc, c);
    if (!at) {
      skipped.push(`${label}: its trigger keys are on no layer`);
      continue;
    }
    const keys = at.map((p) => opts.board.ids[p] ?? null);
    if (keys.some((k) => k === null) || keys.length < 2) {
      skipped.push(`${label}: on keys the board does not have`);
      continue;
    }
    const on = c.layers.map((n) => ctx.layers.get(n.toLowerCase()) ?? null);
    const layersOn = on.filter((id): id is string => id !== null);
    if (c.layers.length > 0 && layersOn.length === 0) {
      skipped.push(`${label}: only on layers not imported`);
      continue;
    }
    const reading = readLegend(c.key, ctx);
    if (reading.kind === 'transparent') {
      skipped.push(`${label}: transparent`);
      continue;
    }
    const b = reading.binding;
    let id = slug(keys.join('-'));
    for (let n = 2; comboIds.has(id); n++) id = `${slug(keys.join('-'))}-${n}`;
    comboIds.add(id);
    combos.push({
      id,
      keys: keys as string[],
      binding: b,
      ...(layersOn.length > 0 ? { layers: layersOn } : {}),
      role: b.kind === 'kp' || b.kind === 'macro' ? 'typing' : 'command',
    });
  }

  const layout: Layout = {
    format: 'layerbench/layout@1',
    name: opts.name,
    description: `Imported from keymap-drawer onto ${opts.board.description}.`,
    hostLocale: 'symbols',
    geometry: opts.board.geometry,
    keys: {
      space,
      ...(shiftKey
        ? { shift: { key: shiftKey, kind: base[shiftKey]?.kind === 'sk' ? 'sk' : 'hold' } }
        : {}),
    },
    layers,
    ...(combos.length > 0 ? { combos } : {}),
  };
  return {
    layout,
    report: {
      board: opts.board.description,
      layers: reports,
      combos: { imported: combos.length, skipped },
      notes,
    },
  };
}

// ------------------------------------------------------------------ writing a file

const PLAIN_UNSAFE = /^[-?:,[\]{}#&*!|>'"%@`\s]|[,[\]{}]|: |\s#|\s$|^$/;

/**
 * A legend as a YAML scalar keymap-drawer reads back as the same text. keymap-drawer loads files
 * with PyYAML, which follows YAML 1.1: besides numbers, nulls and its many booleans, a bare `=` is
 * its `value` tag, which it cannot construct, and `<<` is a merge key — so all of those are quoted.
 */
function quote(value: string): string {
  if (/[\n\t"\\\p{C}]/u.test(value.replace(/'/g, ''))) return JSON.stringify(value);
  const resolvesElsewhere =
    /^(null|Null|NULL|~|=|<<|true|True|TRUE|false|False|FALSE|y|Y|yes|Yes|YES|n|N|no|No|NO|on|On|ON|off|Off|OFF)$/.test(
      value,
    ) || /^[-+]?(\.?[0-9]|0x|0o|\.inf|\.nan)/i.test(value);
  if (!resolvesElsewhere && !PLAIN_UNSAFE.test(value)) return value;
  return `'${value.replace(/'/g, "''")}'`;
}

function flowKey(k: Partial<KdKey>): string {
  const fields = (['t', 'h', 's', 'tr', 'type'] as const)
    .map((f) => {
      const v =
        f === 't' ? k.tap : f === 'h' ? k.hold : f === 's' ? k.shifted : f === 'tr' ? k.tr : k.type;
      return v ? `${f}: ${quote(v)}` : '';
    })
    .filter(Boolean);
  if (fields.length === 1 && k.tap) return quote(k.tap);
  if (fields.length === 0) return "''";
  return `{${fields.join(', ')}}`;
}

/** How a binding is drawn in keymap-drawer's terms. */
function legendOf(
  b: Binding | undefined,
  layerName: (id: string) => string,
  upper: boolean,
): Partial<KdKey> {
  if (!b || b.kind === 'trans') return upper ? { tap: '▽', type: 'trans' } : {};
  switch (b.kind) {
    case 'none':
      return {};
    case 'kp': {
      const s = b.symbol ?? b.keycode ?? '';
      const tap = s === ' ' ? 'SPACE' : /^[a-z]$/.test(s) ? s.toUpperCase() : s;
      const shifted = b.shifted !== undefined && b.shifted !== s.toUpperCase() ? b.shifted : '';
      return { tap, shifted };
    }
    case 'mo':
      return { tap: layerName(b.layer) };
    case 'sl':
      return { tap: layerName(b.layer), hold: 'sticky' };
    case 'tog':
      return { tap: layerName(b.layer), hold: 'toggle' };
    case 'to':
      return { tap: layerName(b.layer), hold: 'to' };
    case 'auto_layer':
      return { tap: layerName(b.layer), hold: 'auto' };
    case 'lt':
      return { ...legendOf(b.tap, layerName, false), hold: layerName(b.layer) };
    case 'hold_tap': {
      const hold =
        b.hold.kind === 'mod'
          ? MOD_LEGEND[b.hold.mod]
          : b.hold.kind === 'mo'
            ? layerName(b.hold.layer)
            : (legendOf(b.hold, layerName, false).tap ?? '');
      return { ...legendOf(b.tap, layerName, false), hold };
    }
    case 'mod':
      return { tap: MOD_LEGEND[b.mod] };
    case 'sk':
      return { tap: MOD_LEGEND[b.mod], hold: 'sticky' };
    case 'caps_word':
      return { tap: 'CAPS_WORD' };
    case 'key_repeat':
      return { tap: 'REPEAT' };
    case 'raw':
      return { tap: b.label };
    case 'macro':
      // The corner mark is what tells a macro typing `qu` from a key named QU on the way back in.
      return b.symbols ? { tap: b.symbols, tr: BADGE.macro } : { tap: BADGE.macro };
    case 'unicode':
      return { tap: b.symbol, shifted: b.shiftedSymbol ?? '', tr: BADGE.unicode };
    case 'dead_key':
      return { tap: b.diacritic, shifted: b.shifted ?? '' };
    case 'adaptive':
      // Drawn as what it types by default, with the board's mark; the branches have no field.
      return b.default
        ? { ...legendOf(b.default, layerName, false), tr: BADGE.adaptive }
        : { tap: BADGE.adaptive };
    case 'mod_morph':
      return legendOf(b.default, layerName, upper);
    case 'layer_morph':
      return legendOf(b.inactive, layerName, upper);
    case 'tap_dance':
      return { ...legendOf(b.bindings[0], layerName, false), tr: BADGE.tapDance };
    case 'ref':
      return { tap: b.ref };
  }
}

/**
 * The cols+thumbs notation for a columnar board: per hand the keys in each column, with `^` and
 * `v` saying where a short column sits, then the thumbs. Null for a row-staggered board, which
 * keymap-drawer can only draw from a named keyboard.
 */
export function colsThumbsNotation(keys: GeometryKey[], family: GeometryFamily): string | null {
  if (family !== 'columnar') return null;
  if (keys.some((k) => k.row !== 3 && (k.w !== 1 || k.h !== 1))) return null;
  const alphas = keys.filter((k) => k.row !== 3);
  const maxPerColumn = (hand: Hand) => {
    const cols = new Map<number, GeometryKey[]>();
    for (const k of alphas.filter((a) => a.hand === hand)) {
      cols.set(k.col, [...(cols.get(k.col) ?? []), k]);
    }
    return cols;
  };
  const left = maxPerColumn('L');
  const right = maxPerColumn('R');
  const rows = alphas.map((k) => k.row);
  const top = Math.min(...rows);
  const tallest = Math.max(...[...left.values(), ...right.values()].map((c) => c.length));
  const column = (c: GeometryKey[]) => {
    const n = c.length;
    const first = Math.min(...c.map((k) => k.row)) - top;
    const shift = 2 * first - tallest + n;
    return `${n}${shift > 0 ? 'v'.repeat(shift) : '^'.repeat(-shift)}`;
  };
  const half = (cols: Map<number, GeometryKey[]>, hand: Hand) => {
    const order = [...cols.keys()].sort((a, b) => (hand === 'L' ? a - b : b - a));
    return order.map((c) => column(cols.get(c) as GeometryKey[])).join('');
  };
  const thumbs = (hand: Hand) => keys.filter((k) => k.hand === hand && k.row === 3).length;
  if (left.size < 2 || right.size < 2) return null;
  const l = half(left, 'L') + (thumbs('L') > 0 ? `+${thumbs('L')}` : '');
  const r = (thumbs('R') > 0 ? `${thumbs('R')}+` : '') + half(right, 'R');
  return `${l} ${r}`;
}

/** The keys of a board in keymap-drawer's order: row by row, left to right, thumbs last. */
export function drawerOrder(keys: GeometryKey[]): GeometryKey[] {
  return [...keys].sort(
    (a, b) => a.row - b.row || (a.hand === b.hand ? 0 : a.hand === 'L' ? -1 : 1) || a.x - b.x,
  );
}

/**
 * A keymap-drawer file for a layout: each layer's keys as they are drawn, row by row, and its
 * combos. It is a drawing: what a legend cannot say — an adaptive key's branches, a macro's steps —
 * is drawn and not written, so reading the file back gives those keys as imported ones.
 */
export function exportKeymapDrawer(
  layout: Layout,
  board: { keys: GeometryKey[]; family: GeometryFamily },
  /**
   * What a key does on a layer, its layer's `'*'` default applied to a key it does not list: one
   * that shows through is drawn transparent, one that does nothing is drawn empty.
   */
  bindingsOf: (layerIdx: number, keyId: string) => Binding | undefined,
  /** The keys held or tapped to reach a layer, which keymap-drawer marks `held` there. */
  held?: (layerIdx: number, keyId: string) => boolean,
): string {
  const geometryKeys = board.keys;
  const order = drawerOrder(geometryKeys);
  const position = new Map(order.map((k, i) => [k.id, i]));
  const names = new Map(layout.layers.map((l) => [l.id, l.name ?? l.id]));
  const layerName = (id: string) => names.get(id) ?? id;
  const lines: string[] = [];
  const notation = colsThumbsNotation(geometryKeys, board.family);
  if (notation) {
    lines.push('layout:', `  cols_thumbs_notation: ${quote(notation)}`);
  } else {
    lines.push(
      '# keymap-drawer needs a named keyboard for this board, for example:',
      '# layout:',
      '#   qmk_keyboard: <your keyboard>',
    );
  }
  lines.push('layers:');
  layout.layers.forEach((layer, li) => {
    lines.push(`  ${quote(layer.name ?? layer.id)}:`);
    const rows = new Map<number, GeometryKey[]>();
    for (const k of order) rows.set(k.row, [...(rows.get(k.row) ?? []), k]);
    for (const [, keys] of [...rows.entries()].sort(([a], [b]) => a - b)) {
      const cells = keys.map((k) => {
        // What the key does, listed or not: a layer that leaves its other keys doing nothing
        // draws them empty, which reads back as doing nothing, and not as keys that show through.
        const b = bindingsOf(li, k.id);
        // A key held or tapped to get to this layer is drawn as keymap-drawer's own parser marks
        // one. Only where it is transparent: `held` reads back as transparent.
        if (li > 0 && b?.kind === 'trans' && held?.(li, k.id)) return flowKey({ type: 'held' });
        return flowKey(legendOf(b, layerName, li > 0));
      });
      lines.push(`  - [${cells.join(', ')}]`);
    }
  });
  const combos = (layout.combos ?? []).filter((c) => c.keys.every((k) => position.has(k)));
  if (combos.length > 0) {
    lines.push('combos:');
    for (const c of combos) {
      const p = c.keys.map((k) => position.get(k));
      const l = c.layers?.length
        ? `, l: [${c.layers.map((id) => quote(layerName(id))).join(', ')}]`
        : '';
      lines.push(
        `  - {p: [${p.join(', ')}], k: ${flowKey(legendOf(c.binding, layerName, false))}${l}}`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}
