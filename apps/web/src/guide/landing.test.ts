import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BUNDLED_LAYOUTS } from '@layerbench/core';
import { createMemoryHistory } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { createAppRouter } from '../router.js';
import { parseParams, type RawSearch, toSearch } from '../url/params.js';
import { anchorsOf, parseGuide } from './markdown.js';
import { guidePage } from './pages.js';

/**
 * The landing page, `docs/site`, which the build serves at `/about/`. It is hand-written HTML with
 * no build of its own, so this is what keeps it honest: every link lands somewhere real, every
 * image is there at the size the page says, and nothing breaks the policy the page declares.
 */

/** Resolved from the working directory, as the test corpora are: a jsdom module has an http URL. */
const SITE = resolve(process.cwd(), '../../docs/site');
const html = readFileSync(resolve(SITE, 'index.html'), 'utf8');
const page = new DOMParser().parseFromString(html, 'text/html');

const all = (selector: string) => [...page.querySelectorAll(selector)];
const attr = (el: Element, name: string) => el.getAttribute(name) ?? '';

/** Every address the page loads or links to, with the element that holds it. */
const references = [
  ...all('[href]').map((el) => ({ el, url: attr(el, 'href') })),
  ...all('[src]').map((el) => ({ el, url: attr(el, 'src') })),
  ...all('[srcset]').map((el) => ({ el, url: attr(el, 'srcset') })),
];

const isExternal = (url: string) => /^https?:\/\//.test(url);
const isAppLink = (url: string) => url.startsWith('/');
const isLocal = (url: string) => !isExternal(url) && !isAppLink(url) && !url.startsWith('#');

/** The app's route paths, with `$param` segments matching any one segment. */
const router = createAppRouter({ history: createMemoryHistory(), basepath: '/' });
const routes = Object.keys(router.routesByPath).map(
  (path) => new RegExp(`^${path.replace(/\$[^/]+/g, '[^/]+').replace(/\/$/, '')}/?$`),
);

const corpora = new Set(
  (
    JSON.parse(readFileSync(resolve(process.cwd(), 'public/corpora/index.json'), 'utf8')) as {
      id: string;
    }[]
  ).map((c) => c.id),
);
const layouts = new Set(BUNDLED_LAYOUTS.map((l) => l.id));

/** A PNG's pixel size, from its IHDR chunk. */
function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('the landing page', () => {
  it('declares a policy that loads nothing from elsewhere, and keeps to it', () => {
    const policy = attr(
      page.querySelector('meta[http-equiv="Content-Security-Policy"]')!,
      'content',
    );
    expect(policy).toContain("default-src 'none'");
    // `script-src` and `style-src 'unsafe-inline'` are left out, so these would be blocked.
    expect(all('script')).toEqual([]);
    expect(all('style')).toEqual([]);
    expect(all('[style]').map((el) => el.outerHTML.slice(0, 80))).toEqual([]);
    const loaded = references.filter(({ el }) => el.tagName !== 'A').map(({ url }) => url);
    expect(loaded.filter(isExternal)).toEqual([]);
  });

  it('has every file it refers to', () => {
    for (const { url } of references.filter(({ url }) => isLocal(url))) {
      expect(existsSync(resolve(SITE, url)), url).toBe(true);
    }
  });

  it('draws every image at the proportions of the file behind it', () => {
    for (const img of all('img')) {
      const src = attr(img, 'src');
      expect(attr(img, 'alt'), src).not.toBe('');
      const width = Number(attr(img, 'width'));
      const height = Number(attr(img, 'height'));
      // The dark picture beside it must have the same shape, or the page would jump on a switch.
      const files = [
        src,
        ...[...(img.parentElement?.querySelectorAll('source') ?? [])].map((s) => attr(s, 'srcset')),
      ];
      for (const file of files) {
        const size = pngSize(resolve(SITE, file));
        expect(Math.abs(size.width / size.height - width / height), file).toBeLessThan(0.01);
      }
    }
  });

  it('links within itself only to sections that exist', () => {
    for (const { url } of references.filter(({ url }) => url.startsWith('#'))) {
      expect(page.getElementById(url.slice(1)), url).not.toBeNull();
    }
  });

  it('links into the app only to views that exist, with a query the app reads back unchanged', () => {
    for (const { url } of references.filter(({ url }) => isAppLink(url))) {
      const link = new URL(url, 'https://app.invalid');
      expect(
        routes.some((route) => route.test(link.pathname)),
        url,
      ).toBe(true);
      if (link.pathname.startsWith('/guide')) {
        const slug = link.pathname.replace(/^\/guide\/?/, '');
        const target = guidePage(slug);
        expect(target, url).toBeDefined();
        const hash = link.hash.slice(1);
        if (hash && target) expect(anchorsOf(parseGuide(target.source)).has(hash), url).toBe(true);
        continue;
      }
      if (link.search === '') continue;
      const { b, ...rest } = Object.fromEntries(link.searchParams) as RawSearch;
      expect(toSearch(parseParams(rest)), url).toEqual(rest);
      for (const id of [rest.layout, b]) if (id) expect(layouts.has(id), url).toBe(true);
      for (const id of [rest.corpus, rest.corpus2]) if (id) expect(corpora.has(id), url).toBe(true);
    }
  });

  it('gives every source of the comparison an address', () => {
    const notes = all('.notes > li');
    expect(notes.length).toBeGreaterThan(0);
    for (const note of notes) {
      const links = [...note.querySelectorAll('a')].map((a) => attr(a, 'href'));
      expect(
        links.some((href) => href.startsWith('https://')),
        note.id,
      ).toBe(true);
    }
    // And every mark in the table points at one of them.
    for (const mark of all('.compare sup a')) {
      expect(page.getElementById(attr(mark, 'href').slice(1)), attr(mark, 'href')).not.toBeNull();
    }
  });

  it('names every bundled layout, each opening its analysis', () => {
    const linked = all('.layouts a').map((a) => new URL(attr(a, 'href'), 'https://app.invalid'));
    expect(new Set(linked.map((u) => u.searchParams.get('layout')))).toEqual(layouts);
    expect(all('.layouts-title')[0]?.textContent).toContain(String(layouts.size));
  });
});
