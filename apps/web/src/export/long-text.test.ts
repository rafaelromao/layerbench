import { describe, expect, it } from 'vitest';
import { creditOf, editorName, imageFileName, sourceOf } from './credits.js';
import { plain } from './plain-text.js';
import { composeCard, ellipsize, type Palette, wrapLines } from './share-card.js';

/**
 * Text that comes from a link has no length of its own, and a pattern that is fast on text of an
 * ordinary shape can be quadratic on one of another: a run of one character followed by a different
 * one is what a backtracking pattern is slowest on. So every function that reads such text is tried
 * on each shape below, at a length a link carries in a few bytes, against a time that is hundreds of
 * times what the work takes and a fraction of what a quadratic one does.
 */
const N = 100_000;
const BUDGET_MS = 1500;

const SHAPES: Record<string, string> = {
  'a run of slashes, then a letter': `${'/'.repeat(N)}a`,
  'a run of dashes, then a letter': `${'-'.repeat(N)}a`,
  'a run of spaces, then a letter': `${' '.repeat(N)}a`,
  'newlines, then a letter': `${'\n'.repeat(N)}a`,
  dots: '.'.repeat(N),
  'percent signs': '%'.repeat(N),
  'a letter and its combining marks': `a${'\u0300'.repeat(N)}`,
  'combining marks alone': '\u0300'.repeat(N),
  'lone high surrogates': '\ud800'.repeat(N),
  'zero-width joiners': '\u200d'.repeat(N),
  'direction overrides': '\u202e'.repeat(N),
  'control characters': '\u0007'.repeat(N),
  emoji: '\u{1f680}'.repeat(N),
  'short words': 'ab '.repeat(N / 3),
};

const palette: Palette = {
  background: '#fff',
  border: '#ccc',
  text: '#000',
  warning: '#f80',
  good: '#0a0',
  ok: '#fa0',
  bad: '#c00',
  heat: ['#eee', '#ccc', '#999', '#666', '#000'],
};

function board(): SVGSVGElement {
  const host = document.createElement('div');
  host.innerHTML = '<svg viewBox="0 0 800 300"><rect width="10" height="10"/></svg>';
  return host.querySelector('svg') as SVGSVGElement;
}

/** Each function that reads text from a link, given a text of one shape. */
const READERS: Record<string, (text: string) => unknown> = {
  plain: (t) => plain(t),
  editorName: (t) => editorName(t),
  sourceOf: (t) => sourceOf(`https://example.com/${t}`),
  'sourceOf, in the query': (t) => sourceOf(`https://example.com/?${t}`),
  'creditOf, every field': (t) =>
    creditOf(
      { name: t, author: t, link: `https://example.com/${t}` },
      { unsaved: true, editor: t },
    ),
  imageFileName: (t) => imageFileName([t, t]),
  ellipsize: (t) => ellipsize(t, 800, 42),
  wrapLines: (t) => wrapLines(t, 1104, 22, 2),
  'composeCard, every text': (t) =>
    composeCard({
      boards: [
        {
          svg: board(),
          tag: 'A',
          credit: creditOf(
            { name: t, author: t, link: `https://example.com/${t}` },
            { unsaved: true, editor: t },
          ),
          layer: t,
          share: t,
          summary: [{ id: 'x', label: t, value: t, band: t, quality: 'good' }],
        },
      ],
      heat: t,
      heatNote: t,
      settings: t,
      palette,
    }),
};

describe('text of every shape a link can carry', () => {
  for (const [reader, read] of Object.entries(READERS)) {
    describe(reader, () => {
      it.each(Object.entries(SHAPES))('is read in time: %s', (_shape, text) => {
        const started = performance.now();
        read(text);
        expect(performance.now() - started).toBeLessThan(BUDGET_MS);
      });
    });
  }

  it('leaves what is drawn to a line of each, never a megabyte, whatever the shape', () => {
    for (const text of Object.values(SHAPES)) {
      const { svg } = (READERS['composeCard, every text'] as (t: string) => { svg: string })(text);
      expect(svg.length).toBeLessThan(120_000);
    }
  });
});
