import { afterEach, describe, expect, it, vi } from 'vitest';
import { creditOf } from './credits.js';
import {
  CARD_WIDTH,
  type CardBoard,
  canCopyImage,
  composeCard,
  copyImage,
  ellipsize,
  inlineBoard,
  MAX_PIXELS,
  type Palette,
  pngScale,
  renderPng,
  svgDataUrl,
  wrapLines,
} from './share-card.js';
import type { SummaryCell } from './summary.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A computed style that has only these properties. */
const css = (values: Record<string, string>) =>
  ({ getPropertyValue: (p: string) => values[p] ?? '' }) as CSSStyleDeclaration;

/** A small board, as `Keyboard` draws one: a key with a cap, a tooltip and a legend. */
function board(viewBox = '0 0 800 300'): SVGSVGElement {
  const host = document.createElement('div');
  host.innerHTML = `
    <svg id="kb" class="lb-keyboard w-full" viewBox="${viewBox}" role="group" aria-label="Keyboard layout"
         style="--lb-board-units: 12">
      <g class="lb-key" data-key="a" role="button" tabindex="0" aria-label="Key a"
         transform="translate(10 20) rotate(0)">
        <rect class="lb-key-cap" x="-30" y="-30" width="60" height="60" rx="9"
              style="fill: color-mix(in oklab, var(--lb-key-bg) 50%, var(--lb-heat) 50%)" />
        <title>a tooltip</title>
        <text class="lb-key-tap" x="0" y="1" text-anchor="middle" font-size="22">a</text>
      </g>
    </svg>`;
  return host.querySelector('svg') as SVGSVGElement;
}

const palette: Palette = {
  background: 'rgb(1, 1, 1)',
  border: 'rgb(2, 2, 2)',
  text: 'rgb(250, 250, 250)',
  warning: 'rgb(200, 100, 0)',
  good: 'rgb(0, 160, 0)',
  ok: 'rgb(220, 150, 0)',
  bad: 'rgb(200, 0, 0)',
  heat: ['rgb(10, 10, 10)', 'rgb(40, 40, 60)', 'rgb(70, 70, 120)', 'rgb(100, 100, 180)', 'blue'],
};

function cardBoard(over: Partial<CardBoard> = {}): CardBoard {
  return {
    svg: board(),
    tag: null,
    credit: creditOf({ name: 'Romak', author: 'Ana' }, { unsaved: false, editor: '' }),
    layer: 'Alpha 1',
    share: '91.2% of presses',
    summary: [],
    ...over,
  };
}

const parse = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml');

describe('inlineBoard', () => {
  it('writes each element’s computed paint onto it', () => {
    const source = board();
    const copy = inlineBoard(source, (el) =>
      el.tagName === 'rect'
        ? css({ fill: 'rgb(9, 8, 7)', 'stroke-width': '1.5px' })
        : el.tagName === 'text'
          ? css({ fill: 'white', 'font-family': 'monospace', 'font-size': '22px' })
          : css({}),
    );
    const rect = copy.querySelector('rect');
    expect(rect?.getAttribute('style')).toBe('fill:rgb(9, 8, 7);stroke-width:1.5px');
    expect(copy.querySelector('text')?.getAttribute('style')).toBe(
      'fill:white;font-family:monospace;font-size:22px',
    );
  });

  it('leaves the page’s own board as it was', () => {
    const source = board();
    const before = source.outerHTML;
    inlineBoard(source, () => css({ fill: 'red' }));
    expect(source.outerHTML).toBe(before);
  });

  it('keeps the geometry and drops what only the page uses', () => {
    const copy = inlineBoard(board(), () => css({ fill: 'red' }));
    expect(copy.getAttribute('viewBox')).toBe('0 0 800 300');
    expect(copy.querySelector('g')?.getAttribute('transform')).toBe('translate(10 20) rotate(0)');
    expect(copy.querySelector('rect')?.getAttribute('width')).toBe('60');
    expect(copy.querySelector('text')?.getAttribute('text-anchor')).toBe('middle');
    for (const el of [copy, ...copy.querySelectorAll('*')]) {
      for (const name of el.getAttributeNames()) {
        expect(name).not.toMatch(/^(class|id|role|tabindex|focusable|aria-.*|data-.*)$/);
      }
    }
  });

  it('drops tooltips, which an image has no use for', () => {
    expect(inlineBoard(board(), () => css({})).querySelector('title')).toBeNull();
  });

  it('puts no style on an element whose computed style has no paint', () => {
    const copy = inlineBoard(board(), () => css({}));
    expect(copy.querySelector('g')?.hasAttribute('style')).toBe(false);
  });
});

describe('ellipsize and wrapLines', () => {
  it('leaves what fits', () => {
    expect(ellipsize('Romak', 500, 20)).toBe('Romak');
  });

  it('cuts what does not, with an ellipsis, to the width', () => {
    const cut = ellipsize('A very long layout name indeed', 150, 20);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.length).toBeLessThan('A very long layout name indeed'.length);
  });

  it('wraps on words', () => {
    const lines = wrapLines('one two three four five six', 130, 20, 5);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe('one two three four five six');
  });

  it('keeps to the lines allowed, the last ending in an ellipsis', () => {
    const lines = wrapLines('word '.repeat(80), 300, 20, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]?.endsWith('…')).toBe(true);
  });
});

describe('composeCard', () => {
  it('makes a well-formed SVG the width of the card, as tall as what it holds', () => {
    const card = composeCard({
      boards: [cardBoard()],
      heat: 'Usage',
      heatNote: null,
      settings: 'English · Default rules',
      palette,
    });
    expect(card.width).toBe(CARD_WIDTH);
    expect(card.height).toBeGreaterThan(400);
    const doc = parse(card.svg);
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    const root = doc.documentElement;
    expect(root.getAttribute('width')).toBe(String(CARD_WIDTH));
    expect(root.getAttribute('height')).toBe(String(card.height));
    expect(root.getAttribute('viewBox')).toBe(`0 0 ${CARD_WIDTH} ${card.height}`);
  });

  it('says the layout, its author, the layer and its share, the heat, the settings and whose tool it is', () => {
    const { svg } = composeCard({
      boards: [
        cardBoard({
          credit: creditOf(
            { name: 'Romak', author: 'Ana', link: 'https://example.com/r' },
            { unsaved: false, editor: '' },
          ),
        }),
      ],
      heat: 'Usage',
      heatNote: null,
      settings: 'English · Default rules',
      palette,
    });
    const text = parse(svg).documentElement.textContent ?? '';
    for (const part of [
      'Romak',
      'by Ana · example.com/r',
      'Alpha 1 · 91.2% of presses',
      'Usage',
      'none',
      'busiest key',
      'English · Default rules',
      'Made with LayerBench',
      'layerbench.github.io',
    ]) {
      expect(text).toContain(part);
    }
  });

  it('names who made the edits of a version nobody has saved, and marks it unsaved', () => {
    const edited = creditOf({ name: 'Romak', author: 'Ana' }, { unsaved: true, editor: '@bia' });
    const { svg } = composeCard({
      boards: [cardBoard({ credit: edited })],
      heat: 'Usage',
      heatNote: null,
      settings: '',
      palette,
    });
    const text = parse(svg).documentElement.textContent ?? '';
    expect(text).toContain('Unsaved edits by @bia');
    expect(text).toContain('unsaved');
    // The author is still credited, beside the editor: the edits are not theirs.
    expect(text).toContain('by Ana');
  });

  it('says nothing of edits, and has no pill, for a version that is saved', () => {
    const { svg } = composeCard({
      boards: [cardBoard()],
      heat: 'Usage',
      heatNote: null,
      settings: '',
      palette,
    });
    const text = parse(svg).documentElement.textContent ?? '';
    expect(text).not.toMatch(/edits|unsaved/i);
    expect(svg).not.toContain(palette.warning);
  });

  it('puts the board in the card at its width, as tall as its own proportions', () => {
    const { svg } = composeCard({
      boards: [cardBoard({ svg: board('0 0 600 200') })],
      heat: 'Usage',
      heatNote: null,
      settings: '',
      palette,
    });
    const nested = [...parse(svg).documentElement.getElementsByTagName('svg')].find((s) =>
      s.hasAttribute('viewBox'),
    ) as Element;
    expect(nested.getAttribute('x')).toBe('48');
    expect(nested.getAttribute('width')).toBe(String(CARD_WIDTH - 96));
    expect(Number(nested.getAttribute('height'))).toBeCloseTo((CARD_WIDTH - 96) / 3, 1);
  });

  it('draws two layouts one under the other, each with its tag and credit', () => {
    const one = composeCard({
      boards: [cardBoard()],
      heat: 'Usage',
      heatNote: null,
      settings: '',
      palette,
    });
    const two = composeCard({
      boards: [
        cardBoard({ tag: 'A' }),
        cardBoard({
          tag: 'B',
          credit: creditOf({ name: 'QWERTY' }, { unsaved: true, editor: '' }),
        }),
      ],
      heat: 'Usage',
      heatNote: 'one scale for both layouts',
      settings: '',
      palette,
    });
    expect(two.height).toBeGreaterThan(one.height + 300);
    const text = parse(two.svg).documentElement.textContent ?? '';
    expect(text).toContain('A · Romak');
    expect(text).toContain('B · QWERTY');
    expect(text).toContain('Unsaved edits');
    expect(text).toContain('one scale for both layouts');
  });

  it('is well formed whatever the names hold', () => {
    const credit = creditOf(
      { name: 'Q & A <b>"x"</b>', author: "O'Neil & Sons" },
      { unsaved: true, editor: '<@me>' },
    );
    const { svg } = composeCard({
      boards: [cardBoard({ credit })],
      heat: 'Usage',
      heatNote: null,
      settings: 'a < b & c',
      palette,
    });
    const doc = parse(svg);
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    const text = doc.documentElement.textContent ?? '';
    expect(text).toContain('Q & A <b>"x"</b>');
    expect(text).toContain("O'Neil & Sons");
    expect(text).toContain('Unsaved edits by <@me>');
  });

  it('holds a long name, settings and note to the card', () => {
    const { svg } = composeCard({
      boards: [
        cardBoard({
          credit: creditOf(
            { name: 'N'.repeat(300), author: 'A'.repeat(300) },
            { unsaved: true, editor: 'E'.repeat(40) },
          ),
        }),
      ],
      heat: 'H'.repeat(100),
      heatNote: 'note '.repeat(60),
      settings: 'setting · '.repeat(100),
      palette,
    });
    const doc = parse(svg);
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    const text = doc.documentElement.textContent ?? '';
    expect(text).not.toContain('N'.repeat(300));
    expect(text).toContain('…');
  });
});

describe('composeCard with text that is not plain', () => {
  const hostile = (name: string, edits = '') =>
    composeCard({
      boards: [
        cardBoard({
          credit: creditOf({ name, author: name }, { unsaved: edits !== '', editor: edits }),
          layer: name,
        }),
      ],
      heat: name,
      heatNote: name,
      settings: name,
      palette,
    });

  it('draws a name with control characters, which an image document cannot hold', () => {
    const { svg } = hostile('Bad\u0000\u0007name\u0085\u001f');
    expect(parse(svg).getElementsByTagName('parsererror')).toHaveLength(0);
    expect(parse(svg).documentElement.textContent).toContain('Bad name');
  });

  it('draws a name with a lone surrogate, which would make the data address throw', () => {
    const { svg } = hostile('Half \ud83d pair');
    expect(() => svgDataUrl(svg)).not.toThrow();
    expect(parse(svg).getElementsByTagName('parsererror')).toHaveLength(0);
  });

  it('keeps a whole emoji, whose two halves are not lone', () => {
    const { svg } = hostile('Fast \u{1f680} board');
    expect(parse(svg).documentElement.textContent).toContain('\u{1f680}');
  });

  it('takes out the marks that change which way a line reads', () => {
    // A right-to-left override would draw what follows it backwards.
    const { svg } = hostile('Romak\u202e kamoR', '@a\u2066b\u2069');
    const text = parse(svg).documentElement.textContent ?? '';
    expect(text).not.toMatch(/[\u202a-\u202e\u2066-\u2069\u200e\u200f\u061c]/);
    expect(text).toContain('Romak kamoR');
  });
});

describe('text as long as a link can carry', () => {
  /** What a time budget allows: the work is that of what fits, which is a few milliseconds. */
  const BUDGET_MS = 1500;
  const HUGE = 100_000;

  it('is cut to fit in time that does not grow with its length', () => {
    // The first is small enough for a quadratic cut to fail it, not hang the run; the rest are not.
    for (const text of [
      'a'.repeat(8_000),
      'a'.repeat(1_000_000),
      'é '.repeat(500_000),
      '\u{1f680}'.repeat(300_000),
    ]) {
      const started = performance.now();
      const cut = ellipsize(text, 800, 42);
      expect(performance.now() - started).toBeLessThan(BUDGET_MS);
      expect(cut.endsWith('…')).toBe(true);
      expect(cut.length).toBeLessThan(80);
    }
  });

  it('keeps text that fits whole, and cuts only what does not', () => {
    expect(ellipsize('Romak', 800, 42)).toBe('Romak');
    expect(ellipsize('', 800, 42)).toBe('');
    // No room even for the ellipsis: what is left is the ellipsis.
    expect(ellipsize('Romak', 1, 42)).toBe('…');
  });

  it('does not cut a character in half, or leave a space before the ellipsis', () => {
    const cut = ellipsize('\u{1f468}\u200d\u{1f469}\u200d\u{1f467} '.repeat(5000), 400, 42);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut).not.toMatch(/ …$/);
    expect(cut).not.toMatch(/[\ud800-\udbff]…$/);
  });

  it('makes the whole card in time, whatever field the text is in', () => {
    const long = 'N'.repeat(HUGE);
    const credit = creditOf(
      { name: long, author: long, link: `https://example.com/${'p'.repeat(HUGE)}` },
      { unsaved: true, editor: long },
    );
    const started = performance.now();
    const { svg } = composeCard({
      boards: [cardBoard({ credit, layer: long, share: long })],
      heat: long,
      heatNote: long,
      settings: `${'word '.repeat(HUGE / 5)}`,
      palette,
    });
    expect(performance.now() - started).toBeLessThan(BUDGET_MS);
    const doc = parse(svg);
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    // The card holds a line of each, not the text: it stays a card, not a megabyte.
    expect(svg.length).toBeLessThan(200_000);
    expect(doc.documentElement.textContent).not.toContain('N'.repeat(500));
  });

  it('wraps a settings line of one word as long as a link can carry', () => {
    const started = performance.now();
    const lines = wrapLines('w'.repeat(1_000_000), 1104, 22, 2);
    expect(performance.now() - started).toBeLessThan(BUDGET_MS);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.endsWith('…')).toBe(true);
  });
});

describe('the card as a panel', () => {
  const compose = () =>
    composeCard({
      boards: [cardBoard()],
      heat: 'Usage',
      heatNote: null,
      settings: '',
      palette,
    });

  it('has a rounded border in the page’s border colour, round the whole card', () => {
    const { svg, width, height } = compose();
    const panel = [...parse(svg).documentElement.getElementsByTagName('rect')].find(
      (r) => r.getAttribute('rx') === '24',
    ) as Element;
    expect(panel.getAttribute('stroke')).toBe(palette.border);
    expect(Number(panel.getAttribute('stroke-width'))).toBeGreaterThanOrEqual(2);
    expect(panel.getAttribute('fill')).toBe(palette.background);
    // Inside the card's edge, so no half of the border is cut off by it.
    const half = Number(panel.getAttribute('stroke-width')) / 2;
    expect(Number(panel.getAttribute('x'))).toBe(half);
    expect(Number(panel.getAttribute('y'))).toBe(half);
    expect(Number(panel.getAttribute('width'))).toBe(width - 2 * half);
    expect(Number(panel.getAttribute('height'))).toBe(height - 2 * half);
  });

  it('leaves no square background behind it, so the corners are clear', () => {
    const { svg, width, height } = compose();
    const fills = [...parse(svg).documentElement.getElementsByTagName('rect')].filter(
      (r) =>
        Number(r.getAttribute('width')) >= width - 4 &&
        Number(r.getAttribute('height')) >= height - 4,
    );
    // The panel is the one thing as large as the card, and it is round.
    expect(fills).toHaveLength(1);
    expect(fills[0]?.getAttribute('rx')).toBe('24');
  });

  it('keeps everything inside the roundness of its corners', () => {
    // The writing and the board start 48 pixels in, past a 24 pixel corner.
    const { svg } = compose();
    const root = parse(svg).documentElement;
    // The card's own writing, not the board's, whose positions are the keys' own.
    const xs = [...root.getElementsByTagName('text')]
      .filter((t) => (t.closest('svg') as Element | null) === root)
      .map((t) => Number(t.getAttribute('x')));
    expect(xs.length).toBeGreaterThan(5);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(48);
  });
});

describe('the Summary table under a board', () => {
  const cell = (id: string, over: Partial<SummaryCell> = {}): SummaryCell => ({
    id,
    label: id.toUpperCase(),
    value: '1.23%',
    band: 'good',
    quality: 'good',
    ...over,
  });
  /** The thirteen numbers of the page's Summary. */
  const thirteen = Array.from({ length: 13 }, (_, i) => cell(`m${i}`, { label: `M${i}` }));
  const compose = (summary: SummaryCell[]) =>
    composeCard({
      boards: [cardBoard({ summary })],
      heat: 'Usage',
      heatNote: null,
      settings: '',
      palette,
    });

  it('draws every number of the Summary, with its caption, value and band', () => {
    const { svg } = compose([
      cell('effort', { label: 'Effort', value: '6.55', band: 'good' }),
      cell('sfb', { label: 'SFB', value: '0.84%', band: 'very good' }),
    ]);
    const text = parse(svg).documentElement.textContent ?? '';
    for (const part of ['Effort', '6.55', 'SFB', '0.84%', 'very good']) {
      expect(text).toContain(part);
    }
  });

  it('puts the thirteen in two rows, and fewer in one: a table, not a pile', () => {
    const none = compose([]);
    const one = compose(thirteen.slice(0, 7));
    const two = compose(thirteen);
    expect(one.height).toBeGreaterThan(none.height + 80);
    expect(two.height - one.height).toBe(88);
    // A single frame, and a rule between the two rows.
    expect(two.svg.match(/rx="14"/g)).toHaveLength(1);
    expect(one.svg).not.toMatch(/<line[^>]*stroke-width="1.5"/);
    expect(two.svg).toMatch(/<line[^>]*stroke-width="1.5"/);
  });

  it('draws nothing for a layout with no Summary, as the page draws none', () => {
    const { svg } = compose([]);
    expect(svg).not.toContain('rx="14"');
    expect(svg).not.toContain('<circle');
  });

  it('marks each band by how it rates the number, in the palette’s colours, and in words too', () => {
    const { svg } = compose([
      cell('a', { band: 'excellent', quality: 'good' }),
      cell('b', { band: 'fair', quality: 'ok' }),
      cell('c', { band: 'poor', quality: 'bad' }),
      cell('d', { band: 'plain', quality: 'neutral' }),
    ]);
    for (const colour of [palette.good, palette.ok, palette.bad]) {
      expect(svg).toContain(`fill="${colour}"`);
    }
    const text = parse(svg).documentElement.textContent ?? '';
    for (const word of ['excellent', 'fair', 'poor', 'plain']) expect(text).toContain(word);
    expect(svg.match(/<circle/g)).toHaveLength(4);
  });

  it('draws no dot for a rule that has no band', () => {
    const { svg } = compose([cell('a', { band: '', quality: 'neutral' })]);
    expect(svg).not.toContain('<circle');
  });

  it('writes the values in the board’s monospace', () => {
    const { svg } = compose([cell('a', { value: '9.87' })]);
    expect(svg).toMatch(/font-family="ui-monospace[^"]*"[^>]*>9\.87</);
  });

  it('is well formed and cut to its cells, whatever the rule set calls things', () => {
    const long = 'N'.repeat(500);
    const { svg } = compose([cell('a', { label: long, value: long, band: long })]);
    const doc = parse(svg);
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.documentElement.textContent).not.toContain('N'.repeat(100));
    const hostile = compose([cell('a', { label: 'A & <B>', band: '"x"' })]);
    expect(parse(hostile.svg).getElementsByTagName('parsererror')).toHaveLength(0);
  });

  it('is under each board when two are compared', () => {
    const { svg } = composeCard({
      boards: [
        cardBoard({ tag: 'A', summary: [cell('effort', { label: 'Effort', value: '1.11' })] }),
        cardBoard({ tag: 'B', summary: [cell('effort', { label: 'Effort', value: '2.22' })] }),
      ],
      heat: 'Usage',
      heatNote: null,
      settings: '',
      palette,
    });
    const text = parse(svg).documentElement.textContent ?? '';
    expect(text.indexOf('1.11')).toBeGreaterThan(text.indexOf('A · '));
    expect(text.indexOf('2.22')).toBeGreaterThan(text.indexOf('B · '));
    expect(text.indexOf('1.11')).toBeLessThan(text.indexOf('B · '));
  });
});

describe('the source of a layout with a long author', () => {
  it('stays on the card: the author is held to a share of the line', () => {
    const credit = creditOf(
      { name: 'Romak', author: 'A'.repeat(300), link: 'https://example.com/romak' },
      { unsaved: false, editor: '' },
    );
    const { svg } = composeCard({
      boards: [cardBoard({ credit })],
      heat: 'Usage',
      heatNote: null,
      settings: '',
      palette,
    });
    const text = parse(svg).documentElement.textContent ?? '';
    expect(text).toContain('example.com/romak');
    expect(text).toContain('…');
  });
});

describe('a card no canvas can hold', () => {
  it('is drawn at twice its size, and smaller where that would pass what a canvas holds', () => {
    expect(pngScale(1200, 1000)).toBe(2);
    // 1200 by 4000 at twice its size is 38 million pixels: drawn smaller, to the limit.
    const scale = pngScale(1200, 4000) as number;
    expect(scale).toBeGreaterThan(1.5);
    expect(scale).toBeLessThan(2);
    expect(1200 * scale * 4000 * scale).toBeLessThanOrEqual(MAX_PIXELS * 1.0001);
  });

  it('still draws a Compare of two tall boards with their Summaries, at the size of the screen or more', () => {
    // Two near-square boards (about 1100 by 1000 each), their credits, tables and the footer.
    expect(pngScale(1200, 2 * (1000 + 52 + 38 + 38 + 200) + 400)).toBeGreaterThanOrEqual(1);
  });

  it('is refused where not even half its size fits, which is a board of no real shape', () => {
    expect(pngScale(1200, 10_000_000)).toBeNull();
    const edge = Math.floor(MAX_PIXELS / (0.5 * 0.5 * 1200));
    expect(pngScale(1200, edge)).not.toBeNull();
    expect(pngScale(1200, edge + 1000)).toBeNull();
  });

  it('is refused before an image is made for it, and says why', async () => {
    // A board one key wide and ten thousand tall: far past what a browser gives a canvas.
    const tall = {
      svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
      width: 1200,
      height: 10_000_000,
    };
    await expect(renderPng(tall)).rejects.toThrow(/too large/);
  });
});

describe('the clipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  /** A `ClipboardItem` as a browser makes one: what it was given, by type. */
  class FakeClipboardItem {
    constructor(readonly types: Record<string, Blob>) {}
  }

  function withClipboard(write: (items: FakeClipboardItem[]) => Promise<void>) {
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true });
  }

  it('is offered where the browser has both a clipboard that writes and a clipboard item', () => {
    withClipboard(async () => {});
    expect(canCopyImage()).toBe(true);
  });

  it('is not offered without a clipboard item, or without one that writes', () => {
    withClipboard(async () => {});
    vi.stubGlobal('ClipboardItem', undefined);
    expect(canCopyImage()).toBe(false);
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
    Object.defineProperty(navigator, 'clipboard', { value: {}, configurable: true });
    expect(canCopyImage()).toBe(false);
  });

  it('puts the PNG on it as image/png, which is what a post or a chat pastes', async () => {
    const written: FakeClipboardItem[][] = [];
    withClipboard(async (items) => {
      written.push(items);
    });
    const png = new Blob(['png'], { type: 'image/png' });
    await copyImage(png);
    expect(written).toHaveLength(1);
    expect(written[0]).toHaveLength(1);
    expect(Object.keys(written[0]?.[0]?.types ?? {})).toEqual(['image/png']);
    expect(written[0]?.[0]?.types['image/png']).toBe(png);
  });

  it('lets the browser’s refusal reach the caller, which says so', async () => {
    withClipboard(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    await expect(copyImage(new Blob(['png'], { type: 'image/png' }))).rejects.toThrow('denied');
  });
});

describe('svgDataUrl', () => {
  it('is a data address a page with `img-src data:` may show', () => {
    const url = svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg"><text>é & </text></svg>');
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(url.slice(url.indexOf(',') + 1))).toContain('é & ');
    expect(SVG_NS).toContain('svg');
  });
});
