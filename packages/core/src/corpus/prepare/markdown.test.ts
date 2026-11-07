import { describe, expect, it } from 'vitest';
import { markdownLines } from './markdown.js';

describe('the lines of a Markdown file', () => {
  it('keeps headings, lists, tables and prose, cut into sentences', () => {
    const text = [
      '# Title',
      '',
      'First sentence. Second sentence! Third?',
      '- A list item. With two sentences.',
      '| a | b |',
      '|---|---|',
      '> quoted. text.',
    ].join('\n');
    expect(markdownLines(text)).toEqual([
      '# Title',
      'First sentence.',
      'Second sentence!',
      'Third?',
      '- A list item. With two sentences.',
      '| a | b |',
      '|---|---|',
      '> quoted. text.',
    ]);
  });

  it('takes out pictures, badges, HTML, comments and link definitions', () => {
    const text = [
      '<!-- gone',
      'too -->',
      '<div align="center">',
      '[![Build](https://img.test/b.svg)](https://ci.test)',
      '![logo](logo.png) Caption text.',
      '[ref]: https://example.test/ref',
      '</div>',
    ].join('\n');
    expect(markdownLines(text)).toEqual(['Caption text.']);
  });

  it('keeps a short fenced block and drops a long one, fences and all', () => {
    const short = ['```bash', 'pnpm test', '```'].join('\n');
    expect(markdownLines(short)).toEqual(['```bash', 'pnpm test', '```']);
    const long = ['````md', '```', 'a', '```', ...Array(9).fill('b'), '````', 'After.'].join('\n');
    expect(markdownLines(long)).toEqual(['After.']);
    expect(markdownLines(['```', ...Array(20).fill('never closed')].join('\n'))).toEqual([]);
  });

  it('leaves out the imports of an MDX file, and only of an MDX file', () => {
    const text = "import { Card } from '@x/y'\nexport const a = 1\nText.";
    expect(markdownLines(text, { mdx: true })).toEqual(['Text.']);
    expect(markdownLines(text)).toHaveLength(3);
  });
});
