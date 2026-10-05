import { unpackBigram, unpackTrigram } from './tables.js';

/** How a table's entries are keyed: one logical key, a pair, or three. */
export type IndexedShape = 1 | 2 | 3;

/** A table's entries, in its own order, and the ones that pass through each logical key. */
export interface TableIndex {
  readonly keys: readonly number[];
  readonly counts: readonly number[];
  /** Ordinals of the entries with this logical key in them, in table order, each once. */
  through(id: number): readonly number[];
}

const NONE: readonly number[] = [];
const built = new WeakMap<Map<number, number>, TableIndex>();

/**
 * Index an n-gram table by the logical keys in its entries, the first time it is asked for. Kept
 * with the table, so a report re-scored or estimated over the same tables shares it, and it goes
 * when they do.
 */
export function tableIndex(table: Map<number, number>, shape: IndexedShape): TableIndex {
  const hit = built.get(table);
  if (hit) return hit;
  const keys: number[] = [];
  const counts: number[] = [];
  const byId = new Map<number, number[]>();
  const add = (id: number, ordinal: number) => {
    const list = byId.get(id);
    if (!list) byId.set(id, [ordinal]);
    else if (list[list.length - 1] !== ordinal) list.push(ordinal);
  };
  for (const [key, count] of table) {
    const ordinal = keys.length;
    keys.push(key);
    counts.push(count);
    if (shape === 1) add(key, ordinal);
    else if (shape === 2) {
      const [a, b] = unpackBigram(key);
      add(a, ordinal);
      add(b, ordinal);
    } else {
      const [a, b, c] = unpackTrigram(key);
      add(a, ordinal);
      add(b, ordinal);
      add(c, ordinal);
    }
  }
  const index: TableIndex = { keys, counts, through: (id) => byId.get(id) ?? NONE };
  built.set(table, index);
  return index;
}
