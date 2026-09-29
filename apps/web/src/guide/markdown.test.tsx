import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  anchorsOf,
  headingId,
  type InlineContext,
  parseBlocks,
  parseGuide,
  renderInline,
} from './markdown.js';

const ctx: InlineContext = {
  link: (href, children, key) => (
    <a key={key} href={href}>
      {children}
    </a>
  ),
};

function html(text: string): string {
  return render(<p>{renderInline(text, ctx)}</p>).container.innerHTML;
}

describe('reading blocks', () => {
  it('gives headings the anchors GitHub gives them, numbering a repeat', () => {
    expect(headingId('Layers (LayoutMaster-specific)')).toBe('layers-layoutmaster-specific');
    expect(headingId('Combos, typing paths and the rest')).toBe('combos-typing-paths-and-the-rest');
    expect(headingId('Effort and `SFB`')).toBe('effort-and-sfb');
    const blocks = parseBlocks('## Presets\n\ntext\n\n## Presets\n');
    expect(blocks.filter((b) => b.kind === 'heading').map((b) => b.id)).toEqual([
      'presets',
      'presets-1',
    ]);
  });

  it('joins a paragraph’s lines, and carries an indented line on the list item above it', () => {
    const blocks = parseBlocks(
      'One line\nand the next.\n\n1. **Pick** a layout, or\n   bring your own.\n2. Read it.\n\n- a\n\n- b\n',
    );
    expect(blocks).toEqual([
      { kind: 'paragraph', text: 'One line and the next.' },
      {
        kind: 'list',
        ordered: true,
        start: 1,
        items: ['**Pick** a layout, or bring your own.', 'Read it.'],
      },
      { kind: 'list', ordered: false, start: 1, items: ['a', 'b'] },
    ]);
  });

  it('reads tables, with an escaped pipe inside a cell, and fenced code as it is', () => {
    const blocks = parseBlocks(
      '| Metric | Bounds |\n|---|--:|\n| Hand balance | \\|left − right\\| |\n\n```bash\npnpm test\n  | not a table\n```\n> a quote\n> over two lines',
    );
    expect(blocks).toEqual([
      {
        kind: 'table',
        head: ['Metric', 'Bounds'],
        align: [null, 'right'],
        rows: [['Hand balance', '|left − right|']],
      },
      { kind: 'code', text: 'pnpm test\n  | not a table' },
      { kind: 'quote', text: 'a quote over two lines' },
    ]);
  });
});

describe('a page as sections', () => {
  const doc = parseGuide(
    '# Title\n\nAlways shown.\n\n## First\n\nOpened.\n\n### Deeper\n\nFurther in.\n\n#### Deepest\n\n## Second\n',
  );

  it('keeps the opening for everyone, and folds the rest by level', () => {
    expect(doc.title).toBe('Title');
    expect(doc.intro).toEqual([{ kind: 'paragraph', text: 'Always shown.' }]);
    expect(doc.sections.map((s) => s.heading.text)).toEqual(['First', 'Second']);
    expect(doc.sections[0].blocks).toEqual([{ kind: 'paragraph', text: 'Opened.' }]);
    expect(doc.sections[0].subsections[0].heading.text).toBe('Deeper');
  });

  it('knows which sections have to be open for each anchor to be seen', () => {
    const anchors = anchorsOf(doc);
    expect(anchors.get('first')).toEqual(['first']);
    expect(anchors.get('deeper')).toEqual(['first', 'deeper']);
    expect(anchors.get('deepest')).toEqual(['first', 'deeper']);
  });
});

describe('inline text', () => {
  it('draws code, emphasis and links, and never takes text as HTML', () => {
    expect(html('`&kp A` then **bold** and *soft*, [a link](x.md#y)')).toBe(
      '<p><code>&amp;kp A</code> then <strong>bold</strong> and <em>soft</em>, <a href="x.md#y">a link</a></p>',
    );
    expect(html('<img src=x onerror=alert(1)>')).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  });

  it('leaves underscores inside words, escaped marks and unclosed ones alone', () => {
    expect(html('cross_word and snake_case_name')).toBe('<p>cross_word and snake_case_name</p>');
    expect(html('\\*not emphasis\\* and 2 * 3')).toBe('<p>*not emphasis* and 2 * 3</p>');
    expect(html('`` a ` inside ``')).toBe('<p><code>a ` inside</code></p>');
    expect(html('**Bold with `code` in it**')).toBe(
      '<p><strong>Bold with <code>code</code> in it</strong></p>',
    );
  });

  it('lets a long identifier in code wrap after its underscores', () => {
    expect(html('`layer_distribution`')).toBe('<p><code>layer_<wbr>distribution</code></p>');
  });
});
