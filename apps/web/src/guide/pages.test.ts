import { GLOSSARY_URL } from '@layerbench/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { glossaryHash, HELP } from './help.js';
import { anchorsOf, type Block, parseBlocks, parseGuide } from './markdown.js';
import { GUIDE_PAGES, guidePage, resolveLink } from './pages.js';

const sources = new Map<string, string>();
const anchors = new Map<string, Map<string, string[]>>();

beforeAll(async () => {
  await Promise.all(
    GUIDE_PAGES.map(async (page) => {
      const source = await page.load();
      sources.set(page.slug, source);
      anchors.set(page.slug, anchorsOf(parseGuide(source)));
    }),
  );
});

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
    for (const page of GUIDE_PAGES)
      expect(parseGuide(sources.get(page.slug)!).title, page.path).not.toBe('');
  });

  it('keeps every subsection inside a section, so that nothing before the first one is a heading', () => {
    // What comes before a page's first `##` is its intro, always shown and in no section's outline:
    // a `###` there is a block of the page that cannot be closed and cannot be linked to.
    for (const page of GUIDE_PAGES) {
      const headings = parseGuide(sources.get(page.slug)!).intro.filter(
        (b) => b.kind === 'heading',
      );
      expect(headings, page.path).toEqual([]);
    }
  });

  it('only links to pages and sections that exist', () => {
    for (const page of GUIDE_PAGES) {
      for (const href of linksOf(parseBlocks(sources.get(page.slug)!))) {
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
    // The glossary is docs/METRICS.md, so the README is one directory up from it.
    expect(resolveLink('../../README.md', analyzing)).toEqual({
      kind: 'external',
      href: new URL('../README.md', GLOSSARY_URL).href,
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
