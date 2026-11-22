import { describe, expect, it } from 'vitest';
import { creditOf } from './credits.js';
import {
  CARD_WIDTH,
  type CardBoard,
  composeCard,
  ellipsize,
  inlineBoard,
  type Palette,
  svgDataUrl,
  wrapLines,
} from './share-card.js';

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
  heat: ['rgb(10, 10, 10)', 'rgb(40, 40, 60)', 'rgb(70, 70, 120)', 'rgb(100, 100, 180)', 'blue'],
};

function cardBoard(over: Partial<CardBoard> = {}): CardBoard {
  return {
    svg: board(),
    tag: null,
    credit: creditOf({ name: 'Romak', author: 'Ana' }, { unsaved: false, editor: '' }),
    layer: 'Alpha 1',
    share: '91.2% of presses',
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

describe('svgDataUrl', () => {
  it('is a data address a page with `img-src data:` may show', () => {
    const url = svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg"><text>é & </text></svg>');
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(url.slice(url.indexOf(',') + 1))).toContain('é & ');
    expect(SVG_NS).toContain('svg');
  });
});
