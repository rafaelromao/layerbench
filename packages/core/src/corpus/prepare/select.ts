/**
 * Which lines of the lines a source gives go into a corpus: each repository its share, in an order
 * that looks random and never changes, so the same sources always make the same text.
 */

/** 32-bit FNV-1a of a text: a line's place, and the order its repository's lines come in. */
export function placeOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Member {
  key: string;
  /** What it is due, relative to the others. */
  weight: number;
  /** The most it can give. */
  available: number;
}

/**
 * Splits `total` among the members by weight, none above what it has: what a short one cannot give
 * is shared among the rest, so a corpus is not smaller because one source was.
 */
export function allocate(total: number, members: Member[]): Map<string, number> {
  const given = new Map(members.map((m) => [m.key, 0]));
  let left = total;
  for (;;) {
    const open = members.filter((m) => m.weight > 0 && (given.get(m.key) ?? 0) < m.available);
    if (left <= 0 || open.length === 0) break;
    const weight = open.reduce((sum, m) => sum + m.weight, 0);
    let spent = 0;
    for (const m of open) {
      const have = given.get(m.key) ?? 0;
      const take = Math.min(m.available - have, Math.floor((left * m.weight) / weight));
      given.set(m.key, have + take);
      spent += take;
    }
    if (spent === 0) break;
    left -= spent;
  }
  return given;
}

/** What a line costs in a corpus: its bytes, and the space that joins it to the next. */
export function lineCost(line: string): number {
  return new TextEncoder().encode(line).length + 1;
}

/** The lines of one source, whole, in the order of their places, until the budget is spent. */
export function takeLines(lines: { text: string; place: number }[], budget: number): string[] {
  const out: string[] = [];
  let spent = 0;
  const ordered = [...lines].sort((a, b) => a.place - b.place || (a.text < b.text ? -1 : 1));
  for (const { text } of ordered) {
    const cost = lineCost(text);
    if (spent + cost > budget) continue;
    out.push(text);
    spent += cost;
  }
  return out;
}
