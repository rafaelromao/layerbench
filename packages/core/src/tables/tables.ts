import type { Finger } from '../geometry/types.js';
import type { KeyEvent, KeyKind } from '../sim/machine.js';

export const MAX_LOGICAL_KEYS = 1024;
const SHIFT = 10; // 10 bits per logical key id

export interface LogicalKey {
  id: number;
  layer: number;
  pos: number;
  keyKind: KeyKind;
  label: string;
}

/** Registry of (layer, position, kind, label) → small integer ids used as n-gram table keys. */
export class LogicalKeyRegistry {
  readonly keys: LogicalKey[] = [];
  private readonly index = new Map<string, number>();

  idFor(ev: KeyEvent): number {
    const k = `${ev.layer}|${ev.pos}|${ev.keyKind}|${ev.label}`;
    let id = this.index.get(k);
    if (id === undefined) {
      id = this.keys.length;
      if (id >= MAX_LOGICAL_KEYS) throw new Error('Too many logical keys');
      this.keys.push({ id, layer: ev.layer, pos: ev.pos, keyKind: ev.keyKind, label: ev.label });
      this.index.set(k, id);
    }
    return id;
  }

  get(id: number): LogicalKey {
    return this.keys[id];
  }

  /** Move a logical key to another position (relabel, SPEC §5.6). */
  setPosition(id: number, pos: number): void {
    this.keys[id].pos = pos;
  }
}

export type NgramMap = Map<number, number>;

export interface NgramTables {
  unigram: NgramMap;
  bigram: NgramMap;
  trigram: NgramMap;
  skip: [NgramMap, NgramMap, NgramMap];
  /** Totals: Σ counts per table. */
  totals: { unigram: number; bigram: number; trigram: number; skip: [number, number, number] };
}

export function packBigram(a: number, b: number): number {
  return (a << SHIFT) | b;
}
export function unpackBigram(k: number): [number, number] {
  return [k >>> SHIFT, k & (MAX_LOGICAL_KEYS - 1)];
}
export function packTrigram(a: number, b: number, c: number): number {
  return (a << (2 * SHIFT)) | (b << SHIFT) | c;
}
export function unpackTrigram(k: number): [number, number, number] {
  return [k >>> (2 * SHIFT), (k >>> SHIFT) & (MAX_LOGICAL_KEYS - 1), k & (MAX_LOGICAL_KEYS - 1)];
}

function inc(m: NgramMap, k: number, w: number): void {
  m.set(k, (m.get(k) ?? 0) + w);
}

export function emptyTables(): NgramTables {
  return {
    unigram: new Map(),
    bigram: new Map(),
    trigram: new Map(),
    skip: [new Map(), new Map(), new Map()],
    totals: { unigram: 0, bigram: 0, trigram: 0, skip: [0, 0, 0] },
  };
}

/** Streaming accumulator for one universe. */
export class NgramAccumulator {
  readonly tables = emptyTables();
  private buf: number[] = [];

  push(id: number, w = 1): void {
    const t = this.tables;
    const b = this.buf;
    inc(t.unigram, id, w);
    t.totals.unigram += w;
    const n = b.length;
    if (n >= 1) {
      inc(t.bigram, packBigram(b[n - 1], id), w);
      t.totals.bigram += w;
    }
    if (n >= 2) {
      inc(t.trigram, packTrigram(b[n - 2], b[n - 1], id), w);
      t.totals.trigram += w;
      inc(t.skip[0], packBigram(b[n - 2], id), w);
      t.totals.skip[0] += w;
    }
    if (n >= 3) {
      inc(t.skip[1], packBigram(b[n - 3], id), w);
      t.totals.skip[1] += w;
    }
    if (n >= 4) {
      inc(t.skip[2], packBigram(b[n - 4], id), w);
      t.totals.skip[2] += w;
    }
    b.push(id);
    if (b.length > 8) b.splice(0, b.length - 5);
  }

  boundary(): void {
    this.buf.length = 0;
  }
}

export interface WordTrace {
  word: string;
  count: number;
  /** Number of physical presses for one occurrence. */
  presses: number;
  /** Logical key ids of one occurrence (first seen). */
  keys: number[];
}

export interface RunStats {
  /** Histogram of same-hand run lengths (index = length). */
  handRuns: number[];
  /** Same-hand strings (≥ 4 keys) → count. */
  handStrings: Map<string, number>;
  /** Histogram of same-finger run lengths. */
  fingerRuns: number[];
  /** Layer run lengths (consecutive presses resolved on the same non-base layer). */
  layerRuns: number[];
}

export interface FingerTravel {
  /** Cumulative Euclidean travel (U) from the finger's previous key, never reset. */
  continuous: Record<Finger, number>;
  /** Same, but fingers return to their home key at every word start (cyanophage-like). */
  resetAtWord: Record<Finger, number>;
  usage: Record<Finger, number>;
}

export interface SimulationStats {
  symbols: number;
  words: number;
  keystrokes: number;
  spacePresses: number;
  layerTaps: number;
  oneShotActivations: number;
  wastedOneShots: number;
  holdPresses: number;
  chords: number;
  macroPresses: number;
  adaptivePresses: number;
  adaptiveTriggerHits: number;
  repeatPresses: number;
  perLayer: number[];
  unproducible: Map<string, number>;
}

export interface SimulationTables {
  registry: LogicalKeyRegistry;
  /** Default universe: thumbs included, space excluded (SPEC D5). */
  noSpace: NgramTables;
  /** With-space universe. */
  withSpace: NgramTables;
  runs: RunStats;
  words: Map<string, WordTrace>;
  travel: FingerTravel;
  stats: SimulationStats;
}
