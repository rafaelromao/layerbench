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
const LAYOUT_TOO_LARGE_MESSAGE =
  'The layout snapshot exceeds the 2 MB limit. Shorten the layout description, then share again.';
const DRAFT_TOO_LONG_MESSAGE =
  'The draft URL would be too long. Your edit is still in the editor; shorten the layout description or choose a smaller custom rule set.';

/**
 * The link port over the app's router, on Analyze. What the session writes replaces the reference
 * in place, the page left where it was scrolled to; whatever else changes it — Back, a link followed
 * — reaches the session through `follow`, which the view calls with the reference the link names.
 */
export class RouterLink implements LinkPort {
  private readonly listeners = new Set<(ref: string) => void>();
  private navigation = 0;
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

  revision(): number {
    return this.navigation;
  }

  openSaved(localRef: string, snapshot: { ref: string; tooLarge: boolean }): boolean {
    const inline = this.openSearch(this.search, snapshot.ref);
    const useLocal = snapshot.tooLarge || this.tooLong(inline);
    const destination = useLocal ? this.openSearch(this.search, localRef) : inline;
    if (useLocal && this.tooLong(destination)) {
      this.reportRefusal();
      return false;
    }
    this.localPortableFallback = { localRef };
    this.ref = useLocal ? localRef : snapshot.ref;
    if (useLocal)
      toast.error(snapshot.tooLarge ? LAYOUT_TOO_LARGE_MESSAGE : LOCAL_ONLY_TOO_LONG_MESSAGE);
    this.navigate({
      to: '/analyze',
      search: destination as never,
      replace: true,
      resetScroll: false,
    });
    return true;
  }

  private tooLong(search: RawSearch): boolean {
    return portableSearchTooLong('analyze', search, window.location.origin);
  }

  private reportRefusal(): void {
    toast.error(
      'This layout would make the analysis URL too long. Choose a smaller custom rule set or layout; Analyze is unchanged.',
    );
  }

  canOpen(ref: string): boolean {
    if (this.tooLong(this.openSearch(this.search, ref))) {
      this.reportRefusal();
      return false;
    }
    return true;
  }

  private openSearch(search: RawSearch, ref: string): RawSearch {
    const next = toSearch(parseParams(search), {
      layoutRef: ref,
      layer: DEFAULT_PARAMS.layer,
    });
    const retained = retainPortableState(search, next);
    if (String(search.share) !== '1' || !isPortableLayoutRef(ref)) delete retained.share;
    return retained;
  }

  write(ref: string, how: 'edit' | 'open', savedRef?: string, tooLarge = false): void {
    this.ref = ref;
    if (this.localPortableFallback && savedRef !== undefined) {
      this.localPortableFallback = { localRef: savedRef };
    }
    if (this.localPortableFallback && (how === 'open' || customId(ref) !== null)) {
      this.localPortableFallback = customId(ref) !== null ? { localRef: ref } : null;
    }
    this.navigate({
      to: '/analyze',
      // Written onto whatever the link holds by then, so settings changed meanwhile stay. A layout
      // picked starts on its first layer.
      search: ((prev: RawSearch) => {
        if (how === 'edit' && ref.startsWith('inline:')) {
          const previousLayout = typeof prev.layout === 'string' ? prev.layout : null;
          const localRef =
            this.localPortableFallback?.localRef ??
            (previousLayout !== null && customId(previousLayout) !== null ? previousLayout : null);
          const candidate = { ...prev, layout: ref };
          const portableCandidate = { ...candidate, share: '1' };
          const tooLong = this.tooLong(candidate);

          if (tooLong || tooLarge) {
            const fallback = savedRef ?? localRef;
            if (fallback !== null) return this.keepLocalOnly(prev, candidate, fallback, tooLarge);
            this.ref = parseParams(prev).layoutRef;
            toast.error(tooLarge ? LAYOUT_TOO_LARGE_MESSAGE : DRAFT_TOO_LONG_MESSAGE);
            return prev;
          } else if (localRef !== null || prev.share === '1') {
            const portable = parsePortableSearch('analyze', portableCandidate);
            if (portable?.ok && !this.tooLong(portableCandidate)) {
              if (localRef !== null) this.localPortableFallback = { localRef };
              return portableCandidate;
            }
          }
          return candidate;
        }
        if (how === 'edit') {
          const candidate = { ...prev, layout: ref };
          if (!this.tooLong(candidate)) return candidate;
          this.ref = parseParams(prev).layoutRef;
          toast.error(DRAFT_TOO_LONG_MESSAGE);
          return prev;
        }
        return this.openSearch(prev, ref);
      }) as never,
      replace: true,
      resetScroll: false,
    });
  }

  private keepLocalOnly(
    previous: RawSearch,
    search: RawSearch,
    localRef: string,
    tooLarge: boolean,
  ): RawSearch {
    const localOnly: RawSearch = { ...search, layout: localRef };
    delete localOnly.share;
    if (portableSearchTooLong('analyze', localOnly, window.location.origin)) {
      this.ref = parseParams(previous).layoutRef;
      toast.error(
        [
          'Even the saved layout reference would make the analysis URL too long.',
          'Choose a smaller custom rule set, then try again.',
        ].join(' '),
      );
      return previous;
    }
    this.localPortableFallback = { localRef };
    this.ref = localRef;
    toast.error(tooLarge ? LAYOUT_TOO_LARGE_MESSAGE : LOCAL_ONLY_TOO_LONG_MESSAGE);
    return localOnly;
  }

  /** The reference the link names now, as the router has it. */
  follow(ref: string, href: string, search: RawSearch, navigation = false): void {
    if (navigation || (this.observedHref !== null && this.observedHref !== href))
      this.navigation += 1;
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
