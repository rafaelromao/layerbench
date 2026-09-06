import type { Finger, FingeringMode, Geometry, GeometryKey, Hand, Row } from './types.js';

const COL_LETTER = ['O', 'P', 'R', 'M', 'I', 'C'] as const;
const ROW_LETTER = ['T', 'H', 'B'] as const;

/** Default finger for a canonical column (0 outer-pinky … 5 inner). */
export function columnFinger(hand: Hand, col: number): Finger {
  const name = col <= 1 ? 'P' : col === 2 ? 'R' : col === 3 ? 'M' : 'I';
  return `${hand}${name}` as Finger;
}

export function keyId(hand: Hand, row: Row, col: number): string {
  if (row === 3) return `${hand}${col}`;
  return `${hand}${ROW_LETTER[row]}${COL_LETTER[col]}`;
}

/** Default column stagger for columnar presets (U, positive = lower). */
export const DEFAULT_COLUMN_OFFSETS: Record<number, number> = {
  0: 0.25,
  1: 0.25,
  2: 0,
  3: -0.25,
  4: 0,
  5: 0.25,
};

const COLUMNAR_GAP = 1.0;
const ROWSTAGGER_OFFSETS: Record<number, number> = { 0: -0.25, 1: 0, 2: 0.5 };

function columnarX(hand: Hand, col: number, gap = COLUMNAR_GAP): number {
  return hand === 'L' ? col : 11 - col + gap;
}

function rowStaggerX(hand: Hand, row: Row, col: number): number {
  const homeX = hand === 'L' ? col + 0.75 : 11 - col + 0.75;
  return homeX + (ROWSTAGGER_OFFSETS[row] ?? 0);
}

function columnarThumbX(hand: Hand, index: number, gap = COLUMNAR_GAP): number {
  // Innermost thumb sits half a key inside the index column; further thumbs step outward.
  return hand === 'L' ? 4.5 - index : 11 - 4 + gap - 0.5 + index;
}

interface ColumnarSpec {
  id: string;
  name: string;
  /** Columns present per hand (canonical numbering). */
  cols: number[];
  /** Columns that only carry the home row (e.g. the pinky in 1333+2). */
  homeOnlyCols?: number[];
  thumbs: number;
  columnOffsets?: Record<number, number>;
}

function makeKey(partial: Omit<GeometryKey, 'w' | 'h' | 'rotation' | 'home' | 'thumb' | 'inner'> & Partial<GeometryKey>): GeometryKey {
  return {
    w: 1,
    h: 1,
    rotation: 0,
    home: partial.row === 1,
    thumb: partial.row === 3,
    inner: partial.col === 5 && partial.row !== 3,
    ...partial,
  };
}

export function buildColumnar(spec: ColumnarSpec): Geometry {
  const offsets = { ...DEFAULT_COLUMN_OFFSETS, ...(spec.columnOffsets ?? {}) };
  const keys: GeometryKey[] = [];
  const textRows: string[][] = [[], [], []];
  const textThumbs: string[] = [];
  const hands: Hand[] = ['L', 'R'];
  for (const hand of hands) {
    const cols = hand === 'L' ? [...spec.cols].sort((a, b) => a - b) : [...spec.cols].sort((a, b) => b - a);
    for (const row of [0, 1, 2] as Row[]) {
      for (const col of cols) {
        if (row !== 1 && spec.homeOnlyCols?.includes(col)) continue;
        const id = keyId(hand, row, col);
        keys.push(
          makeKey({
            id,
            hand,
            finger: columnFinger(hand, col),
            row,
            col,
            x: columnarX(hand, col),
            y: row + (offsets[col] ?? 0),
          }),
        );
        textRows[row].push(id);
      }
    }
  }
  // Thumbs: left outer→inner then right inner→outer, in reading order.
  for (let i = spec.thumbs - 1; i >= 0; i--) {
    const id = keyId('L', 3, i);
    keys.push(makeKey({ id, hand: 'L', finger: 'LT', row: 3, col: i, x: columnarThumbX('L', i), y: 3.25, rotation: 10 + 8 * i }));
    textThumbs.push(id);
  }
  for (let i = 0; i < spec.thumbs; i++) {
    const id = keyId('R', 3, i);
    keys.push(makeKey({ id, hand: 'R', finger: 'RT', row: 3, col: i, x: columnarThumbX('R', i), y: 3.25, rotation: -(10 + 8 * i) }));
    textThumbs.push(id);
  }
  return { id: spec.id, name: spec.name, family: 'columnar', keys, supportsAngleMod: false, textRows, textThumbs };
}

interface RowStaggerSpec {
  id: string;
  name: string;
  iso: boolean;
}

export function buildRowStagger(spec: RowStaggerSpec): Geometry {
  const keys: GeometryKey[] = [];
  const textRows: string[][] = [[], [], []];
  const hands: Hand[] = ['L', 'R'];
  for (const hand of hands) {
    for (const row of [0, 1, 2] as Row[]) {
      const cols = hand === 'L' ? [0, 1, 2, 3, 4, 5] : [5, 4, 3, 2, 1, 0];
      for (const col of cols) {
        // Left outer column: only the ISO extra key on the bottom row.
        if (hand === 'L' && col === 0 && !(spec.iso && row === 2)) continue;
        // Right outer column: the `[`/`'` positions on the top and home rows only.
        if (hand === 'R' && col === 0 && row === 2) continue;
        const id = keyId(hand, row, col);
        keys.push(
          makeKey({
            id,
            hand,
            finger: columnFinger(hand, col),
            row,
            col,
            x: rowStaggerX(hand, row, col),
            y: row,
          }),
        );
        textRows[row].push(id);
      }
    }
  }
  // Space bar: one physical key, reachable by either thumb → two virtual keys at the same spot.
  keys.push(makeKey({ id: 'L0', hand: 'L', finger: 'LT', row: 3, col: 0, x: 6.75, y: 3, w: 6, h: 1 }));
  keys.push(makeKey({ id: 'R0', hand: 'R', finger: 'RT', row: 3, col: 0, x: 6.75, y: 3, w: 6, h: 1 }));
  return {
    id: spec.id,
    name: spec.name,
    family: 'rowstagger',
    keys,
    supportsAngleMod: true,
    textRows,
    textThumbs: ['L0', 'R0'],
  };
}

export const GEOMETRY_PRESETS: Record<string, () => Geometry> = {
  '3x5+2': () => buildColumnar({ id: '3x5+2', name: 'Split columnar 3×5 + 2 thumbs (34)', cols: [1, 2, 3, 4, 5], thumbs: 2 }),
  '3x5+3': () => buildColumnar({ id: '3x5+3', name: 'Split columnar 3×5 + 3 thumbs (36)', cols: [1, 2, 3, 4, 5], thumbs: 3 }),
  '3x6+3': () => buildColumnar({ id: '3x6+3', name: 'Split columnar 3×6 + 3 thumbs (42, Corne)', cols: [0, 1, 2, 3, 4, 5], thumbs: 3 }),
  '1333+2': () =>
    buildColumnar({ id: '1333+2', name: 'Split columnar 1333 + 2 thumbs (24)', cols: [1, 2, 3, 4], homeOnlyCols: [1], thumbs: 2 }),
  ansi: () => buildRowStagger({ id: 'ansi', name: 'Row stagger ANSI', iso: false }),
  iso: () => buildRowStagger({ id: 'iso', name: 'Row stagger ISO', iso: true }),
};

export const GEOMETRY_PRESET_IDS = Object.keys(GEOMETRY_PRESETS);

export function getGeometryPreset(id: string, columnOffsets?: Record<number, number>): Geometry {
  const factory = GEOMETRY_PRESETS[id];
  if (!factory) throw new Error(`Unknown geometry preset: ${id}`);
  const g = factory();
  if (columnOffsets && g.family === 'columnar') {
    const offsets = { ...DEFAULT_COLUMN_OFFSETS, ...columnOffsets };
    for (const k of g.keys) if (k.row !== 3) k.y = k.row + (offsets[k.col] ?? 0);
  }
  return g;
}

/**
 * Apply a fingering mode. Angle mod (Layouts Doc ch. 2) refingers the left bottom row on row-stagger boards:
 * ANSI: Z→ring, X→middle, C/V/B→index (pinky loses its bottom key);
 * ISO: extra key→pinky, Z→ring, X→middle, C/V/B→index.
 */
export function applyFingering(geometry: Geometry, mode: FingeringMode | Record<string, Finger>): Geometry {
  const keys = geometry.keys.map((k) => ({ ...k }));
  if (typeof mode === 'object') {
    for (const k of keys) {
      const f = mode[k.id];
      if (f) k.finger = f;
    }
    return { ...geometry, keys };
  }
  if (mode === 'angle-mod' && geometry.supportsAngleMod) {
    for (const k of keys) {
      if (k.hand !== 'L' || k.row !== 2) continue;
      if (k.col === 0) k.finger = 'LP';
      else if (k.col === 1) k.finger = 'LR';
      else if (k.col === 2) k.finger = 'LM';
      else k.finger = 'LI';
    }
  }
  return { ...geometry, keys };
}
