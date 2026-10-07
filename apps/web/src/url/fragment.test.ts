import { BUNDLED_LAYOUTS } from '@layerbench/core';
import { createMemoryHistory } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { createAppRouter } from '../router.js';
import { fromFragment, toFragment } from './fragment.js';
import { encodeInline } from './inline.js';
import { inlineRef } from './params.js';

const ORIGIN = 'https://app.example';

function through(rewrite: (url: URL) => URL, path: string): string {
  const url = rewrite(new URL(path, ORIGIN));
  return url.pathname + url.search + url.hash;
}

/** What the browser's address bar gets for an address the router built. */
const outgoing = (path: string) => through(toFragment, path);
/** What the router reads from an address in the browser. */
const incoming = (path: string) => through(fromFragment, path);

describe('layouts never saved, in the address', () => {
  it('leave the query for the fragment, and the rest stays where it was', () => {
    expect(outgoing('/compare?b=inline%3Abbb&corpus=en-general&layout=inline%3Aaaa')).toBe(
      '/compare?corpus=en-general#b=inline%3Abbb&layout=inline%3Aaaa',
    );
  });

  it('leaves bundled and saved layouts in the query', () => {
    for (const path of [
      '/analyze?corpus=en-general&layout=magic-romak',
      '/analyze?corpus=en-general&layout=saved%3Amine',
    ]) {
      expect(outgoing(path)).toBe(path);
    }
  });

  it('leaves an address with an anchor of its own alone', () => {
    expect(outgoing('/guide/metrics#sfb')).toBe('/guide/metrics#sfb');
    expect(outgoing('/analyze?layout=inline%3Aaaa#main')).toBe('/analyze?layout=inline%3Aaaa#main');
  });

  it('come back from the fragment into the search', () => {
    const url = fromFragment(
      new URL('/compare?corpus=en-general#b=inline%3Abbb&layout=inline%3Aaaa', ORIGIN),
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      corpus: 'en-general',
      b: 'inline:bbb',
      layout: 'inline:aaa',
    });
    expect(url.hash).toBe('');
  });

  it('leaves an anchor an anchor, and an old link as it was', () => {
    for (const path of [
      '/guide/metrics#sfb',
      '/analyze#layout=inline%3Aaaa&corpus=en-general',
      '/analyze?corpus=en-general&layout=inline%3Aaaa',
    ]) {
      expect(incoming(path)).toBe(path);
    }
  });

  it('read back exactly what was written', () => {
    const path = '/compare?b=inline%3Abbb&corpus=en-general&layer=2&layout=inline%3Aaaa';
    const back = fromFragment(toFragment(new URL(path, ORIGIN)));
    expect(Object.fromEntries(back.searchParams)).toEqual(
      Object.fromEntries(new URL(path, ORIGIN).searchParams),
    );
  });
});

describe('the router', () => {
  it('reads layouts after the # as search parameters, and writes them there', async () => {
    const router = createAppRouter({
      history: createMemoryHistory({
        initialEntries: ['/analyze?corpus=en-general#layout=inline%3Aaaa&b=inline%3Abbb'],
      }),
      basepath: '/',
    });
    await router.load();
    expect(router.state.location.search).toEqual({
      corpus: 'en-general',
      layout: 'inline:aaa',
      b: 'inline:bbb',
    });

    const next = router.buildLocation({
      to: '/compare',
      search: { corpus: 'en-general', layout: 'inline:aaa', b: 'inline:bbb' } as never,
    });
    expect(next.publicHref).toBe('/compare?corpus=en-general#b=inline%3Abbb&layout=inline%3Aaaa');
  });

  it('keeps every bundled layout, as a draft in Compare, out of the request a browser sends', async () => {
    const router = createAppRouter({ history: createMemoryHistory(), basepath: '/' });
    for (const layout of BUNDLED_LAYOUTS) {
      const ref = inlineRef(await encodeInline(layout));
      const { publicHref } = router.buildLocation({
        to: '/compare',
        search: { corpus: 'en-general', layout: ref, b: ref } as never,
      });
      const [request, fragment] = publicHref.split('#');
      // GitHub Pages answers 414 from about 8 KB; the request stays a small fraction of that.
      expect(request.length).toBeLessThan(1024);
      expect(request).not.toContain('inline');
      expect(new URLSearchParams(fragment).get('layout')).toBe(ref);
      expect(new URLSearchParams(fragment).get('b')).toBe(ref);
    }
  });
});
