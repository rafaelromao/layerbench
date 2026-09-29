/**
 * Fitting a legend into a key.
 *
 * Widths are estimated rather than measured: the key font is monospace, so the advance of a
 * character is a fixed fraction of the font size, and estimating keeps the result the same in a
 * browser and in a test runner with no text layout at all. Symbols outside ASCII may be drawn from
 * a fallback face that runs wider, so they are costed generously — a legend that shrinks a size
 * further than it needed to is a better failure than one that spills out of its key.
 */

export interface Fit {
  size: number;
  lines: string[];
  /** Nothing fitted even at the smallest size, so the text was cut and needs a legend of its own. */
  overflow: boolean;
}

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

export function graphemes(text: string): string[] {
  if (!segmenter) return [...text];
  return [...segmenter.segment(text)].map((s) => s.segment);
}

/** Advance of one grapheme, in ems. */
function advance(g: string): number {
  const cp = g.codePointAt(0) ?? 0;
  if (cp < 0x80) return 0.6;
  if (/\p{Extended_Pictographic}/u.test(g)) return 1.2;
  // CJK and other wide scripts.
  if (cp >= 0x1100 && /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠]/u.test(g)) {
    return 1.0;
  }
  return 0.75;
}

export function textWidth(text: string, size: number): number {
  let em = 0;
  for (const g of graphemes(text)) em += advance(g);
  return em * size;
}

/** Split in two at the space nearest the middle, or in the middle when there is none. */
function splitTwo(text: string): [string, string] {
  const gs = graphemes(text);
  const mid = gs.length / 2;
  let best = -1;
  gs.forEach((g, i) => {
    if (g === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  });
  if (best > 0) return [gs.slice(0, best).join(''), gs.slice(best + 1).join('')];
  const cut = Math.ceil(mid);
  return [gs.slice(0, cut).join(''), gs.slice(cut).join('')];
}

function truncate(text: string, width: number, size: number): string {
  const gs = graphemes(text);
  for (let n = gs.length - 1; n > 0; n--) {
    const candidate = `${gs.slice(0, n).join('')}…`;
    if (textWidth(candidate, size) <= width) return candidate;
  }
  return '…';
}

/**
 * The largest size, from `sizes` (largest first), at which `text` fits `width` — on one line, or on
 * two where `height` has room for them.
 */
export function fitLabel(
  text: string,
  width: number,
  height: number,
  sizes: readonly number[],
): Fit {
  if (text === '') return { size: sizes[0], lines: [''], overflow: false };
  for (const size of sizes) {
    if (textWidth(text, size) <= width) return { size, lines: [text], overflow: false };
  }
  if (graphemes(text).length > 1) {
    const [a, b] = splitTwo(text);
    for (const size of sizes) {
      if (size * 2.2 > height) continue;
      if (Math.max(textWidth(a, size), textWidth(b, size)) <= width) {
        return { size, lines: [a, b], overflow: false };
      }
    }
  }
  const min = sizes[sizes.length - 1];
  return { size: min, lines: [truncate(text, width, min)], overflow: true };
}

/** ① … ⑳ for the first twenty legends, plain numbers after that. */
export function legendNumber(n: number): string {
  return n >= 1 && n <= 20 ? String.fromCodePoint(0x2460 + n - 1) : String(n);
}
