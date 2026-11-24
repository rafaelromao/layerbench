import { useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { customId } from '../custom/ref.js';
import { DEFAULT_PARAMS, parseParams, type RawSearch, toSearch } from '../url/params.js';
import { isPortableLayoutRef, retainPortableState } from '../url/share-target.js';
import type { LinkPort } from './session.js';

type Navigate = ReturnType<typeof useNavigate>;

/**
 * The link port over the app's router, on Analyze. What the session writes replaces the reference
 * in place, the page left where it was scrolled to; whatever else changes it — Back, a link followed
 * — reaches the session through `follow`, which the view calls with the reference the link names.
 */
export class RouterLink implements LinkPort {
  private readonly listeners = new Set<(ref: string) => void>();
  private pendingPortableOpen: { rulesSnapshot?: string } | null = null;
  private observedHref: string | null = null;

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
      search: ((prev: RawSearch) => {
        if (how === 'edit' && this.pendingPortableOpen && ref.startsWith('inline:')) {
          const pending = this.pendingPortableOpen;
          this.pendingPortableOpen = null;
          const next = toSearch(parseParams(prev), {
            layoutRef: ref,
            layer: DEFAULT_PARAMS.layer,
          });
          return {
            ...next,
            share: '1',
            ...(pending.rulesSnapshot !== undefined
              ? { rulesSnapshot: pending.rulesSnapshot }
              : {}),
          };
        }
        if (how === 'edit') return { ...prev, layout: ref };
        if (prev.share === '1' && customId(ref) !== null) {
          // A portable target cannot name a local id. Let the session open the selected layout and
          // write its inline reference before changing the URL, keeping its rules snapshot intact.
          this.pendingPortableOpen = {
            ...(prev.rulesSnapshot !== undefined && { rulesSnapshot: prev.rulesSnapshot }),
          };
          return prev;
        }
        const next = toSearch(parseParams(prev), {
          layoutRef: ref,
          layer: DEFAULT_PARAMS.layer,
        });
        this.pendingPortableOpen = null;
        const retained = retainPortableState(prev, next);
        if (String(prev.share) !== '1' || !isPortableLayoutRef(ref)) delete retained.share;
        return retained;
      }) as never,
      replace: true,
      resetScroll: false,
    });
  }

  /** The reference the link names now, as the router has it. */
  follow(ref: string, href: string): void {
    if (this.observedHref !== null && this.observedHref !== href) this.pendingPortableOpen = null;
    this.observedHref = href;
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
  const location = useLocation();
  const ref = parseParams(location.search as RawSearch).layoutRef;
  const navigate = useNavigate();
  const navigateNow = useRef(navigate);
  navigateNow.current = navigate;
  const [link] = useState(() => new RouterLink(ref, (opts) => navigateNow.current(opts)));
  useEffect(() => link.follow(ref, location.href), [link, ref, location.href]);
  return link;
}
