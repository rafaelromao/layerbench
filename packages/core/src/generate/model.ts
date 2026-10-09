import { getGeometryPreset } from '../geometry/presets.js';
import type { Geometry } from '../geometry/types.js';
import { compileLayout } from '../layout/compile.js';
import type { Layout } from '../layout/types.js';
import { CYANOPHAGE_EFFORT_SCALE, defaultEffort } from '../rules/effort.js';
import { type Sample, SPACE } from './tables.js';

/**
 * The design the generator searches over, and two scorers for it: an exact pass that types the
 * sample the way the simulator does, and a fast one from the sample's tables for the search loop.
 *
 * A design is a placement of symbols on slots. On a two-layer design a slot is a board key on the
 * base layer or on `alpha2`, the layer a thumb one-shot reaches, or a thumb key that takes a
 * letter; the other thumbs hold the space, the one-shot and, in some configurations, the repeat
 * key. The rules the scorers follow were checked against the engine (`generate.test.ts`):
 *
 * - every press but the space is in the no-space bigram stream, one-shot and repeat taps included;
 *   pairs never cross a word, and a character the layout cannot type is a hard boundary;
 * - an `alpha2` symbol is a one-shot tap on its thumb, then its key: the tap stands between the
 *   symbol and the key before it, so that pair is never an SFB, while the tap is an SFB with a key
 *   on its own thumb pressed just before it;
 * - a doubled symbol is the repeat key when that is fewer presses, else whichever of the repeat key
 *   and the key itself makes fewer SFBs with the previous press, then fewer SFSs with the press
 *   before that, then costs less, the repeat key on a full tie; a space ends a double, a skipped
 *   character does not;
 * - Effort is the Effort rule's grid (cyanophage's, a thumb at `THUMB_EFFORT`) summed over presses,
 *   one-shot and repeat taps included, times 577, over characters typed plus spaces; SFB is
 *   same-finger pairs on different keys over characters typed plus words, a word being a run of
 *   typed characters.
 */

export const PRESET = '3x5+2';

export interface KeyInfo {
  id: string;
  /** Index in the geometry's key list, which is the compiled layout's member index. */
  pos: number;
  finger: string;
  cost: number;
  thumb: boolean;
}

export interface Board {
  geometry: Geometry;
  keys: KeyInfo[];
  byId: Map<string, KeyInfo>;
}

/** The 3×5+2 board with the Effort rule's costs, read through the same code the rule uses. */
export function board3x5(): Board {
  const geometry = getGeometryPreset(PRESET);
  const empty: Layout = {
    format: 'layerbench/layout@1',
    name: 'empty',
    geometry: { preset: PRESET },
    keys: { space: 'L0' },
    layers: [{ id: 'base', bindings: { L0: { kind: 'kp', symbol: ' ' } } }],
  };
  const costs = defaultEffort(compileLayout(empty));
  const keys = geometry.keys.map((k, pos) => ({
    id: k.id,
    pos,
    finger: k.finger,
    cost: costs[k.id] ?? 0,
    thumb: k.thumb,
  }));
  return { geometry, keys, byId: new Map(keys.map((k) => [k.id, k])) };
}

export interface Config {
  id: string;
  space: string;
  /** The thumb that taps `alpha2`; none on a flat design. */
  osl: string | null;
  rep: string | null;
  /** Thumb keys that take a symbol. */
  letterThumbs: readonly string[];
  /** A one-shot shift on this thumb: never pressed when case is folded, so it costs nothing here. */
  shift?: string;
  layers: 1 | 2;
  description: string;
}

/**
 * The thumb arrangements worth searching. Space and the one-shot on one thumb never pair, since
 * the space is not in the no-space stream; the other thumb takes letters, or a letter and the
 * repeat key. Mirror images score the same, so the space stays left where it can.
 */
export const CONFIGS: Record<string, Config> = {
  flat: {
    id: 'flat',
    space: 'L0',
    osl: null,
    rep: null,
    letterThumbs: [],
    layers: 1,
    description: 'one layer of 30 keys, space on the left thumb',
  },
  c1: {
    id: 'c1',
    space: 'L0',
    osl: 'L1',
    rep: null,
    letterThumbs: ['R0', 'R1'],
    layers: 2,
    description: 'space and one-shot on the left thumb, up to two letters on the right',
  },
  c2: {
    id: 'c2',
    space: 'L0',
    osl: 'L1',
    rep: 'R1',
    letterThumbs: ['R0'],
    layers: 2,
    description: 'space and one-shot on the left thumb, a letter and the repeat key on the right',
  },
  c3: {
    id: 'c3',
    space: 'R0',
    osl: 'L1',
    rep: 'L0',
    letterThumbs: ['R1'],
    layers: 2,
    description: 'repeat key and one-shot on the left thumb, space and a letter on the right',
  },
  c4: {
    id: 'c4',
    space: 'L0',
    osl: 'R0',
    rep: 'L1',
    letterThumbs: ['R1'],
    layers: 2,
    description: 'space and repeat key on the left thumb, one-shot and a letter on the right',
  },
  /** Breeze's and Romak 34's thumbs, with a letter where Romak has its one-shot: no second layer. */
  c5: {
    id: 'c5',
    space: 'L0',
    osl: null,
    rep: 'L1',
    letterThumbs: ['R0'],
    shift: 'R1',
    layers: 1,
    description:
      'one layer: repeat key and space on the left thumb, one letter and a one-shot shift on the right',
  },
};

export interface Slot {
  key: KeyInfo;
  layer: 0 | 1;
}

export function makeSlots(board: Board, config: Config): Slot[] {
  const slots: Slot[] = [];
  const boardKeys = board.keys.filter((k) => !k.thumb);
  for (let layer = 0; layer < config.layers; layer++) {
    for (const key of boardKeys) slots.push({ key, layer: layer as 0 | 1 });
  }
  for (const id of config.letterThumbs) {
    const key = board.byId.get(id);
    if (!key) throw new Error(`No thumb key ${id}`);
    slots.push({ key, layer: 0 });
  }
  return slots;
}

export interface Design {
  config: Config;
  board: Board;
  slots: Slot[];
  /** Slot → symbol, or -1. */
  occupant: Int16Array;
  /** Symbol → slot, or -1 when the design does not type it. */
  slotOf: Int16Array;
}

export function emptyDesign(board: Board, config: Config, symbolCount: number): Design {
  const slots = makeSlots(board, config);
  return {
    config,
    board,
    slots,
    occupant: new Int16Array(slots.length).fill(-1),
    slotOf: new Int16Array(symbolCount).fill(-1),
  };
}

export function cloneDesign(d: Design): Design {
  return { ...d, occupant: Int16Array.from(d.occupant), slotOf: Int16Array.from(d.slotOf) };
}

export function place(d: Design, symbol: number, slot: number): void {
  const prevSlot = d.slotOf[symbol];
  if (prevSlot >= 0) d.occupant[prevSlot] = -1;
  const prevSym = d.occupant[slot];
  if (prevSym >= 0) d.slotOf[prevSym] = -1;
  d.occupant[slot] = symbol;
  d.slotOf[symbol] = slot;
}

/** A deterministic generator, so a run can be repeated from its seed. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every symbol on a slot of its own, in random order. */
export function randomDesign(
  board: Board,
  config: Config,
  symbolCount: number,
  rand: () => number,
): Design {
  const d = emptyDesign(board, config, symbolCount);
  if (symbolCount > d.slots.length) {
    throw new Error(`${symbolCount} symbols do not fit ${d.slots.length} slots`);
  }
  const order = [...Array(d.slots.length).keys()];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (let s = 0; s < symbolCount; s++) place(d, s, order[s]);
  return d;
}

export interface Score {
  /** Effort, as the Library shows it. */
  effort: number;
  /** Same-finger bigrams, percent of characters plus words, as the cyanophage-like rules count. */
  sfb: number;
  /** One-shot taps per 100 symbols. */
  taps: number;
  sfbPairs: number;
  effortSum: number;
  oslTaps: number;
  repPresses: number;
  chars: number;
  spaces: number;
  words: number;
}

/** Where a symbol's presses land: the one-shot thumb first when it is on `alpha2`. */
export function firstPos(d: Design, symbol: number): number {
  const slot = d.slotOf[symbol];
  if (slot < 0) return -1;
  const s = d.slots[slot];
  if (s.layer === 1) return d.board.byId.get(d.config.osl as string)?.pos ?? -1;
  return s.key.pos;
}

export function lastPos(d: Design, symbol: number): number {
  const slot = d.slotOf[symbol];
  return slot < 0 ? -1 : d.slots[slot].key.pos;
}

/** Types the sample the way the simulator does and counts what the two rules count. */
export function scoreExact(sample: Sample, d: Design): Score {
  const S = sample.symbols.length;
  const finger = d.board.keys.map((k) => k.finger);
  const keyCost = d.board.keys.map((k) => k.cost);
  const first = new Int16Array(S);
  const last = new Int16Array(S);
  const alpha2 = new Uint8Array(S);
  for (let s = 0; s < S; s++) {
    first[s] = firstPos(d, s);
    last[s] = lastPos(d, s);
    const slot = d.slotOf[s];
    alpha2[s] = slot >= 0 && d.slots[slot].layer === 1 ? 1 : 0;
  }
  const oslPos = d.config.osl ? (d.board.byId.get(d.config.osl)?.pos ?? -1) : -1;
  const repPos = d.config.rep ? (d.board.byId.get(d.config.rep)?.pos ?? -1) : -1;
  const sfb = (p: number, q: number): number =>
    p >= 0 && q >= 0 && p !== q && finger[p] === finger[q] ? 1 : 0;

  let chars = 0;
  let spaces = 0;
  let words = 0;
  let run = 0;
  let effortSum = 0;
  let sfbPairs = 0;
  let oslTaps = 0;
  let repPresses = 0;
  // The previous press and the one before it, in the word; -1 past a boundary.
  let prev = -1;
  let prev2 = -1;
  // The last symbol typed, kept across a skipped character but not across a space.
  let lastSym = -1;

  const press = (p: number): void => {
    sfbPairs += sfb(prev, p);
    effortSum += keyCost[p];
    prev2 = prev;
    prev = p;
  };

  for (const t of sample.tokens) {
    if (t === SPACE) {
      spaces++;
      if (run > 0) words++;
      run = 0;
      prev = -1;
      prev2 = -1;
      lastSym = -1;
      continue;
    }
    if (t < 0 || first[t] < 0) {
      if (run > 0) words++;
      run = 0;
      prev = -1;
      prev2 = -1;
      continue;
    }
    chars++;
    run++;
    if (repPos >= 0 && lastSym === t) {
      let useRep = alpha2[t] === 1;
      if (!useRep) {
        // The simulator chooses on cyanophage's grid, where the repeat thumb costs nothing.
        const p = last[t];
        const sfbPlain = sfb(prev, p);
        const sfbRep = sfb(prev, repPos);
        const sfsPlain = sfb(prev2, p);
        const sfsRep = sfb(prev2, repPos);
        useRep =
          sfbRep < sfbPlain ||
          (sfbRep === sfbPlain && (sfsRep < sfsPlain || (sfsRep === sfsPlain && 0 <= keyCost[p])));
      }
      if (useRep) {
        press(repPos);
        repPresses++;
        lastSym = t;
        continue;
      }
    }
    if (alpha2[t] === 1) {
      press(oslPos);
      oslTaps++;
    }
    press(last[t]);
    lastSym = t;
  }
  if (run > 0) words++;

  return {
    effort: chars + spaces > 0 ? (CYANOPHAGE_EFFORT_SCALE * effortSum) / (chars + spaces) : 0,
    sfb: chars + words > 0 ? (100 * sfbPairs) / (chars + words) : 0,
    taps: chars > 0 ? (100 * oslTaps) / chars : 0,
    sfbPairs,
    effortSum,
    oslTaps,
    repPresses,
    chars,
    spaces,
    words,
  };
}

/**
 * The search loop's scorer: Effort, SFB pairs and one-shot taps from the sample's tables, updated
 * by the difference a swap makes. It follows the exact pass except in one corner: a double whose
 * repeat press the simulator declines for the skipgram it would make with the press two back is
 * still counted as a repeat press here. The search re-scores its results with the exact pass, and
 * every kept design with the engine.
 */
export class FastScorer {
  readonly S: number;
  readonly design: Design;
  private readonly sample: Sample;
  private readonly finger: string[];
  private readonly keyCost: number[];
  private readonly oslPos: number;
  private readonly repPos: number;
  /** What a tap of the one-shot thumb and a press of the repeat key cost. */
  private readonly oslCost: number;
  private readonly repCost: number;
  private readonly first: Int16Array;
  private readonly last: Int16Array;
  private readonly cost: Float64Array;
  private readonly alpha2: Uint8Array;
  private readonly rep: Uint8Array;
  effortSum = 0;
  sfbPairs = 0;
  oslTaps = 0;

  constructor(sample: Sample, design: Design) {
    this.sample = sample;
    this.design = design;
    this.S = sample.symbols.length;
    this.finger = design.board.keys.map((k) => k.finger);
    this.keyCost = design.board.keys.map((k) => k.cost);
    this.oslPos = design.config.osl ? (design.board.byId.get(design.config.osl)?.pos ?? -1) : -1;
    this.repPos = design.config.rep ? (design.board.byId.get(design.config.rep)?.pos ?? -1) : -1;
    this.oslCost = this.oslPos >= 0 ? this.keyCost[this.oslPos] : 0;
    this.repCost = this.repPos >= 0 ? this.keyCost[this.repPos] : 0;
    this.first = new Int16Array(this.S);
    this.last = new Int16Array(this.S);
    this.cost = new Float64Array(this.S);
    this.alpha2 = new Uint8Array(this.S);
    this.rep = new Uint8Array(this.S);
    for (let s = 0; s < this.S; s++) this.refresh(s);
    this.recompute();
  }

  get effort(): number {
    const { chars, spaces } = this.sample;
    return chars + spaces > 0 ? (CYANOPHAGE_EFFORT_SCALE * this.effortSum) / (chars + spaces) : 0;
  }

  get sfb(): number {
    const { chars, words } = this.sample;
    return chars + words > 0 ? (100 * this.sfbPairs) / (chars + words) : 0;
  }

  get taps(): number {
    return this.sample.chars > 0 ? (100 * this.oslTaps) / this.sample.chars : 0;
  }

  private sfbOf(p: number, q: number): number {
    return p >= 0 && q >= 0 && p !== q && this.finger[p] === this.finger[q] ? 1 : 0;
  }

  /** The cached placement of one symbol, after it moved. */
  private refresh(s: number): void {
    const d = this.design;
    const slot = d.slotOf[s];
    if (slot < 0) {
      this.first[s] = -1;
      this.last[s] = -1;
      this.cost[s] = 0;
      this.alpha2[s] = 0;
      this.rep[s] = 0;
      return;
    }
    const sl = d.slots[slot];
    this.alpha2[s] = sl.layer === 1 ? 1 : 0;
    this.first[s] = sl.layer === 1 ? this.oslPos : sl.key.pos;
    this.last[s] = sl.key.pos;
    // A symbol on `alpha2` costs its key and the one-shot tap before it.
    this.cost[s] = this.keyCost[sl.key.pos] + (sl.layer === 1 ? this.oslCost : 0);
    this.rep[s] =
      this.repPos >= 0 && (sl.layer === 1 || this.sfbOf(sl.key.pos, this.repPos) === 0) ? 1 : 0;
  }

  private effortOf(s: number): number {
    const { count, doubles } = this.sample;
    const repeats = this.rep[s] * doubles[s];
    return (count[s] - repeats) * this.cost[s] + repeats * this.repCost;
  }

  private tapsOf(s: number): number {
    const { count, doubles } = this.sample;
    return this.alpha2[s] === 1 ? count[s] - this.rep[s] * doubles[s] : 0;
  }

  /** SFB pairs the symbol takes part in, in either role, doubles typed with the repeat key included. */
  private pairsOf(s: number): number {
    const { S, first, last, rep } = this;
    const { bigram, doubleBefore } = this.sample;
    const ls = last[s];
    const fs = first[s];
    let out = 0;
    for (let t = 0; t < S; t++) {
      const st = bigram[s * S + t];
      if (st) out += st * this.sfbOf(ls, first[t]);
      if (t !== s) {
        const ts = bigram[t * S + s];
        if (ts) out += ts * this.sfbOf(last[t], fs);
      }
    }
    if (this.repPos >= 0) {
      const rp = this.repPos;
      if (rep[s]) {
        for (let y = 0; y < S; y++) {
          const c = doubleBefore[s * S + y];
          if (c) out += c * (this.sfbOf(rp, first[y]) - this.sfbOf(ls, first[y]));
        }
      }
      for (let c = 0; c < S; c++) {
        if (c === s || !rep[c]) continue;
        const n = doubleBefore[c * S + s];
        if (n) out += n * (this.sfbOf(rp, fs) - this.sfbOf(last[c], fs));
      }
    }
    return out;
  }

  /** What `pairsOf(a) + pairsOf(b)` counts twice. */
  private cross(a: number, b: number): number {
    const { S, first, last, rep } = this;
    const { bigram, doubleBefore } = this.sample;
    let out =
      bigram[a * S + b] * this.sfbOf(last[a], first[b]) +
      bigram[b * S + a] * this.sfbOf(last[b], first[a]);
    if (this.repPos >= 0) {
      const rp = this.repPos;
      if (rep[a]) {
        out += doubleBefore[a * S + b] * (this.sfbOf(rp, first[b]) - this.sfbOf(last[a], first[b]));
      }
      if (rep[b]) {
        out += doubleBefore[b * S + a] * (this.sfbOf(rp, first[a]) - this.sfbOf(last[b], first[a]));
      }
    }
    return out;
  }

  private partOf(a: number, b: number): { e: number; f: number; t: number } {
    let e = 0;
    let f = 0;
    let t = 0;
    if (a >= 0) {
      e += this.effortOf(a);
      f += this.pairsOf(a);
      t += this.tapsOf(a);
    }
    if (b >= 0) {
      e += this.effortOf(b);
      f += this.pairsOf(b);
      t += this.tapsOf(b);
    }
    if (a >= 0 && b >= 0) f -= this.cross(a, b);
    return { e, f, t };
  }

  recompute(): void {
    const { S } = this;
    let e = 0;
    let f = 0;
    let t = 0;
    for (let s = 0; s < S; s++) {
      e += this.effortOf(s);
      t += this.tapsOf(s);
      f += this.pairsOf(s);
    }
    // Every pair was counted once from each end.
    this.effortSum = e;
    this.oslTaps = t;
    this.sfbPairs = f / 2 + this.selfPairs();
  }

  /** `pairsOf` counts a symbol's pairs with itself once, not twice; put the other half back. */
  private selfPairs(): number {
    const { S, first, last } = this;
    let out = 0;
    for (let s = 0; s < S; s++) {
      const n = this.sample.bigram[s * S + s];
      if (n) out += (n * this.sfbOf(last[s], first[s])) / 2;
    }
    return out;
  }

  /**
   * Swap the contents of two slots and return what changed. Swapping back undoes it; the caller
   * decides after seeing the numbers.
   */
  swap(i: number, j: number): { dE: number; dF: number; dT: number } {
    const d = this.design;
    const a = d.occupant[i];
    const b = d.occupant[j];
    const before = this.partOf(a, b);
    d.occupant[i] = b;
    d.occupant[j] = a;
    if (a >= 0) {
      d.slotOf[a] = j;
      this.refresh(a);
    }
    if (b >= 0) {
      d.slotOf[b] = i;
      this.refresh(b);
    }
    const after = this.partOf(a, b);
    const delta = { dE: after.e - before.e, dF: after.f - before.f, dT: after.t - before.t };
    this.effortSum += delta.dE;
    this.sfbPairs += delta.dF;
    this.oslTaps += delta.dT;
    return delta;
  }
}
