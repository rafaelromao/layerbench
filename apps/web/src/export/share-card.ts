import { graphemes, textWidth } from '../components/fit-label.js';
import type { Credit } from './credits.js';
import { plain } from './plain-text.js';

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

/** The card is this wide, in CSS pixels; it is as tall as what it holds. */
export const CARD_WIDTH = 1200;
const PAD = 48;
const INNER = CARD_WIDTH - 2 * PAD;
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

/** `text` cut short, with an ellipsis, to fit `width` at `size`. */
export function ellipsize(text: string, width: number, size: number): string {
  if (textWidth(text, size) <= width) return text;
  const gs = graphemes(text);
  for (let n = gs.length - 1; n > 0; n--) {
    const cut = `${gs.slice(0, n).join('').trimEnd()}…`;
    if (textWidth(cut, size) <= width) return cut;
  }
  return '…';
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
}

function label(content: string, x: number, y: number, style: TextStyle): SVGTextElement {
  const el = node('text', {
    x,
    y,
    'font-family': FONT,
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

/** The card as a PNG, drawn through a canvas at `scale` times its size. */
export async function renderPng(card: Composed, scale = PNG_SCALE): Promise<Blob> {
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
