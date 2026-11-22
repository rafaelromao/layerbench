import { eachGrapheme, textWidth } from '../components/fit-label.js';
import type { Credit } from './credits.js';
import { plain } from './plain-text.js';
import type { SummaryCell } from './summary.js';

/**
 * The image LayerBench makes to be shared where a link will not do (a post, a chat): a card with
 * each layout's name and credits, its first layer drawn as the page draws it, with its heat, the
 * scale of that heat, and what the numbers were made on.
 *
 * The board is copied from the page, not drawn again: the keys, legends and combos are those of
 * `Keyboard`, so the image can never disagree with the screen. A copy has to carry its look with
 * it, because the board is styled by the page's stylesheet and theme variables, which an image
 * does not have: `inlineBoard` writes each element's computed paint onto the element. The card is
 * one SVG, with no script, no foreign content and no font to load, so it draws the same wherever it
 * is opened and can be turned into a PNG with no page involved (`renderPng`).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/** The card is this wide, in CSS pixels; it is as tall as what it holds. */
export const CARD_WIDTH = 1200;
const PAD = 48;
const INNER = CARD_WIDTH - 2 * PAD;
/** The most pixels a PNG may have: a little under what the smallest canvases of today's browsers allow. */
export const MAX_PIXELS = 16_000_000;
/** A PNG is drawn at twice the card's size, so it stays sharp on a high-density screen. */
export const PNG_SCALE = 2;

/** The properties of an element's computed style that paint it, which is all the board needs. */
const PAINT = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linecap',
  'opacity',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'letter-spacing',
  'text-anchor',
  'dominant-baseline',
] as const;

/** An attribute that only means something to the page: its styling, scripts and accessibility. */
const PAGE_ONLY = /^(class|id|role|tabindex|focusable|style|aria-.*|data-.*)$/;

/**
 * A copy of a board's `<svg>` that looks as the board does without the page: every element carries
 * its computed paint in its own `style`, and what only the page uses (classes, ids, roles,
 * tooltips) is gone. The colours are the used ones, with `var()` and `color-mix()` resolved, so the
 * theme in force is the theme of the copy.
 */
export function inlineBoard(
  source: SVGSVGElement,
  read: (el: Element) => CSSStyleDeclaration = (el) => getComputedStyle(el),
): SVGSVGElement {
  const copy = source.cloneNode(true) as SVGSVGElement;
  const from = [source, ...source.querySelectorAll('*')];
  const to = [copy, ...copy.querySelectorAll('*')];
  from.forEach((el, i) => {
    const target = to[i];
    if (!target) return;
    const css = read(el);
    const style = PAINT.flatMap((p) => {
      const value = css.getPropertyValue(p);
      return value ? [`${p}:${value}`] : [];
    }).join(';');
    for (const name of target.getAttributeNames()) {
      if (PAGE_ONLY.test(name)) target.removeAttribute(name);
    }
    if (style) target.setAttribute('style', style);
  });
  for (const title of copy.querySelectorAll('title')) title.remove();
  return copy;
}

/** The colours of the card, as the page in its theme draws them. */
export interface Palette {
  background: string;
  border: string;
  text: string;
  /** The pill that says a version is unsaved, tinted with this and written in the text colour. */
  warning: string;
  /** The dot beside a band's name, by how the band rates the number. */
  good: string;
  ok: string;
  bad: string;
  /** The heat scale, from a key with none to the busiest one: the board's own mix at each stop. */
  heat: string[];
}

/** Where the heat scale has its stops, as a share of the busiest key. */
const HEAT_STOPS = [0, 25, 50, 75, 100];

/**
 * The palette of the page now, each colour resolved by a probe drawn in `host` (an `<svg>` in the
 * document, so the page's variables reach it) and read back: the theme is a set of variables and
 * `color-mix()`, which an image made from the page's text could not follow.
 */
export function readPalette(host: SVGSVGElement): Palette {
  const probe = (value: string): string => {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('style', `fill:${value}`);
    host.append(rect);
    const resolved = getComputedStyle(rect).getPropertyValue('fill');
    rect.remove();
    return resolved || value;
  };
  return {
    background: probe('var(--color-base-100)'),
    border: probe('var(--color-base-300)'),
    text: probe('var(--color-base-content)'),
    warning: probe('var(--color-warning)'),
    good: probe('var(--color-success)'),
    ok: probe('var(--color-warning)'),
    bad: probe('var(--color-error)'),
    heat: HEAT_STOPS.map((pct) =>
      probe(`color-mix(in oklab, var(--lb-key-bg) ${100 - pct}%, var(--lb-heat) ${pct}%)`),
    ),
  };
}

/** One layout on the card. */
export interface CardBoard {
  /** The board, inlined (`inlineBoard`). */
  svg: SVGSVGElement;
  /** `A` or `B` when two layouts share the card; null for one. */
  tag: string | null;
  credit: Credit;
  /** The layer drawn, by its name. */
  layer: string;
  /** What share of the typing the layer does, as the board writes it, if it is known. */
  share: string | null;
  /** The page's Summary for this layout, drawn as a compact table under its board; empty for none. */
  summary: SummaryCell[];
}

export interface CardSpec {
  boards: CardBoard[];
  /** What the colours measure, as the page names it: `Usage`. */
  heat: string;
  /** What else is true of the colours, as `one scale for both layouts`. */
  heatNote: string | null;
  /** The text, the rules and the switches the numbers are made on. */
  settings: string;
  palette: Palette;
}

export interface Composed {
  /** The card as an SVG document. */
  svg: string;
  width: number;
  height: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

function node<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, typeof value === 'number' ? String(round(value)) : value);
  }
  return el;
}

/**
 * `text` cut short, with an ellipsis, to fit `width` at `size`. It walks the text once and stops
 * the moment the text is known not to fit, so what it costs is the length of what fits and never
 * that of the text: a name from a link may be as long as a link can carry.
 */
export function ellipsize(text: string, width: number, size: number): string {
  const room = width - textWidth('…', size);
  const kept: string[] = [];
  let used = 0;
  let keeping = true;
  for (const g of eachGrapheme(text)) {
    used += textWidth(g, size);
    if (used > width) return `${kept.join('').trimEnd()}…`;
    if (keeping && used <= room) kept.push(g);
    else keeping = false;
  }
  return text;
}

/** `text` in lines of at most `width` at `size`, at most `max` of them; the last ends in `…`. */
export function wrapLines(text: string, width: number, size: number, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= max) return lines.map((l) => ellipsize(l, width, size));
  const kept = lines.slice(0, max);
  kept[max - 1] = ellipsize(`${kept[max - 1]} …`, width, size);
  return kept;
}

interface TextStyle {
  size: number;
  weight?: number;
  anchor?: 'start' | 'middle' | 'end';
  fill: string;
  opacity?: number;
  /** The board's own monospace, for numbers that are read down a column. */
  mono?: boolean;
}

function label(content: string, x: number, y: number, style: TextStyle): SVGTextElement {
  const el = node('text', {
    x,
    y,
    'font-family': style.mono ? MONO : FONT,
    'font-size': style.size,
    'font-weight': style.weight ?? 400,
    'text-anchor': style.anchor ?? 'start',
    fill: style.fill,
    ...(style.opacity === undefined ? {} : { 'fill-opacity': style.opacity }),
  });
  el.textContent = plain(content);
  return el;
}

/** The size of a board's drawing, from its `viewBox`. */
function drawingSize(svg: SVGSVGElement): { width: number; height: number } {
  const [, , width, height] = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  return width > 0 && height > 0 ? { width, height } : { width: 1, height: 1 };
}

/** A width to leave room for, not to place by: a word of this size, a little over what it takes. */
const approx = (text: string, size: number) => textWidth(text, size) * 0.9;

const MUTED = 0.75;
const SOFT = 0.6;

/**
 * The sizes of the card's writing, in its own pixels. A chat shows the image a third of its width
 * or less, so the small print is not smaller than 22: the board, the names and the credits are what
 * is read there, and the rest is for whoever opens it.
 */
const TITLE = 42;
const CREDIT = 26;
const SMALL = 22;
const FOOT = 24;

/** Cells to a row of the Summary table: the page's thirteen numbers go in two rows of seven. */
const SUMMARY_COLUMNS = 7;
const SUMMARY_ROW = 88;
const SUMMARY_PAD = 10;

/**
 * The page's Summary as a compact table in a frame, `SUMMARY_COLUMNS` to a row: each cell its
 * caption, its value in the board's monospace, and its band's name after a dot that says, by colour,
 * how the band rates it. The word says it too, so colour is never the only way to read it. Returns
 * the height it took, from `y`.
 */
function summaryTable(body: SVGGElement, cells: SummaryCell[], y: number, p: Palette): number {
  const rows = Math.ceil(cells.length / SUMMARY_COLUMNS);
  const cellWidth = INNER / SUMMARY_COLUMNS;
  const height = rows * SUMMARY_ROW + 2 * SUMMARY_PAD;
  body.append(
    node('rect', {
      x: PAD,
      y,
      width: INNER,
      height,
      rx: 14,
      fill: 'none',
      stroke: p.border,
      'stroke-width': 2,
    }),
  );
  for (let row = 1; row < rows; row++) {
    const at = y + SUMMARY_PAD + row * SUMMARY_ROW;
    body.append(
      node('line', {
        x1: PAD + 14,
        x2: PAD + INNER - 14,
        y1: at,
        y2: at,
        stroke: p.border,
        'stroke-width': 1.5,
      }),
    );
  }
  const dot = { good: p.good, ok: p.ok, bad: p.bad, neutral: p.text } as const;
  cells.forEach((cell, i) => {
    const x = PAD + (i % SUMMARY_COLUMNS) * cellWidth + 16;
    const top = y + SUMMARY_PAD + Math.floor(i / SUMMARY_COLUMNS) * SUMMARY_ROW;
    const room = cellWidth - 24;
    body.append(
      label(ellipsize(cell.label, room, SMALL), x, top + 26, {
        size: SMALL,
        fill: p.text,
        opacity: MUTED,
      }),
      label(ellipsize(cell.value, room, 30), x, top + 58, {
        size: 30,
        weight: 700,
        fill: p.text,
        mono: true,
      }),
    );
    if (cell.band) {
      body.append(
        node('circle', {
          cx: x + 6,
          cy: top + 72,
          r: 6,
          fill: dot[cell.quality] ?? p.text,
          ...(cell.quality === 'neutral' ? { 'fill-opacity': 0.45 } : {}),
        }),
        label(ellipsize(cell.band, room - 20, 20), x + 20, top + 78, {
          size: 20,
          fill: p.text,
          opacity: MUTED,
        }),
      );
    }
  });
  return height;
}

/**
 * Lay the card out: each layout's name, credits and board one under another, then the heat's scale,
 * then the settings and the credit to LayerBench. Nothing is measured from the page's layout, so
 * the same inputs give the same card.
 */
export function composeCard({ boards, heat, heatNote, settings, palette: p }: CardSpec): Composed {
  // The serializer writes the namespace itself: one written by hand would be declared twice.
  const root = node('svg');
  const body = node('g');
  let y = PAD;

  boards.forEach((board, i) => {
    const { credit } = board;
    if (i > 0) y += 36;
    const unsaved = credit.edits !== null;
    const pillText = 'unsaved';
    const pillWidth = unsaved ? approx(pillText, 20) + 40 : 0;

    const name = board.tag ? `${board.tag} · ${credit.name}` : credit.name;
    body.append(
      label(ellipsize(name, INNER - pillWidth - (unsaved ? 20 : 0), TITLE), PAD, y + 38, {
        size: TITLE,
        weight: 700,
        fill: p.text,
      }),
    );
    if (unsaved) {
      // Tinted and outlined, the words in the text colour: white on this orange is 3:1, and the
      // text colour on the tint is above 6:1 in both themes.
      const x = CARD_WIDTH - PAD - pillWidth;
      body.append(
        node('rect', {
          x,
          y: y + 6,
          width: pillWidth,
          height: 38,
          rx: 19,
          fill: p.warning,
          'fill-opacity': 0.22,
          stroke: p.warning,
          'stroke-width': 2,
        }),
        label(pillText, x + pillWidth / 2, y + 32, {
          size: 20,
          weight: 700,
          anchor: 'middle',
          fill: p.text,
        }),
      );
    }
    y += 58;

    // The author is held to a share of the line, so a long name cannot push the source off it.
    const byline = credit.byline ? ellipsize(credit.byline, INNER * 0.55, CREDIT) : null;
    const meta = [byline, credit.source].filter(Boolean).join(' · ');
    if (meta) {
      body.append(
        label(ellipsize(meta, INNER, CREDIT), PAD, y + 22, {
          size: CREDIT,
          fill: p.text,
          opacity: MUTED,
        }),
      );
      y += 38;
    }
    if (credit.edits) {
      body.append(
        label(ellipsize(credit.edits, INNER, CREDIT), PAD, y + 22, {
          size: CREDIT,
          weight: 600,
          fill: p.text,
        }),
      );
      y += 38;
    }
    y += 12;

    // A copy, so the card can be made again from the same boards, as a name is typed.
    const drawing = board.svg.cloneNode(true) as SVGSVGElement;
    const size = drawingSize(drawing);
    const height = (INNER * size.height) / size.width;
    drawing.setAttribute('x', String(PAD));
    drawing.setAttribute('y', String(round(y)));
    drawing.setAttribute('width', String(INNER));
    drawing.setAttribute('height', String(round(height)));
    body.append(drawing);
    y += height;

    const caption = [board.layer, board.share].filter(Boolean).join(' · ');
    if (caption) {
      body.append(
        label(ellipsize(caption, INNER, SMALL), PAD, y + 28, {
          size: SMALL,
          fill: p.text,
          opacity: MUTED,
        }),
      );
      y += 38;
    }

    if (board.summary.length > 0) {
      y += 6;
      y += summaryTable(body, board.summary, y, p);
    }
  });

  // The scale of the colours: what they measure, from none to the busiest key.
  y += 28;
  const gradient = node('linearGradient', { id: 'lb-heat-scale', x1: 0, x2: 1, y1: 0, y2: 0 });
  p.heat.forEach((colour, i) => {
    const at = (i / Math.max(1, p.heat.length - 1)) * 100;
    gradient.append(node('stop', { offset: `${at}%`, 'stop-color': colour }));
  });
  const defs = node('defs');
  defs.append(gradient);
  // The name at the left, the scale at the right, each hung from its own edge: nothing is placed
  // by the width of a word that sits beside it, which the page's font decides, not this code.
  const barWidth = 240;
  const right = CARD_WIDTH - PAD;
  const wordsEnd = approx('busiest key', SMALL);
  const barX = right - wordsEnd - 12 - barWidth;
  body.append(
    label(ellipsize(heat, barX - 12 - approx('none', SMALL) - 24 - PAD, FOOT), PAD, y + 20, {
      size: FOOT,
      weight: 700,
      fill: p.text,
    }),
    label('none', barX - 12, y + 19, { size: SMALL, anchor: 'end', fill: p.text, opacity: MUTED }),
    node('rect', {
      x: barX,
      y: y + 2,
      width: barWidth,
      height: 22,
      rx: 11,
      fill: 'url(#lb-heat-scale)',
      stroke: p.border,
      'stroke-width': 2,
    }),
    label('busiest key', right, y + 19, {
      size: SMALL,
      anchor: 'end',
      fill: p.text,
      opacity: MUTED,
    }),
  );
  if (heatNote) {
    y += 34;
    body.append(
      label(ellipsize(heatNote, INNER, SMALL), PAD, y + 19, {
        size: SMALL,
        fill: p.text,
        opacity: SOFT,
      }),
    );
  }
  y += 26;

  // What the numbers are made on, and whose tool it is.
  y += 24;
  body.append(
    node('line', {
      x1: PAD,
      x2: CARD_WIDTH - PAD,
      y1: y,
      y2: y,
      stroke: p.border,
      'stroke-width': 2,
    }),
  );
  y += 22;
  for (const line of wrapLines(plain(settings), INNER, SMALL, 2)) {
    body.append(label(line, PAD, y + 22, { size: SMALL, fill: p.text, opacity: SOFT }));
    y += 31;
  }
  y += 10;
  body.append(
    label('Made with LayerBench', PAD, y + 22, { size: FOOT, weight: 600, fill: p.text }),
    label('layerbench.github.io', CARD_WIDTH - PAD, y + 22, {
      size: FOOT,
      anchor: 'end',
      fill: p.text,
      opacity: MUTED,
    }),
  );
  y += 32 + PAD;

  const height = Math.ceil(y);
  root.setAttribute('width', String(CARD_WIDTH));
  root.setAttribute('height', String(height));
  root.setAttribute('viewBox', `0 0 ${CARD_WIDTH} ${height}`);
  root.append(defs, node('rect', { width: CARD_WIDTH, height, fill: p.background }), body);
  return { svg: new XMLSerializer().serializeToString(root), width: CARD_WIDTH, height };
}

/** The card as an address an `<img>` can show, which the page's policy allows (`data:`). */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The browser could not draw the image.'));
    img.src = url;
  });
}

/** The least a PNG is drawn at, as a share of the card's size: under it the writing is not legible. */
const MIN_SCALE = 0.5;

/**
 * How large a card is drawn: twice its size, so it is sharp on a high-density screen, or smaller
 * where that would pass what a canvas holds (`MAX_PIXELS`), so a tall card, two boards and their
 * Summaries, is drawn smaller rather than refused. Null where even `MIN_SCALE` does not fit: a board
 * of a shape no picture can hold.
 */
export function pngScale(width: number, height: number): number | null {
  const fits = Math.sqrt(MAX_PIXELS / (width * height));
  const scale = Math.min(PNG_SCALE, fits);
  return scale >= MIN_SCALE ? scale : null;
}

/** The card as a PNG, drawn through a canvas at the size `pngScale` gives it. */
export async function renderPng(card: Composed): Promise<Blob> {
  // A card no canvas can hold is refused here, before an image is made for it: asking for more
  // pixels than a browser will give fails late, or takes the tab's memory first.
  const scale = pngScale(card.width, card.height);
  if (scale === null) {
    throw new Error('This image is too large to make: its layout is too tall for a picture.');
  }
  const img = await loadImage(svgDataUrl(card.svg));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(card.width * scale);
  canvas.height = Math.round(card.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The browser could not make an image.');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The browser could not make a PNG.'))),
      'image/png',
    );
  });
}

/** Save a file the browser downloads under `name`. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Whether this browser can put an image on the clipboard. */
export function canCopyImage(): boolean {
  return typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function';
}

/** Put a PNG on the clipboard, to paste into a post or a chat. */
export async function copyImage(blob: Blob): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
