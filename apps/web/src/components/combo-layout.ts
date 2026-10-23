/**
 * Where the board draws each combo, as Keymap Drawer (github.com/caksoylar/keymap-drawer) does:
 * a small box on the gap between neighbouring keys, and the rest above or below the board, with
 * thin lines, its dendrons, out to each key.
 *
 * Keymap Drawer leaves the placing to its user, combo by combo (`align`, `offset`); the board has
 * no one to ask, so it places them by these rules:
 * - Two neighbouring keys: on the middle of the gap between them (`align: mid`), no lines.
 * - Three or more keys side by side in a row: on the gap above the row (`align: top`), with a
 *   line down into each key.
 * - Any other combo: on the middle of its keys if that is clear of every key, as between the two
 *   halves of a split board, with straight lines out to them; otherwise outside the board, above
 *   or below it, whichever side its keys are nearer, with lines that run across, then down or up
 *   into each key. Boxes outside sit in rows, each as near its keys as the others leave room for.
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

/**
 * `mid` is between its keys, `top` and `bottom` above or below them, as Keymap Drawer's `align`
 * names them.
 */
export type ComboAlign = 'mid' | 'top' | 'bottom';

export interface PlacedCombo {
  /** The centre of its box, and the box's size. */
  x: number;
  y: number;
  w: number;
  h: number;
  align: ComboAlign;
  /** Drawn outside the board, in a row above or below it. */
  outside: boolean;
  /** The lines out to its keys, as SVG path data. */
  dendrons: string[];
}

export interface PlacementOptions {
  /** The width of the drawing: no box goes past either side of it. */
  width: number;
  /** The gap between neighbouring caps. */
  gap: number;
  /** The radius of a dendron's bend (Keymap Drawer's `arc_radius`). */
  arcRadius?: number;
}

/**
 * How far apart two caps' edges may be, across and down, for their keys to be neighbours: far
 * enough for keys side by side, one above the other, or diagonal across a stagger, and for the
 * inner keys of a split board's halves, drawn a third of a key apart.
 */
const NEAR = 26;
/** Room between the board and the first row outside it. */
const ROW_GAP = 10;
/** Room between two boxes, along a row and from one row to the next. */
const SPACING = 4;
/**
 * How far a box outside may slide along its row, to make room, before it takes a new row: as far
 * as its rightmost key, where its lines are no longer than from its middle, or this far past its
 * middle, whichever is further.
 */
const MAX_SLIDE = 48;
/** How far inside a cap's edge a dendron runs past the keys on its way. */
const EDGE = 5;
/** The step a box on a row's gap slides along it to clear another box (Keymap Drawer's `slide`). */
const SLIDE_STEP = 4;
/**
 * A key's legend sits in the middle of its cap: a box may cover the cap's edge, but not this far
 * in from it.
 */
const LEGEND_INSET = 13;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: Box, b: Box, pad = 0): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + pad && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + pad;
}

/** Whether a box covers the middle of a key's cap, where its legends are. */
export function coversLegend(box: Box, k: PlacedKey): boolean {
  const r = Math.max(0, Math.min(k.w, k.h) / 2 - LEGEND_INSET);
  const dx = Math.max(0, Math.abs(box.x - k.cx) - box.w / 2);
  const dy = Math.max(0, Math.abs(box.y - k.cy) - box.h / 2);
  return dx * dx + dy * dy < r * r;
}

/** Whether a box touches a key's cap at all. */
function touchesKey(box: Box, k: PlacedKey): boolean {
  return overlaps(box, { x: k.cx, y: k.cy, w: 2 * k.rx, h: 2 * k.ry }, 1);
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

function fmt(n: number): string {
  return n.toFixed(2);
}

/**
 * A dendron from a box beside its keys to one of them, as Keymap Drawer draws it: across first,
 * then a bend, then up or down to the key, stopping `shorten` short of its centre. Too little
 * across for a bend, it runs straight.
 */
function arcDendron(
  from: { x: number; y: number },
  to: { x: number; y: number },
  shorten: number,
  radius: number,
): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) < radius) return lineDendron(from, to, shorten);
  const ax = Math.sign(dx) * radius;
  const ay = Math.sign(dy) * radius;
  // Keymap Drawer's sweep: clockwise when across and down turn the same way.
  const sweep = dx > 0 === dy > 0 ? 1 : 0;
  return (
    `M ${fmt(from.x)} ${fmt(from.y)} h ${fmt(dx - ax)} ` +
    `a ${fmt(radius)} ${fmt(radius)} 0 0 ${sweep} ${fmt(ax)} ${fmt(ay)} ` +
    `v ${fmt(dy - ay - Math.sign(dy) * shorten)}`
  );
}

/** A straight dendron, stopping `shorten` short of the key's centre. */
function lineDendron(
  from: { x: number; y: number },
  to: { x: number; y: number },
  shorten: number,
): string {
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (shorten > 0 && shorten < length) {
    dx *= 1 - shorten / length;
    dy *= 1 - shorten / length;
  }
  return `M ${fmt(from.x)} ${fmt(from.y)} l ${fmt(dx)} ${fmt(dy)}`;
}

/** Whether a line straight up or down at `x`, from `y0` to `y1`, runs over another key's legend. */
function crossesLegend(
  x: number,
  y0: number,
  y1: number,
  own: PlacedKey,
  keys: readonly PlacedKey[],
): boolean {
  const line = { x, y: (y0 + y1) / 2, w: 0, h: Math.abs(y1 - y0) };
  return keys.some((k) => k !== own && coversLegend(line, k));
}

/**
 * Keymap Drawer's dendrons from a box above or below its keys: across, then up or down into each
 * key, stopping short of its centre. Where that would run over the legend of a key on the way,
 * the line runs along the edge of the caps, on the box's side, and stops level with the middle of
 * its own key, beside the legend.
 */
function sideDendrons(
  box: Box,
  ks: readonly PlacedKey[],
  keys: readonly PlacedKey[],
  radius: number,
): string[] {
  return ks.map((k) => {
    // A key right by the box is met near its edge; the others a third of the way in.
    const close =
      Math.abs(k.cx - box.x) < box.w / 2 && Math.abs(k.cy - box.y) <= k.h / 3 + box.h / 2;
    const shorten = close ? k.h / 5 : k.h / 3;
    const straight = () => arcDendron(box, { x: k.cx, y: k.cy }, shorten, radius);
    const end = k.cy + Math.sign(box.y - k.cy) * shorten;
    if (!crossesLegend(k.cx, box.y, end, k, keys)) return straight();
    for (const side of box.x < k.cx ? [-1, 1] : [1, -1]) {
      const x = k.cx + side * (k.w / 2 - EDGE);
      if (!crossesLegend(x, box.y, k.cy, k, keys)) {
        return arcDendron(box, { x, y: k.cy }, 0, radius);
      }
    }
    return straight();
  });
}

/** Keymap Drawer's dendrons from a box between its keys, to those a key's width or more away. */
function midDendrons(box: Box, ks: readonly PlacedKey[]): string[] {
  return ks
    .filter((k) => Math.hypot(k.cx - box.x, k.cy - box.y) >= k.w - 1)
    .map((k) => lineDendron(box, { x: k.cx, y: k.cy }, k.w / 3));
}

/**
 * Where each combo goes, by its place in `combos`; null for one with none of its keys on the
 * board. Boxes outside the board lie above the keys' top edge or below their bottom edge.
 */
export function placeCombos(
  keys: readonly PlacedKey[],
  combos: readonly ComboToPlace[],
  { width, gap, arcRadius = 6 }: PlacementOptions,
): (PlacedCombo | null)[] {
  const out: (PlacedCombo | null)[] = combos.map(() => null);
  const placed: Box[] = [];
  const top = Math.min(...keys.map((k) => k.cy - k.ry));
  const bottom = Math.max(...keys.map((k) => k.cy + k.ry));
  // The middle of the board, by where its keys are: a combo above it goes over the board.
  const middle = keys.reduce((sum, k) => sum + k.cy, 0) / Math.max(1, keys.length);
  const keysOf = (c: ComboToPlace) => c.keys.flatMap((p) => (keys[p] ? [keys[p]] : []));
  const centre = (ks: readonly PlacedKey[]) => ({
    x: ks.reduce((sum, k) => sum + k.cx, 0) / ks.length,
    y: ks.reduce((sum, k) => sum + k.cy, 0) / ks.length,
  });
  // A box may cover the edges of caps, but not the legends in their middle, nor another box.
  const clear = (box: Box) =>
    !placed.some((b) => overlaps(box, b, 1)) && !keys.some((k) => coversLegend(box, k));

  const outside: {
    i: number;
    ks: PlacedKey[];
    /** Over the middle of its keys, and as far along as it may slide. */
    at: number;
    upTo: number;
    side: 'top' | 'bottom';
  }[] = [];

  // Neighbours first, on their gap: they are most of a layout's combos, and have nowhere else
  // as near to go.
  combos.forEach((c, i) => {
    const ks = keysOf(c);
    if (ks.length !== 2 || !neighbours(ks[0], ks[1])) return;
    const box = { ...centre(ks), w: c.w, h: c.h };
    if (!clear(box)) return;
    placed.push(box);
    out[i] = { ...box, align: 'mid', outside: false, dendrons: [] };
  });

  combos.forEach((c, i) => {
    if (out[i]) return;
    const ks = keysOf(c);
    if (ks.length === 0) return;
    const mid = centre(ks);
    if (inRow(ks)) {
      // On the gap above the row, unless the row is the board's top one; slid along it, as far
      // as its end keys, to clear another box.
      const edge = Math.min(...ks.map((k) => k.cy - k.ry));
      const reach = Math.max(...ks.map((k) => Math.abs(k.cx - mid.x)));
      for (let slide = 0; edge - top > gap && slide <= reach; slide += SLIDE_STEP) {
        const box = [-1, 1]
          .map((side) => ({ x: mid.x + side * slide, y: edge - gap / 2, w: c.w, h: c.h }))
          .find(clear);
        if (!box) continue;
        placed.push(box);
        out[i] = {
          ...box,
          align: 'top',
          outside: false,
          dendrons: sideDendrons(box, ks, keys, arcRadius),
        };
        return;
      }
    } else if (ks.length >= 2) {
      // Between keys far apart, where nothing else is.
      const box = { ...mid, w: c.w, h: c.h };
      if (clear(box) && !keys.some((k) => touchesKey(box, k))) {
        placed.push(box);
        out[i] = { ...box, align: 'mid', outside: false, dendrons: midDendrons(box, ks) };
        return;
      }
    }
    outside.push({
      i,
      ks,
      at: mid.x,
      upTo: Math.max(mid.x + MAX_SLIDE, ...ks.map((k) => k.cx)),
      side: mid.y < middle ? 'top' : 'bottom',
    });
  });

  // Rows outside: each box as near over its keys as the boxes before it in the row leave room
  // for, and a new row, further out, when that is too far.
  for (const side of ['top', 'bottom'] as const) {
    const these = outside.filter((o) => o.side === side).sort((a, b) => a.at - b.at || a.i - b.i);
    if (these.length === 0) continue;
    const pitch = Math.max(...these.map((o) => combos[o.i].h)) + SPACING;
    const rows: number[] = [];
    for (const o of these) {
      const { w, h } = combos[o.i];
      const lo = w / 2;
      const hi = width - w / 2;
      const wanted = Math.min(hi, Math.max(lo, o.at));
      let row = 0;
      let x = wanted;
      for (; ; row++) {
        const after = rows[row] === undefined ? lo : rows[row] + SPACING + w / 2;
        x = Math.max(wanted, after);
        if (x <= Math.min(hi, o.upTo)) break;
        // A box wider than the drawing still gets a row of its own.
        if (rows[row] === undefined) {
          x = wanted;
          break;
        }
      }
      rows[row] = x + w / 2;
      const offset = ROW_GAP + pitch * row + pitch / 2;
      const box = { x, y: side === 'top' ? top - offset : bottom + offset, w, h };
      out[o.i] = {
        ...box,
        align: side,
        outside: true,
        dendrons: sideDendrons(box, o.ks, keys, arcRadius),
      };
    }
  }

  return out;
}
