import type { DistanceModel } from '../geometry/distance.js';
import type { Finger, Hand } from '../geometry/types.js';
import { adjacentFingers, FINGER_RANK } from '../geometry/types.js';
import type { CompiledLayout } from '../layout/compile.js';
import type { KeyKind } from '../sim/machine.js';
import type { LogicalKeyRegistry } from '../tables/tables.js';

/**
 * Everything a rule predicate can ask about one logical key: where it sits, which finger presses
 * it, which layer it resolved on. Built once per analysis from the registry and the compiled layout.
 */
export interface Attrs {
  id: number;
  pos: number;
  layer: number;
  key_kind: KeyKind;
  label: string;
  hand: Hand | 'both';
  fingers: Finger[];
  /** Set only when exactly one finger presses the position; chords leave it null. */
  finger: Finger | null;
  rank: number;
  x: number;
  y: number;
  row: number;
  col: number;
  thumb: boolean;
  home: boolean;
  inner: boolean;
  members: number[];
}

function worstRank(fingers: Finger[]): number {
  if (fingers.length === 0) return 0;
  return Math.max(...fingers.map((f) => FINGER_RANK[f]));
}

/** Attributes indexed by logical key id. */
export function buildAttrs(compiled: CompiledLayout, registry: LogicalKeyRegistry): Attrs[] {
  const out: Attrs[] = [];
  for (const lk of registry.all()) {
    const pos = compiled.positions[lk.pos];
    const finger = pos.fingers.length === 1 ? pos.fingers[0] : null;
    out[lk.id] = {
      id: lk.id,
      pos: lk.pos,
      layer: lk.layer,
      key_kind: lk.keyKind,
      label: lk.label,
      hand: pos.hand,
      fingers: pos.fingers,
      finger,
      rank: finger ? FINGER_RANK[finger] : worstRank(pos.fingers),
      x: pos.x,
      y: pos.y,
      row: pos.row,
      col: pos.col,
      thumb: pos.thumb,
      home: pos.home,
      inner: pos.inner,
      members: pos.members,
    };
  }
  return out;
}

/** Same finger: any shared finger, so a chord counts as the worst case. */
export function sameFinger(a: Attrs, b: Attrs): boolean {
  return a.fingers.some((f) => b.fingers.includes(f));
}

export function sameHand(a: Attrs, b: Attrs): boolean {
  return a.hand !== 'both' && a.hand === b.hand;
}

export function adjacentFingerPair(a: Attrs, b: Attrs): boolean {
  if (!a.finger || !b.finger) return false;
  return adjacentFingers(a.finger, b.finger);
}

export function rankDelta(a: Attrs, b: Attrs): number {
  return Math.abs(a.rank - b.rank);
}

/** Direction of a same-hand pair: inward means moving toward the thumb. */
export function pairDirection(a: Attrs, b: Attrs): 'inward' | 'outward' | 'same' | 'none' {
  if (!sameHand(a, b)) return 'none';
  if (b.rank > a.rank) return 'inward';
  if (b.rank < a.rank) return 'outward';
  return 'same';
}

/** Distance between two keys in key units. Undefined across hands. */
export function attrDistance(a: Attrs, b: Attrs, model: DistanceModel = 'euclid'): number | null {
  if (!sameHand(a, b)) return null;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  if (model === 'squared') return dx * dx + dy * dy;
  if (model === 'manhattan') return Math.abs(dx) + Math.abs(dy);
  return Math.sqrt(dx * dx + dy * dy);
}
