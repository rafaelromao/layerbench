/**
 * Where the board draws each combo, as Keymap Drawer (github.com/caksoylar/keymap-drawer) does
 * for two neighbouring keys (`align: mid`): a small box on the middle of the gap between them. A
 * box narrows, its legend smaller, to fit its gap.
 *
 * Any other combo, on three or more keys or on keys apart, is not drawn on the board: it is drawn
 * apart, on a board of its own (Keymap Drawer's `draw_separate`), where no line has to cross the
 * board to reach its keys. So is one whose box, at its narrowest, would still cover another box or
 * a key's legend.
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

/**
 * A combo to place: the positions of its keys, and the size of its box, which may be drawn as
 * narrow as `minW`, its legend smaller, to fit its gap.
 */
export interface ComboToPlace {
  keys: readonly number[];
  w: number;
  h: number;
  minW?: number;
}

/** A combo's box on the board: its centre and its size. */
export interface PlacedCombo {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How far apart two caps' edges may be, across and down, for their keys to be neighbours: far
 * enough for keys side by side, one above the other, or diagonal across a stagger, and for the
 * inner keys of a split board's halves, drawn a third of a key apart.
 */
const NEAR = 26;
/** The step a box narrows by to fit its gap. */
const NARROW_STEP = 2;
/** A key's legend sits in the middle of its cap: a box may cover the cap's edge, not this far in. */
const LEGEND_INSET = 13;

/** Numbers in SVG, to two places. */
export function fmt(n: number): string {
  return n.toFixed(2);
}

function overlaps(a: PlacedCombo, b: PlacedCombo, pad = 0): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + pad && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + pad;
}

/** Whether a box covers the middle of a key's cap, where its legends are. */
export function coversLegend(box: PlacedCombo, k: PlacedKey): boolean {
  const r = Math.max(0, Math.min(k.w, k.h) / 2 - LEGEND_INSET);
  const dx = Math.max(0, Math.abs(box.x - k.cx) - box.w / 2);
  const dy = Math.max(0, Math.abs(box.y - k.cy) - box.h / 2);
  return dx * dx + dy * dy < r * r;
}

/** Two keys whose caps' edges are close, across and down. */
function neighbours(a: PlacedKey, b: PlacedKey): boolean {
  const apartX = Math.abs(a.cx - b.cx) - a.rx - b.rx;
  const apartY = Math.abs(a.cy - b.cy) - a.ry - b.ry;
  return apartX <= NEAR && apartY <= NEAR;
}

/**
 * Where each combo the board draws goes, by its place in `combos`; null for one it does not draw:
 * on three or more keys, on keys apart, with no room on its gap, or with a key not on the board.
 */
export function placeCombos(
  keys: readonly PlacedKey[],
  combos: readonly ComboToPlace[],
): (PlacedCombo | null)[] {
  const placed: PlacedCombo[] = [];
  return combos.map((c) => {
    const [a, b] = c.keys.map((p) => keys[p]);
    if (c.keys.length !== 2 || !a || !b || !neighbours(a, b)) return null;
    // Its own width first, then narrower, as far as its legend allows; clear of the legends in
    // the caps' middles and of the boxes before it.
    for (let w = c.w; w >= Math.min(c.w, c.minW ?? c.w); w -= NARROW_STEP) {
      const box = { x: (a.cx + b.cx) / 2, y: (a.cy + b.cy) / 2, w, h: c.h };
      if (placed.some((p) => overlaps(box, p, 1)) || keys.some((k) => coversLegend(box, k))) {
        continue;
      }
      placed.push(box);
      return box;
    }
    return null;
  });
}
