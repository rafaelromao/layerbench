import type { Page } from '@playwright/test';
import type { ImageLayer } from './image.ts';

/** A key of a board LayerBench draws: its centre, its legends and what it is. */
export interface BoardKey {
  id: string;
  x: number;
  y: number;
  tap: string;
  hold: string;
  trans: boolean;
  thumb: boolean;
}

/** The keys of the layer a board shows, as drawn in the page (`g[data-key]` in `Keyboard`). */
export function boardKeys(page: Page, boardId: string): Promise<BoardKey[]> {
  return page.evaluate((id) => {
    const text = (el: Element | null) => {
      if (!el) return '';
      const lines = [...el.querySelectorAll('tspan')].map((t) => t.textContent ?? '');
      return (lines.length > 0 ? lines.join(' ') : (el.textContent ?? '')).trim();
    };
    return [...document.querySelectorAll(`#${id} g[data-key]`)].map((g) => {
      const t = g.getAttribute('transform')?.match(/translate\(\s*([-\d.]+)[\s,]+([-\d.]+)/);
      return {
        id: g.getAttribute('data-key') ?? '',
        x: t ? Number(t[1]) : 0,
        y: t ? Number(t[2]) : 0,
        tap: text(g.querySelector('.lb-key-tap')),
        hold: text(g.querySelector('.lb-key-hold')),
        trans: g.classList.contains('lb-key-trans'),
        thumb: g.classList.contains('lb-key-thumb'),
      };
    });
  }, boardId);
}

/** How a layer LayerBench draws compares with the same layer in keymapdb's picture. */
export interface LayerScore {
  layer: string;
  /** The picture's layer it was held against, where its name is not the same. */
  against?: string;
  /** One-character legends (letters, digits, punctuation) the picture shows. */
  characters: number;
  /** Those the board shows nowhere on the layer. */
  missing: string[];
  /** Letters the picture shows, and those drawn on the other hand. */
  letters: number;
  otherHand: string[];
  /** Pairs of characters whose order, left to right or top to bottom, the picture decides. */
  pairs: number;
  /** Those the board puts the other way round. */
  reversed: string[];
  /** Those the board puts side by side, or one just above the other: under half a key apart. */
  flattened: string[];
  /** Keys that show a hold (a modifier, a layer), in the picture and on the board. */
  holds: { image: number; board: number };
}

const LETTER = /^\p{L}$/u;

/** A legend of one character, letters in lower case: what both drawings can be held to. */
function character(legend: string): string | null {
  const t = legend.trim();
  if ([...t].length !== 1) return null;
  return LETTER.test(t) ? t.toLowerCase() : t;
}

interface Placed {
  c: string;
  x: number;
  y: number;
}

/**
 * The characters drawn once each on a layer, where they are, and from every key of the layer
 * (`layer`), shown or not, the key size and the middle between the hands: a sparse layer must not
 * measure a key as the gap between the few keys it shows.
 */
function placed(keys: { tap: string; x: number; y: number }[], layer: { x: number; y: number }[]) {
  const all = keys.flatMap((k) => {
    const c = character(k.tap);
    return c === null ? [] : [{ c, x: k.x, y: k.y }];
  });
  const count = new Map<string, number>();
  for (const p of all) count.set(p.c, (count.get(p.c) ?? 0) + 1);
  // A key's size, from how far apart neighbouring keys are: the middle nearest distance.
  const near = layer
    .map((a) =>
      Math.min(...layer.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.y - b.y))),
    )
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const unit = near[Math.floor(near.length / 2)] || 1;
  const xs = layer.map((k) => k.x);
  const middle = (Math.min(...xs) + Math.max(...xs)) / 2;
  return {
    all,
    once: new Map(all.filter((p) => count.get(p.c) === 1).map((p) => [p.c, p] as [string, Placed])),
    unit,
    middle,
  };
}

/** Pairs closer than this, in key sizes, are side by side or one above the other: no order. */
const APART = 0.6;

/**
 * Hold a layer of the board against the picture's: which characters it lacks, which letters it
 * moves to the other hand, and which pairs it puts the other way round or flattens. Robust to
 * stagger and to scale: only the order of keys well apart counts.
 */
export function scoreLayer(name: string, board: BoardKey[], image: ImageLayer): LayerScore {
  const shown = image.keys.filter((k) => !k.marks.includes('trans') && !k.marks.includes('held'));
  const want = placed(shown, image.keys);
  const have = placed(
    board.filter((k) => !k.trans),
    board,
  );
  const left = have.all.map((p) => p.c);
  const missing: string[] = [];
  for (const p of want.all) {
    const at = left.indexOf(p.c);
    if (at < 0) missing.push(p.c);
    else left.splice(at, 1);
  }
  const letters = [...want.once.values()].filter((p) => LETTER.test(p.c));
  const otherHand = letters
    .filter((p) => {
      const q = have.once.get(p.c);
      return q && p.x < want.middle !== q.x < have.middle;
    })
    .map((p) => p.c);
  const both = [...want.once.values()].filter((p) => have.once.has(p.c));
  let pairs = 0;
  const reversed: string[] = [];
  const flattened: string[] = [];
  for (let i = 0; i < both.length; i++) {
    for (let j = i + 1; j < both.length; j++) {
      const [a, b] = [both[i], both[j]];
      const [qa, qb] = [have.once.get(a.c) as Placed, have.once.get(b.c) as Placed];
      for (const axis of ['x', 'y'] as const) {
        const d = (b[axis] - a[axis]) / want.unit;
        if (Math.abs(d) < APART) continue;
        pairs++;
        const e = (qb[axis] - qa[axis]) / have.unit;
        const pair = `${a.c}${axis === 'x' ? '↔' : '↕'}${b.c}`;
        if (Math.abs(e) < APART / 2) flattened.push(pair);
        else if (Math.sign(e) !== Math.sign(d)) reversed.push(pair);
      }
    }
  }
  return {
    layer: name,
    ...(image.name === name ? {} : { against: image.name }),
    characters: want.all.length,
    missing,
    letters: letters.length,
    otherHand,
    pairs,
    reversed,
    flattened,
    holds: {
      image: shown.filter((k) => k.hold.trim() !== '').length,
      board: board.filter((k) => !k.trans && k.hold.trim() !== '').length,
    },
  };
}
