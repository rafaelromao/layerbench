import { GLOSSARY_URL } from '@layoutmaster/core';
import { describe, expect, it } from 'vitest';
import { glossaryHash, HELP } from './help.js';
import { anchorsOf, type Block, parseBlocks, parseGuide } from './markdown.js';
import { GUIDE_PAGES, guidePage, resolveLink } from './pages.js';

const anchors = new Map(GUIDE_PAGES.map((p) => [p.slug, anchorsOf(parseGuide(p.source))]));

/** Every link target written in a page, from its paragraphs, lists and tables. */
function linksOf(blocks: Block[]): string[] {
  const texts = blocks.flatMap((b) =>
    b.kind === 'paragraph' || b.kind === 'quote' || b.kind === 'heading'
      ? [b.text]
      : b.kind === 'list'
        ? b.items
        : b.kind === 'table'
          ? [...b.head, ...b.rows.flat()]
          : [],
  );
  return texts.flatMap((t) => [...t.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]));
}

describe('the guide', () => {
  it('has a title on every page', () => {
    for (const page of GUIDE_PAGES) expect(parseGuide(page.source).title, page.path).not.toBe('');
  });

  it('only links to pages and sections that exist', () => {
    for (const page of GUIDE_PAGES) {
      for (const href of linksOf(parseBlocks(page.source))) {
        const target = resolveLink(href, page);
        if (target.kind === 'external') {
          expect(target.href, `${page.path}: ${href}`).toMatch(/^https:\/\//);
          continue;
        }
        expect(guidePage(target.slug), `${page.path}: ${href}`).toBeDefined();
        if (target.hash) {
          expect(anchors.get(target.slug)?.has(target.hash), `${page.path}: ${href}`).toBe(true);
        }
      }
    }
  });

  it('sends every "?" in the app to a section that exists', () => {
    for (const [name, help] of Object.entries(HELP)) {
      expect(guidePage(help.page), name).toBeDefined();
      const section = 'section' in help ? help.section : undefined;
      if (section) expect(anchors.get(help.page)?.has(section), name).toBe(true);
    }
  });

  it('keeps links between pages in the app, and sends the rest of the repository to GitHub', () => {
    const analyzing = guidePage('analyzing');
    if (!analyzing) throw new Error('no analyzing page');
    expect(resolveLink('../METRICS.md#bands', analyzing)).toEqual({
      kind: 'page',
      slug: 'metrics',
      hash: 'bands',
    });
    expect(resolveLink('editing.md', analyzing)).toEqual({ kind: 'page', slug: 'editing' });
    expect(resolveLink('#case-and-space', analyzing)).toEqual({
      kind: 'page',
      slug: 'analyzing',
      hash: 'case-and-space',
    });
    // The glossary is docs/METRICS.md, so the specification is one directory up from it.
    expect(resolveLink('../../SPEC.md', analyzing)).toEqual({
      kind: 'external',
      href: new URL('../SPEC.md', GLOSSARY_URL).href,
    });
    expect(resolveLink('https://zmk.dev/docs', analyzing)).toEqual({
      kind: 'external',
      href: 'https://zmk.dev/docs',
    });
  });

  it('reads a rule source that cites the glossary as a place in the glossary page', () => {
    expect(glossaryHash(`${GLOSSARY_URL}#effort`)).toBe('effort');
    expect(glossaryHash(GLOSSARY_URL)).toBe('');
    expect(glossaryHash('https://zmk.dev/docs/keymaps')).toBeNull();
    // The anchors the rule sources cite are the glossary page's own.
    expect(anchors.get('metrics')?.has('effort')).toBe(true);
  });
});
