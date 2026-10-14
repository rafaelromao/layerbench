import type { KeyEvent, KeyKind } from '../sim/machine.js';

/**
 * The press log: everything typing a text on a layout pressed. Each press once, with what it did;
 * how often each came, alone and in pairs, trigrams and skipgrams within a word; and what was
 * pressed next. The resolver records it, and everything that reads a typing reads it here.
 */

/** A press's place in the log: dense, from 0, in the order the presses were first made. */
export type PressId = number;

/** Whether the space bar's presses are in the n-grams: the rule sets' `universe`. */
export type Universe = 'no_space' | 'with_space';

export type Shape = 'unigram' | 'bigram' | 'trigram' | 'skip1' | 'skip2' | 'skip3';

/** One key, or one combo, pressed on a layer, with what it did. */
export interface Press {
  readonly id: PressId;
  readonly layer: number;
  /** Position index: a physical key, or a combo's own position. */
  readonly pos: number;
  readonly kind: KeyKind;
  /** What the board draws for it: what it typed, else the layer or modifier it gives. */
  readonly label: string;
  /** The layer it was pressed to reach, if it typed nothing and turned one on. */
  readonly reaches: number | null;
}

/**
 * One shape of n-gram in one universe. Entry `i` is the presses `ids[i * n]` to `ids[i * n + n - 1]`
 * in the order they were pressed, made `counts[i]` times. Entries come in the order each was first
 * made, so sums over them and ties between them come out the same every time.
 */
export interface Ngrams {
  readonly n: 1 | 2 | 3;
  readonly size: number;
  readonly ids: Uint16Array;
  readonly counts: Float64Array;
  /** What the layout made: the sum of the counts. */
  readonly total: number;
  /** What the text has, as if every character took one press. */
  readonly textTotal: number;
  /** The entries with this press in them, ascending, each once. */
  through(id: PressId): readonly number[];
}

export interface PressLog {
  /** Indexed by id. */
  readonly presses: readonly Press[];
  ngrams(universe: Universe, shape: Shape): Ngrams;
  /**
   * What was pressed right after one press, or right after two in a row, and how often, in the
   * order each follower first came.
   */
  next(
    universe: Universe,
    after: readonly [PressId] | readonly [PressId, PressId],
  ): ReadonlyMap<PressId, number>;
  /**
   * The same log with the keys at two positions of one layer trading places: what a swap of two
   * keys that type alike would have pressed. Shares everything else with this log.
   */
  moved(layer: number, posA: number, posB: number): PressLog;
}

/** Recording a press log as a text is typed. Used by the resolver alone. */
export interface PressRecorder {
  /** Record a press, in both universes or with space only (a space, or a press made for one). */
  press(ev: KeyEvent, into: 'both' | 'with_space'): PressId;
  /** A character of the text, for the text's own totals. */
  symbol(into: 'both' | 'with_space'): void;
  /** Nothing before this pairs with anything after it, in this universe. */
  boundary(universe: Universe): void;
  /** The log as recorded. Recording after this throws. */
  seal(): PressLog;
}

const BITS = 10;
/** Presses one log can hold: ids are packed `BITS` to a press. */
const MAX_PRESSES = 1 << BITS;
const MASK = MAX_PRESSES - 1;

export const SHAPES: readonly Shape[] = ['unigram', 'bigram', 'trigram', 'skip1', 'skip2', 'skip3'];
const ARITY: Record<Shape, 1 | 2 | 3> = {
  unigram: 1,
  bigram: 2,
  trigram: 3,
  skip1: 2,
  skip2: 2,
  skip3: 2,
};

/** Counts per shape, keyed by the packed presses, in the order each entry was first made. */
type Counts = Record<Shape, Map<number, number>>;
type Totals = Record<Shape, number>;

function zeroTotals(): Totals {
  return { unigram: 0, bigram: 0, trigram: 0, skip1: 0, skip2: 0, skip3: 0 };
}

function inc(m: Map<number, number>, k: number): void {
  m.set(k, (m.get(k) ?? 0) + 1);
}

/** One universe's n-grams, counted as presses stream in. */
class Stream {
  readonly counts: Counts = {
    unigram: new Map(),
    bigram: new Map(),
    trigram: new Map(),
    skip1: new Map(),
    skip2: new Map(),
    skip3: new Map(),
  };
  readonly totals = zeroTotals();
  readonly text = zeroTotals();
  private buf: number[] = [];
  private run = 0;

  press(id: number): void {
    const c = this.counts;
    const t = this.totals;
    const b = this.buf;
    const n = b.length;
    inc(c.unigram, id);
    t.unigram++;
    if (n >= 1) {
      inc(c.bigram, (b[n - 1] << BITS) | id);
      t.bigram++;
    }
    if (n >= 2) {
      inc(c.trigram, (b[n - 2] << (2 * BITS)) | (b[n - 1] << BITS) | id);
      t.trigram++;
      inc(c.skip1, (b[n - 2] << BITS) | id);
      t.skip1++;
    }
    if (n >= 3) {
      inc(c.skip2, (b[n - 3] << BITS) | id);
      t.skip2++;
    }
    if (n >= 4) {
      inc(c.skip3, (b[n - 4] << BITS) | id);
      t.skip3++;
    }
    b.push(id);
    if (b.length > 8) b.splice(0, b.length - 5);
  }

  symbol(): void {
    const t = this.text;
    const n = this.run;
    t.unigram++;
    if (n >= 1) t.bigram++;
    if (n >= 2) {
      t.trigram++;
      t.skip1++;
    }
    if (n >= 3) t.skip2++;
    if (n >= 4) t.skip3++;
    this.run++;
  }

  boundary(): void {
    this.buf.length = 0;
    this.run = 0;
  }
}

const NONE: readonly number[] = [];

function unpackInto(key: number, n: 1 | 2 | 3, ids: Uint16Array, at: number): void {
  if (n === 1) ids[at] = key;
  else if (n === 2) {
    ids[at] = key >>> BITS;
    ids[at + 1] = key & MASK;
  } else {
    ids[at] = key >>> (2 * BITS);
    ids[at + 1] = (key >>> BITS) & MASK;
    ids[at + 2] = key & MASK;
  }
}

function columns(
  counts: Map<number, number>,
  n: 1 | 2 | 3,
  total: number,
  textTotal: number,
): Ngrams {
  const size = counts.size;
  const ids = new Uint16Array(size * n);
  const values = new Float64Array(size);
  let i = 0;
  for (const [key, count] of counts) {
    unpackInto(key, n, ids, i * n);
    values[i] = count;
    i++;
  }
  let byId: Map<number, number[]> | null = null;
  const through = (id: PressId): readonly number[] => {
    if (!byId) {
      byId = new Map();
      for (let e = 0; e < size; e++) {
        for (let j = 0; j < n; j++) {
          const p = ids[e * n + j];
          const list = byId.get(p);
          if (!list) byId.set(p, [e]);
          else if (list[list.length - 1] !== e) list.push(e);
        }
      }
    }
    return byId.get(id) ?? NONE;
  };
  return { n, size, ids, counts: values, total, textTotal, through };
}

/** What every log moved from one recording shares: the counts, and what was built from them. */
class Store {
  private readonly built = new Map<string, Ngrams>();
  private readonly followers = new Map<string, ReadonlyMap<PressId, number>>();

  constructor(private readonly streams: Record<Universe, Stream>) {}

  ngrams(universe: Universe, shape: Shape): Ngrams {
    const key = `${universe}|${shape}`;
    let hit = this.built.get(key);
    if (!hit) {
      const s = this.streams[universe];
      hit = columns(s.counts[shape], ARITY[shape], s.totals[shape], s.text[shape]);
      this.built.set(key, hit);
    }
    return hit;
  }

  next(
    universe: Universe,
    after: readonly [PressId] | readonly [PressId, PressId],
  ): ReadonlyMap<PressId, number> {
    const key = `${universe}|${after.join(',')}`;
    let hit = this.followers.get(key);
    if (!hit) {
      const out = new Map<PressId, number>();
      const g = this.ngrams(universe, after.length === 1 ? 'bigram' : 'trigram');
      const n = g.n;
      const last = after[after.length - 1];
      for (const e of g.through(last)) {
        const at = e * n;
        if (after.some((id, j) => g.ids[at + j] !== id)) continue;
        const follower = g.ids[at + n - 1];
        out.set(follower, (out.get(follower) ?? 0) + g.counts[e]);
      }
      hit = out;
      this.followers.set(key, hit);
    }
    return hit;
  }
}

function logOf(presses: readonly Press[], store: Store): PressLog {
  return {
    presses,
    ngrams: (universe, shape) => store.ngrams(universe, shape),
    next: (universe, after) => store.next(universe, after),
    moved: (layer, posA, posB) =>
      logOf(
        presses.map((p) =>
          p.layer !== layer
            ? p
            : p.pos === posA
              ? { ...p, pos: posB }
              : p.pos === posB
                ? { ...p, pos: posA }
                : p,
        ),
        store,
      ),
  };
}

export function recordPresses(): PressRecorder {
  const presses: Press[] = [];
  const index = new Map<string, PressId>();
  const streams: Record<Universe, Stream> = { no_space: new Stream(), with_space: new Stream() };
  let sealed = false;
  const open = () => {
    if (sealed) throw new Error('The press log is sealed');
  };
  return {
    press(ev, into) {
      open();
      const identity = `${ev.layer}|${ev.pos}|${ev.keyKind}|${ev.label}|${ev.reaches}`;
      let id = index.get(identity);
      if (id === undefined) {
        id = presses.length;
        if (id >= MAX_PRESSES) throw new Error('Too many presses');
        presses.push({
          id,
          layer: ev.layer,
          pos: ev.pos,
          kind: ev.keyKind,
          label: ev.label,
          reaches: ev.reaches,
        });
        index.set(identity, id);
      }
      streams.with_space.press(id);
      if (into === 'both') streams.no_space.press(id);
      return id;
    },
    symbol(into) {
      open();
      streams.with_space.symbol();
      if (into === 'both') streams.no_space.symbol();
    },
    boundary(universe) {
      open();
      streams[universe].boundary();
    },
    seal() {
      open();
      sealed = true;
      return logOf(presses, new Store(streams));
    },
  };
}
