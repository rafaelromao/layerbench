import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_PARAMS, parseParams, type RawSearch, toSearch } from '../url/params.js';
import type { LinkPort } from './session.js';

type Navigate = ReturnType<typeof useNavigate>;

/**
 * The link port over the app's router, on Analyze. What the session writes replaces the reference
 * in place, the page left where it was scrolled to; whatever else changes it — Back, a link followed
 * — reaches the session through `follow`, which the view calls with the reference the link names.
 */
export class RouterLink implements LinkPort {
  private readonly listeners = new Set<(ref: string) => void>();

  constructor(
    private ref: string,
    private readonly navigate: (opts: Parameters<Navigate>[0]) => unknown,
  ) {}

  current(): string {
    return this.ref;
  }

  write(ref: string, how: 'edit' | 'open'): void {
    this.ref = ref;
    this.navigate({
      to: '/analyze',
      // Written onto whatever the link holds by then, so settings changed meanwhile stay. A layout
      // picked starts on its first layer.
      search: ((prev: RawSearch) =>
        how === 'open'
          ? toSearch(parseParams(prev), { layoutRef: ref, layer: DEFAULT_PARAMS.layer })
          : { ...prev, layout: ref }) as never,
      replace: true,
      resetScroll: false,
    });
  }

  /** The reference the link names now, as the router has it. */
  follow(ref: string): void {
    if (ref === this.ref) return;
    this.ref = ref;
    for (const listener of this.listeners) listener(ref);
  }

  subscribe(listener: (ref: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** The link of the view this is called in, as a port: one for as long as the view is mounted. */
export function useRouterLink(): RouterLink {
  const search = useSearch({ strict: false }) as RawSearch;
  const ref = parseParams(search).layoutRef;
  const navigate = useNavigate();
  const navigateNow = useRef(navigate);
  navigateNow.current = navigate;
  const [link] = useState(() => new RouterLink(ref, (opts) => navigateNow.current(opts)));
  useEffect(() => link.follow(ref), [link, ref]);
  return link;
}
