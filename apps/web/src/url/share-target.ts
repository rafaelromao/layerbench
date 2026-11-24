import { bundledLayout } from '@layerbench/core';
import { communityId } from '../community/ref.js';
import { customId } from '../custom/ref.js';
import { portableCorpusError } from './corpus-share.js';
import { decodeInline } from './inline.js';
import { DEFAULT_PARAMS, parseParams, type RawSearch, toSearch } from './params.js';
import { decodeRuleSnapshot } from './rule-snapshot.js';

export type PortableRoute = 'analyze' | 'compare';
export const PORTABLE_TARGET_ERROR_KEY = '__portableTargetError';

export interface PortableTarget {
  route: PortableRoute;
  /** Search state with fragment payloads joined, as the router sees it after `fromFragment`. */
  search: RawSearch;
  fragment: Record<string, string>;
}

export type PortableTargetResult = ({ ok: true } & PortableTarget) | { ok: false; error: string };

interface BuildPortableTarget {
  /** A router-built route address, without application state. */
  baseHref: string;
  origin: string;
  route: PortableRoute;
  search: RawSearch;
  rulesSnapshot?: string;
}

const VERSION_KEY = 'share';
const VERSION = '1';
const MAX_REQUEST_CHARS = 7_900;
const MAX_FRAGMENT_CHARS = 6_000_000;
// Chromium limits the complete serialized URL, including its fragment, to 2 Mi characters.
const MAX_URL_CHARS = 2_097_152;
const MAX_LAYOUT_BLOB_CHARS = 2_800_000;
const MAX_RULE_SNAPSHOT_CHARS = 2_800_000;

const COMMON_QUERY_KEYS = [
  'case',
  'corpus',
  'corpus2',
  'heat',
  'layout',
  'mix',
  'off',
  'rules',
  'sample',
  'share',
  'space',
  'text',
] as const;

const ANALYZE_QUERY_KEYS = new Set([...COMMON_QUERY_KEYS, 'layer']);
const COMPARE_QUERY_KEYS = new Set([...COMMON_QUERY_KEYS, 'b', 'layerA', 'layerB']);
const FRAGMENT_KEYS = new Set(['layout', 'b', 'rulesSnapshot']);

function routeNameAt(pathname: string, routerRelative = false): string | null {
  if (routerRelative) {
    const relativeRoute = pathname.replace(/\/$/, '');
    if (relativeRoute.startsWith('/') && !relativeRoute.slice(1).includes('/'))
      return relativeRoute.slice(1);
  }
  const basePath = new URL(import.meta.env.BASE_URL, 'https://portable.layerbench.invalid')
    .pathname;
  const prefix = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const route = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '';
  return (route.endsWith('/') ? route.slice(0, -1) : route) || null;
}

function routeAt(pathname: string, routerRelative = false): PortableRoute | null {
  const route = routeNameAt(pathname, routerRelative);
  return route === 'analyze' || route === 'compare' ? route : null;
}

/** Whether an address is one of the two share routes, before or after router base-path stripping. */
export function isPortableRoutePath(pathname: string): boolean {
  return routeAt(pathname, true) !== null;
}

/** Routes whose router state can carry a custom rule snapshot in its browser-only fragment. */
export function isRuleSnapshotRoutePath(pathname: string): boolean {
  const route = routeNameAt(pathname, true) ?? routeNameAt(pathname);
  return route === 'analyze' || route === 'compare' || route === 'library';
}

export function isPortableLayoutRef(ref: string): boolean {
  return ref.startsWith('inline:') || communityId(ref) !== null || bundledLayout(ref) !== undefined;
}

/**
 * Keep a custom rule snapshot when an in-app action moves the same analysis, even after a local
 * corpus has made the current URL non-shareable. The portable marker is retained independently.
 */
export function retainPortableState(source: RawSearch, destination: RawSearch): RawSearch {
  const next: RawSearch = { ...destination };
  if (String(source.share) === VERSION) next.share = VERSION;
  if (
    source.rulesSnapshot !== undefined &&
    source.rules === destination.rules &&
    customId(destination.rules ?? '') !== null
  )
    next.rulesSnapshot = source.rulesSnapshot;
  return next;
}

function entriesOf(params: URLSearchParams): [string, string][] {
  return [...params.entries()];
}

function hasDuplicates(entries: [string, string][]): boolean {
  return new Set(entries.map(([key]) => key)).size !== entries.length;
}

function canonicalParams(entries: [string, string][]): string {
  const params = new URLSearchParams();
  for (const [key, value] of [...entries].sort(([a], [b]) => a.localeCompare(b))) {
    params.append(key, value);
  }
  return params.toString();
}

function layerValue(value: string | undefined): number | null {
  if (value === undefined) return 0;
  if (!/^(0|[1-9]\d*)$/.test(value)) return null;
  const number = Number(value);
  return number <= 31 ? number : null;
}

function targetError(
  url: URL,
  origin: string,
  queryEntries: [string, string][],
  fragmentEntries: [string, string][],
  routerRelative = false,
): PortableTargetResult {
  const expectedOrigin = new URL(origin).origin;
  if (url.origin !== expectedOrigin || url.username || url.password)
    return { ok: false, error: 'Share links must stay on this LayerBench site.' };

  const route = routeAt(url.pathname, routerRelative);
  if (!route) return { ok: false, error: 'Share links only support Analyze and Compare.' };
  const search = Object.fromEntries(queryEntries);
  if (search[VERSION_KEY] !== VERSION)
    return { ok: false, error: 'This share link uses an unsupported version.' };

  const allowed = route === 'analyze' ? ANALYZE_QUERY_KEYS : COMPARE_QUERY_KEYS;
  if (queryEntries.some(([key]) => !allowed.has(key)))
    return { ok: false, error: 'This share link contains unknown state. Create a new link.' };
  if (fragmentEntries.some(([key]) => !FRAGMENT_KEYS.has(key)))
    return {
      ok: false,
      error: 'This share link contains an unsupported snapshot. Create a new link.',
    };

  if (hasDuplicates(queryEntries) || hasDuplicates(fragmentEntries))
    return { ok: false, error: 'This share link repeats a state field. Create a new link.' };
  if (url.search.slice(1) !== canonicalParams(queryEntries))
    return { ok: false, error: 'This share link is not canonical. Create a new link.' };
  if (url.hash.slice(1) !== canonicalParams(fragmentEntries))
    return { ok: false, error: 'This share link is not canonical. Create a new link.' };
  if ((url.pathname + url.search).length >= MAX_REQUEST_CHARS)
    return {
      ok: false,
      error: 'The share link request is too large. Remove some state and retry.',
    };
  if (url.hash.length > MAX_FRAGMENT_CHARS)
    return { ok: false, error: 'The share snapshots are too large. Remove some state and retry.' };

  const fragment = Object.fromEntries(fragmentEntries);
  const effective: RawSearch = { ...search };
  for (const key of ['layout', 'b'] as const) {
    const inQuery = search[key];
    const inFragment = fragment[key];
    if (inQuery !== undefined && inFragment !== undefined)
      return { ok: false, error: 'This share link repeats a layout snapshot. Create a new link.' };
    const ref = inFragment ?? inQuery;
    if (ref === undefined || (key === 'b' && route !== 'compare')) continue;
    if (inFragment !== undefined && !inFragment.startsWith('inline:'))
      return { ok: false, error: 'A layout snapshot is malformed. Create a new share link.' };
    if (ref.startsWith('inline:')) {
      if (inFragment === undefined)
        return { ok: false, error: 'Layout snapshots must be kept in the URL fragment.' };
      if (ref.length > MAX_LAYOUT_BLOB_CHARS)
        return { ok: false, error: 'A layout snapshot is too large to share.' };
    }
    effective[key] = ref;
  }
  if (search.layout === undefined && fragment.layout === undefined)
    return { ok: false, error: 'This share link is missing Layout A. Create a new link.' };
  if (route === 'compare' && search.b === undefined && fragment.b === undefined)
    return { ok: false, error: 'This share link is missing Layout B. Create a new link.' };
  if (route === 'analyze' && (search.b !== undefined || fragment.b !== undefined))
    return { ok: false, error: 'An Analyze share link cannot include a second layout.' };
  if ([effective.layout, effective.b].some((ref) => ref !== undefined && customId(ref) !== null))
    return {
      ok: false,
      error: 'Custom layouts must be included as snapshots in a share link. Create a new link.',
    };
  if ([effective.layout, effective.b].some((ref) => ref !== undefined && !isPortableLayoutRef(ref)))
    return {
      ok: false,
      error:
        'Share links can use bundled or community layouts; local layouts must be included as snapshots.',
    };
  const corpusError = portableCorpusError(
    search.corpus ?? DEFAULT_PARAMS.corpus,
    search.corpus2 ?? null,
  );
  if (corpusError) return { ok: false, error: corpusError };

  const ruleSnapshot = fragment.rulesSnapshot;
  const ruleRef = search.rules;
  if (customId(ruleRef ?? '') !== null) {
    if (!ruleSnapshot)
      return {
        ok: false,
        error: 'This link is missing its custom rule-set snapshot. Create a new share link.',
      };
    if (ruleSnapshot.length > MAX_RULE_SNAPSHOT_CHARS)
      return {
        ok: false,
        error:
          'The custom rule-set snapshot is too large. Choose a smaller rule set and create a new share link.',
      };
    const decoded = decodeRuleSnapshot(ruleSnapshot);
    if (!decoded.ok)
      return {
        ok: false,
        error: `${decoded.error} Create a new share link.`,
      };
  } else if (ruleSnapshot !== undefined) {
    return {
      ok: false,
      error: 'A custom rule-set snapshot cannot be used with a preset. Create a new share link.',
    };
  }

  if (route === 'compare') {
    for (const key of ['layerA', 'layerB'] as const) {
      const value = layerValue(search[key]);
      if (value === null)
        return { ok: false, error: `Compare ${key === 'layerA' ? 'A' : 'B'} layer is invalid.` };
      if (value > 0) effective[key] = String(value);
    }
  }

  const rawForParams = { ...effective };
  delete rawForParams.share;
  delete rawForParams.rulesSnapshot;
  delete rawForParams.b;
  delete rawForParams.layerA;
  delete rawForParams.layerB;
  const normalized = toSearch(parseParams(rawForParams));
  const expected: RawSearch = { ...normalized, share: VERSION };
  if (fragment.layout !== undefined) delete expected.layout;
  if (route === 'compare') {
    if (fragment.b === undefined) expected.b = effective.b;
    if (effective.layerA !== undefined) expected.layerA = effective.layerA;
    if (effective.layerB !== undefined) expected.layerB = effective.layerB;
  }
  const expectedEntries = Object.entries(expected).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  if (canonicalParams(expectedEntries) !== canonicalParams(queryEntries)) {
    return {
      ok: false,
      error: 'This share link has invalid or noncanonical state. Create a new link.',
    };
  }

  if (url.href.length >= MAX_URL_CHARS)
    return {
      ok: false,
      error:
        'The share link is too long for browsers to open. Shorten the snapshots or choose smaller ones, then retry.',
    };

  if (ruleSnapshot !== undefined) effective.rulesSnapshot = ruleSnapshot;
  return { ok: true, route, search: effective, fragment };
}

/**
 * Build the one versioned same-site target format used by Analyze and Compare. Inline layouts and a
 * custom rule set live after `#`, which is not part of the request made to GitHub Pages.
 */
export async function buildPortableTarget(input: BuildPortableTarget): Promise<string> {
  const expectedOrigin = new URL(input.origin).origin;
  const base = new URL(input.baseHref, expectedOrigin);
  if (base.origin !== expectedOrigin || routeAt(base.pathname) !== input.route)
    throw new Error('Share links must use a supported route on this LayerBench site.');

  const search: RawSearch = { ...input.search, [VERSION_KEY]: VERSION };
  const fragment: Record<string, string> = {};
  for (const key of ['layout', 'b'] as const) {
    const value = search[key];
    if (value?.startsWith('inline:')) {
      if (value.length > MAX_LAYOUT_BLOB_CHARS)
        throw new Error('A layout snapshot is too large to share.');
      const decoded = await decodeInline(value.slice('inline:'.length));
      if (!decoded.ok) {
        if (decoded.error === 'inline layout too large')
          throw new Error(
            'A layout snapshot exceeds the 2 MB limit. Shorten its description or remove some content and retry.',
          );
        throw new Error('A layout snapshot cannot be opened. Create a new share link.');
      }
      fragment[key] = value;
      delete search[key];
    }
  }
  if (input.rulesSnapshot !== undefined) fragment.rulesSnapshot = input.rulesSnapshot;

  const query = canonicalParams(
    Object.entries(search).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const hash = canonicalParams(Object.entries(fragment));
  const href = `${base.origin}${base.pathname}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`;
  const validated = parsePortableTarget(href, expectedOrigin);
  if (!validated.ok) throw new Error(validated.error);
  return href;
}

/** Validate a router search object, retaining the legacy path when no portable marker is present. */
export function parsePortableSearch(
  route: PortableRoute,
  input: RawSearch,
  originalHref?: string,
): PortableTargetResult | null {
  if (input.share === undefined) return null;
  const ingressError = input[PORTABLE_TARGET_ERROR_KEY];
  if (typeof ingressError === 'string') return { ok: false, error: ingressError };
  if (originalHref) {
    try {
      const address = new URL(originalHref);
      if (address.searchParams.has(VERSION_KEY)) {
        const original = parsePortableTarget(address.href, address.origin);
        if (!original.ok) return original;
        if (original.route !== route)
          return { ok: false, error: 'This share link route does not match its state.' };
        return original;
      }
    } catch {
      return { ok: false, error: 'This share link is not a valid URL.' };
    }
  }
  const search: RawSearch = { ...input };
  const fragment: Record<string, string> = {};
  for (const key of ['layout', 'b'] as const) {
    const value = search[key];
    if (value?.startsWith('inline:')) {
      fragment[key] = value;
      delete search[key];
    }
  }
  if (search.rulesSnapshot !== undefined) {
    fragment.rulesSnapshot = search.rulesSnapshot;
    delete search.rulesSnapshot;
  }
  const queryEntries = Object.entries(search).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  const fragmentEntries = Object.entries(fragment);
  const url = new URL(`/${route}`, 'https://portable.layerbench.invalid');
  const query = canonicalParams(queryEntries);
  const hash = canonicalParams(fragmentEntries);
  url.search = query;
  url.hash = hash;
  return targetError(url, url.origin, queryEntries, fragmentEntries, true);
}

/** Validate and read a versioned target. Ordinary, unmarked app URLs are not portable targets. */
export function parsePortableTarget(
  href: string,
  origin: string,
  routerRelative = false,
): PortableTargetResult {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return { ok: false, error: 'This share link is not a valid URL.' };
  }
  const queryEntries = entriesOf(url.searchParams);
  const fragmentEntries = entriesOf(new URLSearchParams(url.hash.slice(1)));
  return targetError(url, origin, queryEntries, fragmentEntries, routerRelative);
}
