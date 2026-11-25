import { useLocation, useNavigate, useRouter } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { customId } from '../custom/ref.js';
import { toast } from '../state/toasts.js';
import { DEFAULT_PARAMS, parseParams, type RawSearch, toSearch } from '../url/params.js';
import {
  isPortableLayoutRef,
  parsePortableSearch,
  portableSearchTooLong,
  retainPortableState,
} from '../url/share-target.js';
import type { LinkPort } from './session.js';

type Navigate = ReturnType<typeof useNavigate>;

const LOCAL_ONLY_TOO_LONG_MESSAGE =
  'This layout is open on this device only because the shared URL would be too long. Shorten the layout description or choose a smaller custom rule set, then share again.';

/**
 * The link port over the app's router, on Analyze. What the session writes replaces the reference
 * in place, the page left where it was scrolled to; whatever else changes it — Back, a link followed
 * — reaches the session through `follow`, which the view calls with the reference the link names.
 */
export class RouterLink implements LinkPort {
  private readonly listeners = new Set<(ref: string) => void>();
  private pendingPortableOpen: { localRef: string; rulesSnapshot?: string } | null = null;
  private localPortableFallback: { localRef: string } | null = null;
  private observedHref: string | null = null;

  constructor(
    private ref: string,
    private search: RawSearch,
    private readonly navigate: (opts: Parameters<Navigate>[0]) => unknown,
  ) {}

  current(): string {
    return this.ref;
  }

  write(ref: string, how: 'edit' | 'open'): void {
    this.ref = ref;
    if (how === 'open' && this.localPortableFallback) {
      this.localPortableFallback = customId(ref) !== null ? { localRef: ref } : null;
    }
    if (how === 'open' && this.search.share === '1' && customId(ref) !== null) {
      // Leave the portable URL untouched while a local layout is loading. Its eventual inline
      // snapshot will be written only if no URL navigation supersedes this open.
      this.pendingPortableOpen = {
        localRef: ref,
        ...(this.search.rulesSnapshot !== undefined && {
          rulesSnapshot: this.search.rulesSnapshot,
        }),
      };
      return;
    }
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
          const portableSearch = {
            ...next,
            share: '1',
            ...(pending.rulesSnapshot !== undefined
              ? { rulesSnapshot: pending.rulesSnapshot }
              : {}),
          };
          if (portableSearchTooLong('analyze', portableSearch, window.location.origin)) {
            // Keep the selected local layout and embedded rules usable in this browser, but do not
            // replace the working route with a portable URL the browser cannot open.
            return this.keepLocalOnly(portableSearch, pending.localRef);
          }
          this.localPortableFallback = { localRef: pending.localRef };
          return portableSearch;
        }
        if (how === 'edit' && ref.startsWith('inline:')) {
          const previousLayout = typeof prev.layout === 'string' ? prev.layout : null;
          const localRef =
            this.localPortableFallback?.localRef ??
            (previousLayout !== null && customId(previousLayout) !== null ? previousLayout : null);
          const candidate = { ...prev, layout: ref };
          const portableCandidate = { ...candidate, share: '1' };
          const tooLong = portableSearchTooLong(
            'analyze',
            portableCandidate,
            window.location.origin,
          );

          if (tooLong) {
            if (localRef !== null) return this.keepLocalOnly(candidate, localRef);
            if (prev.share === '1') {
              toast.error(LOCAL_ONLY_TOO_LONG_MESSAGE);
              return prev;
            }
          } else if (localRef !== null || prev.share === '1') {
            const portable = parsePortableSearch('analyze', portableCandidate);
            if (portable?.ok) {
              if (localRef !== null) this.localPortableFallback = { localRef };
              return portableCandidate;
            }
          }
          return candidate;
        }
        if (how === 'edit') return { ...prev, layout: ref };
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

  private keepLocalOnly(search: RawSearch, localRef: string): RawSearch {
    this.ref = localRef;
    this.localPortableFallback = { localRef };
    toast.error(LOCAL_ONLY_TOO_LONG_MESSAGE);
    const localOnly: RawSearch = { ...search, layout: localRef };
    delete localOnly.share;
    return localOnly;
  }

  /** The reference the link names now, as the router has it. */
  follow(ref: string, href: string, search: RawSearch, navigation = false): void {
    if (navigation || (this.observedHref !== null && this.observedHref !== href))
      this.pendingPortableOpen = null;
    this.observedHref = href;
    this.search = search;
    if (ref === this.ref) return;
    this.localPortableFallback = null;
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
  const search = location.search as RawSearch;
  const ref = parseParams(search).layoutRef;
  const router = useRouter();
  const navigate = useNavigate();
  const navigateNow = useRef(navigate);
  navigateNow.current = navigate;
  const [link] = useState(() => new RouterLink(ref, search, (opts) => navigateNow.current(opts)));
  useEffect(
    () =>
      router.history.subscribe(() => {
        const next = router.state.location;
        const nextSearch = next.search as RawSearch;
        link.follow(parseParams(nextSearch).layoutRef, next.href, nextSearch, true);
      }),
    [link, router],
  );
  useEffect(() => link.follow(ref, location.href, search), [link, ref, location.href, search]);
  return link;
}
