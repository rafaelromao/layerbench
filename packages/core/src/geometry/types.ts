export type Hand = 'L' | 'R';

export type Finger = 'LP' | 'LR' | 'LM' | 'LI' | 'LT' | 'RT' | 'RI' | 'RM' | 'RR' | 'RP';

export const FINGERS: readonly Finger[] = [
  'LP',
  'LR',
  'LM',
  'LI',
  'LT',
  'RT',
  'RI',
  'RM',
  'RR',
  'RP',
];

export type FingerName = 'pinky' | 'ring' | 'middle' | 'index' | 'thumb';

/** Rank from the outside of the hand inwards: pinky 0, ring 1, middle 2, index 3, thumb 4. */
export const FINGER_RANK: Record<Finger, number> = {
  LP: 0,
  LR: 1,
  LM: 2,
  LI: 3,
  LT: 4,
  RT: 4,
  RI: 3,
  RM: 2,
  RR: 1,
  RP: 0,
};

export const FINGER_NAME: Record<Finger, FingerName> = {
  LP: 'pinky',
  LR: 'ring',
  LM: 'middle',
  LI: 'index',
  LT: 'thumb',
  RT: 'thumb',
  RI: 'index',
  RM: 'middle',
  RR: 'ring',
  RP: 'pinky',
};

export function fingerHand(f: Finger): Hand {
  return f[0] === 'L' ? 'L' : 'R';
}

export function fingerName(f: Finger): FingerName {
  return FINGER_NAME[f];
}

/** Adjacent fingers = rank differs by exactly 1 on the same hand (thumb counts as adjacent to index). */
export function adjacentFingers(a: Finger, b: Finger): boolean {
  return fingerHand(a) === fingerHand(b) && Math.abs(FINGER_RANK[a] - FINGER_RANK[b]) === 1;
}

/** Row index: 0 = top, 1 = home, 2 = bottom, 3 = thumb row. */
export type Row = 0 | 1 | 2 | 3;

export type GeometryFamily = 'columnar' | 'rowstagger';

export interface GeometryKey {
  /** Stable id, e.g. `LTP` (left top pinky), `RHI` (right home index), `L0` (left inner thumb). */
  id: string;
  hand: Hand;
  /** Default finger (before fingering overrides). */
  finger: Finger;
  row: Row;
  /**
   * Canonical column: 0 outer-pinky, 1 pinky, 2 ring, 3 middle, 4 index, 5 inner.
   * For thumb keys (row 3) the column is the thumb index counted from the inside (0 = innermost).
   */
  col: number;
  /** Center coordinates in key units (U). x grows left→right across the whole board, y grows top→bottom. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Render-only rotation in degrees (positive = clockwise). */
  rotation: number;
  home: boolean;
  thumb: boolean;
  inner: boolean;
}

export interface Geometry {
  id: string;
  name: string;
  family: GeometryFamily;
  keys: GeometryKey[];
  /** Whether angle-mod fingering applies (row stagger only). */
  supportsAngleMod: boolean;
  /** Ordered key ids per row for text import (left hand outer→inner, then right hand inner→outer). */
  textRows: string[][];
  /** Thumb key ids in import order (left outer→inner, right inner→outer). */
  textThumbs: string[];
}

export type FingeringMode = 'standard' | 'angle-mod';

export function keyById(geometry: Geometry, id: string): GeometryKey | undefined {
  return geometry.keys.find((k) => k.id === id);
}
