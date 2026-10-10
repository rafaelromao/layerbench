import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryLink } from '../test/memory-link.js';
import type { RawSearch } from '../url/params.js';
import { useRouterLink } from './router-link.js';
import type { LinkPort } from './session.js';

/** A link to test, and how the world changes it: a link followed, then Back. */
interface Harness {
  link: LinkPort;
  /** Someone else puts `ref` in the link: a link followed. */
  follow(ref: string): Promise<void>;
  /** Back, to the link before the last one followed. */
  back(): Promise<void>;
  /** Wait until what was written has landed. */
  settled(): Promise<void>;
}

function memoryHarness(start: string): Harness {
  const link = new MemoryLink(start);
  const history = [start];
  return {
    link,
    async follow(ref) {
      history.push(ref);
      link.visit(ref);
    },
    async back() {
      history.pop();
      link.visit(history[history.length - 1]);
    },
    async settled() {},
  };
}

/** The router's link, on Analyze in a router of its own with a memory history. */
async function routerHarness(start: string): Promise<Harness & { search(): RawSearch }> {
  let link: LinkPort | null = null;
  function Probe() {
    link = useRouterLink();
    return null;
  }
  const root = createRootRoute({ component: Outlet });
  const analyze = createRoute({
    getParentRoute: () => root,
    path: '/analyze',
    validateSearch: (search: Record<string, unknown>): RawSearch => search as RawSearch,
    component: Probe,
  });
  const router = createRouter({
    routeTree: root.addChildren([analyze]),
    history: createMemoryHistory({ initialEntries: [`/analyze?layout=${start}&layer=2`] }),
  });
  render(<RouterProvider router={router} />);
  await waitFor(() => expect(link).not.toBeNull());
  const search = () => router.state.location.search as RawSearch;
  return {
    get link() {
      return link as LinkPort;
    },
    search,
    async follow(ref) {
      await act(() => router.navigate({ to: '/analyze', search: { layout: ref } as never }));
    },
    async back() {
      await act(async () => router.history.back());
      await waitFor(() => expect(router.state.status).toBe('idle'));
    },
    async settled() {
      await waitFor(() => expect(search().layout).toBe(link?.current()));
    },
  };
}

describe.each([
  ['in memory', async (start: string) => memoryHarness(start)],
  ['through the router', routerHarness],
])('The link, %s', (_, harness) => {
  it('names the layout it opened with', async () => {
    const h = await harness('qwerty');
    expect(h.link.current()).toBe('qwerty');
  });

  it('holds what was written, at once and once it lands, and is not heard to change for it', async () => {
    const h = await harness('qwerty');
    const heard: string[] = [];
    h.link.subscribe((ref) => heard.push(ref));
    h.link.write('colemak', 'edit');
    expect(h.link.current()).toBe('colemak');
    await h.settled();
    expect(h.link.current()).toBe('colemak');
    expect(heard.filter((ref) => ref !== 'colemak')).toEqual([]);
  });

  it('is heard when anything else changes it: a link followed, and Back', async () => {
    const h = await harness('qwerty');
    const heard: string[] = [];
    h.link.subscribe((ref) => heard.push(ref));
    await h.follow('colemak');
    await waitFor(() => expect(heard).toEqual(['colemak']));
    await h.back();
    await waitFor(() => expect(heard).toEqual(['colemak', 'qwerty']));
    expect(h.link.current()).toBe('qwerty');
  });
});

describe('The link through the router', () => {
  it('keeps the rest of the link as it is, and starts a layout picked on its first layer', async () => {
    const h = await routerHarness('qwerty');
    h.link.write('colemak', 'edit');
    await h.settled();
    expect(h.search().layout).toBe('colemak');
    // This router reads numbers as numbers; the app's keeps every value a string.
    expect(String(h.search().layer)).toBe('2');
    h.link.write('dvorak', 'open');
    await h.settled();
    expect(h.search().layer).toBeUndefined();
  });
});
