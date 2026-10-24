/**
 * Where the board draws each combo, as Keymap Drawer (github.com/caksoylar/keymap-drawer) does
 * for keys side by side: a small box on the gap between them.
 * - Two neighbouring keys: on the middle of the gap between them (`align: mid`), no lines.
 * - Three or more keys side by side in a row: on the gap above the row (`align: top`), slid along
 *   it to clear another box (`slide`), with a short line down into each key.
 *
 * Any other combo, on keys apart, is not drawn on the board: it is drawn apart, on a board of its
 * own (Keymap Drawer's `draw_separate`), where lines across the board cannot be mistaken for one
 * another. So is one whose box would cover another box or a key's legend.
 *
 * Everything is in the board drawing's own units, the ones its keys are drawn in.
 */

/** A key as the board draws it. */
export interface PlacedKey {
  cx: number;
  cy: number;
  /** The size of its cap, unturned. */
  w: number;
  h: number;
  /** How far the cap reaches from its centre, across and down, turned the way it is drawn. */
  rx: number;
  ry: number;
}

/** A combo to place: the positions of its keys, and the size of its box. */
export interface ComboToPlace {
  keys: readonly number[];
  w: number;
  h: number;
}

/** `mid` is between its keys, `top` on the gap above them, as Keymap Drawer's `align` names them. */
export type ComboAlign = 'mid' | 'top';

/** A line from a combo's box into one of its keys: the key's position, and SVG path data. */
export interface ComboLine {
  key: number;
  path: string;
}

export interface PlacedCombo {
  /** The centre of its box, and the box's size. */
  x: number;
  y: number;
  w: number;
  h: number;
  align: ComboAlign;
  lines: ComboLine[];
}

export interface PlacementOptions {
  /** The gap between neighbouring caps. */
  gap: number;
  /** The radius of a line's bend (Keymap Drawer's `arc_radius`). */
  arcRadius?: number;
}

interface Point {
  x: number;
  y: number;
}

interface Box extends Point {
  w: number;
  h: number;
}

/**
 * How far apart two caps' edges may be, across and down, for their keys to be neighbours: far
 * enough for keys side by side, one above the other, or diagonal across a stagger, and for the
 * inner keys of a split board's halves, drawn a third of a key apart.
 */
const NEAR = 26;
/** The step a box on a row's gap slides along it to clear another box (Keymap Drawer's `slide`). */
const SLIDE_STEP = 4;
/**
 * A key's legend sits in the middle of its cap: a box may cover the cap's edge, but not this far
 * in from it, and a line may not cross it.
 */
const LEGEND_INSET = 13;

/** Numbers in SVG, to two places. */
export function fmt(n: number): string {
  return n.toFixed(2);
}

function overlaps(a: Box, b: Box, pad = 0): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + pad && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + pad;
}

function legendRadius(k: PlacedKey): number {
  return Math.max(0, Math.min(k.w, k.h) / 2 - LEGEND_INSET);
}

/** Whether a box covers the middle of a key's cap, where its legends are. */
export function coversLegend(box: Box, k: PlacedKey): boolean {
  const r = legendRadius(k);
  const dx = Math.max(0, Math.abs(box.x - k.cx) - box.w / 2);
  const dy = Math.max(0, Math.abs(box.y - k.cy) - box.h / 2);
  return dx * dx + dy * dy < r * r;
}

/** Whether a line from `a` to `b` runs over the middle of a key's cap, where its legends are. */
function lineCrossesLegend(a: Point, b: Point, k: PlacedKey): boolean {
  const r = legendRadius(k);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t =
    length === 0 ? 0 : Math.max(0, Math.min(1, ((k.cx - a.x) * dx + (k.cy - a.y) * dy) / length));
  return Math.hypot(a.x + t * dx - k.cx, a.y + t * dy - k.cy) < r;
}

/** Whether a line from `a` to `b` runs under a box: the part of it inside the box, clipped. */
function lineUnderBox(a: Point, b: Point, box: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const d = { x: b.x - a.x, y: b.y - a.y };
  const sides: [number, number][] = [
    [-d.x, a.x - (box.x - box.w / 2)],
    [d.x, box.x + box.w / 2 - a.x],
    [-d.y, a.y - (box.y - box.h / 2)],
    [d.y, box.y + box.h / 2 - a.y],
  ];
  for (const [p, q] of sides) {
    if (p === 0) {
      if (q <= 0) return false;
    } else if (p < 0) {
      t0 = Math.max(t0, q / p);
    } else {
      t1 = Math.min(t1, q / p);
    }
  }
  return t0 < t1;
}

/** Two keys whose caps' edges are close, across and down. */
function neighbours(a: PlacedKey, b: PlacedKey): boolean {
  const apartX = Math.abs(a.cx - b.cx) - a.rx - b.rx;
  const apartY = Math.abs(a.cy - b.cy) - a.ry - b.ry;
  return apartX <= NEAR && apartY <= NEAR;
}

/** Three or more keys side by side, each the next one's neighbour, along one row. */
function inRow(ks: readonly PlacedKey[]): boolean {
  if (ks.length < 3) return false;
  const sorted = [...ks].sort((a, b) => a.cx - b.cx);
  return sorted.every(
    (k, i) =>
      i === 0 ||
      (neighbours(sorted[i - 1], k) &&
        Math.abs(k.cy - sorted[i - 1].cy) < Math.min(k.h, sorted[i - 1].h) / 2),
  );
}

/** A line through `points`, its bends rounded to `radius`, or less where a leg is short. */
function pathThrough(points: readonly Point[], radius: number): string {
  const ps = points.filter(
    (p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 0.01,
  );
  let d = `M ${fmt(ps[0].x)} ${fmt(ps[0].y)}`;
  for (let i = 1; i < ps.length; i++) {
    const [a, p, b] = [ps[i - 1], ps[i], ps[i + 1]];
    if (!b) {
      d += ` L ${fmt(p.x)} ${fmt(p.y)}`;
      break;
    }
    const inLeg = Math.hypot(p.x - a.x, p.y - a.y);
    const outLeg = Math.hypot(b.x - p.x, b.y - p.y);
    const r = Math.min(radius, inLeg / 2, outLeg / 2);
    const from = { x: p.x - ((p.x - a.x) * r) / inLeg, y: p.y - ((p.y - a.y) * r) / inLeg };
    const to = { x: p.x + ((b.x - p.x) * r) / outLeg, y: p.y + ((b.y - p.y) * r) / outLeg };
    d += ` L ${fmt(from.x)} ${fmt(from.y)} Q ${fmt(p.x)} ${fmt(p.y)} ${fmt(to.x)} ${fmt(to.y)}`;
  }
  return d;
}

/**
 * Where each combo the board draws goes, by its place in `combos`; null for one it does not draw,
 * on keys apart, or with no room on its gap, or none of its keys on the board.
 */
export function placeCombos(
  keys: readonly PlacedKey[],
  combos: readonly ComboToPlace[],
  { gap, arcRadius = 6 }: PlacementOptions,
): (PlacedCombo | null)[] {
  const out: (PlacedCombo | null)[] = combos.map(() => null);
  const placed: Box[] = [];
  const top = Math.min(...keys.map((k) => k.cy - k.ry));
  const positionsOf = (c: ComboToPlace) => c.keys.filter((p) => keys[p] !== undefined);
  const centre = (ps: readonly number[]) => ({
    x: ps.reduce((sum, p) => sum + keys[p].cx, 0) / ps.length,
    y: ps.reduce((sum, p) => sum + keys[p].cy, 0) / ps.length,
  });
  // A box may cover the edges of caps, but not the legends in their middle, nor another box.
  const clear = (box: Box) =>
    !placed.some((b) => overlaps(box, b, 1)) && !keys.some((k) => coversLegend(box, k));

  /**
   * Keymap Drawer's line from a box on the gap above a row into one of its keys: across the gap,
   * a bend, and down, stopping a third of the way short of the key's centre, or a fifth for a key
   * right under the box; none if it would cross a legend or a box.
   */
  const lineDown = (box: Box, p: number): ComboLine | null => {
    const k = keys[p];
    const close =
      Math.abs(k.cx - box.x) < box.w / 2 && Math.abs(k.cy - box.y) <= k.h / 3 + box.h / 2;
    const corners = [
      { x: box.x, y: box.y },
      { x: k.cx, y: box.y },
      { x: k.cx, y: k.cy - (close ? k.h / 5 : k.h / 3) },
    ];
    const crosses = corners.slice(1).some((b, j) => {
      const a = corners[j];
      return (
        keys.some((other) => other !== k && lineCrossesLegend(a, b, other)) ||
        placed.some((other) => lineUnderBox(a, b, other))
      );
    });
    return crosses ? null : { key: p, path: pathThrough(corners, arcRadius) };
  };

  // Neighbours first, on their gap: they are most of a layout's combos.
  combos.forEach((c, i) => {
    const ps = positionsOf(c);
    if (ps.length !== 2 || !neighbours(keys[ps[0]], keys[ps[1]])) return;
    const box = { ...centre(ps), w: c.w, h: c.h };
    if (!clear(box)) return;
    placed.push(box);
    out[i] = { ...box, align: 'mid', lines: [] };
  });

  // Then rows: on the gap above the row, unless the row is the board's top one; slid along it,
  // as far as its end keys, to clear another box; with lines that cross no legend and no box.
  combos.forEach((c, i) => {
    const ps = positionsOf(c);
    if (out[i] || !inRow(ps.map((p) => keys[p]))) return;
    const mid = centre(ps);
    const edge = Math.min(...ps.map((p) => keys[p].cy - keys[p].ry));
    const reach = Math.max(...ps.map((p) => Math.abs(keys[p].cx - mid.x)));
    for (let slide = 0; edge - top > gap && slide <= reach; slide += SLIDE_STEP) {
      for (const side of [-1, 1]) {
        const box = { x: mid.x + side * slide, y: edge - gap / 2, w: c.w, h: c.h };
        if (!clear(box)) continue;
        const lines = ps.map((p) => lineDown(box, p));
        if (lines.some((l) => l === null)) continue;
        placed.push(box);
        out[i] = { ...box, align: 'top', lines: lines as ComboLine[] };
        return;
      }
    }
  });

  return out;
}
