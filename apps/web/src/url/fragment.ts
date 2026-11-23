import type { LocationRewrite } from '@tanstack/react-router';
import { PORTABLE_TARGET_ERROR_KEY, parsePortableTarget } from './share-target.js';

/**
 * A layout that was never saved travels in its link as `inline:` and the whole compressed document,
 * which can run to kilobytes, two of them in Compare. GitHub Pages refuses a request whose address
 * is about 8 KB or longer, before the app could even load, so in the address the browser shows and
 * sends, those values live after the `#`, which a browser never sends anywhere:
 * `/analyze?corpus=en-general#layout=inline%3A…`.
 *
 * Inside the app they are search parameters like any other. The router moves them across at the
 * edge, in both directions: `toFragment` on every address it writes or renders as a link,
 * `fromFragment` on every address it reads, a reload and Back included.
 */
const INLINE = 'inline:';

function isInline(value: string): boolean {
  return value.startsWith(INLINE);
}

function canonicalParams(entries: [string, string][]): string {
  const params = new URLSearchParams();
  for (const [key, value] of [...entries].sort(([a], [b]) => a.localeCompare(b)))
    params.append(key, value);
  return params.toString();
}

/** The router's address to the browser's: inline layouts leave the query for the fragment. */
export function toFragment(url: URL): URL {
  // An address with an anchor of its own is the guide's, which carries no layouts.
  if (url.hash) return url;
  const portable = url.searchParams.get('share') === '1';
  const moved = [...url.searchParams].filter(
    ([key, value]) => isInline(value) || (portable && key === 'rulesSnapshot'),
  );
  const fragment = new URLSearchParams();
  for (const [key, value] of moved) {
    url.searchParams.delete(key);
    fragment.set(key, value);
  }
  if (portable) {
    const query = canonicalParams([...url.searchParams]);
    url.search = query;
    if (fragment.size > 0) url.hash = canonicalParams([...fragment]);
  } else if (moved.length > 0) {
    url.hash = fragment.toString();
  }
  return url;
}

/** The browser's address to the router's: a fragment made only of inline layouts joins the search. */
export function fromFragment(url: URL): URL {
  const entries = [...new URLSearchParams(url.hash.slice(1))] as [string, string][];
  // Anything else after the `#` is an anchor, such as a guide section's, and stays one.
  const portable = url.searchParams.get('share') === '1';
  if (!portable && (entries.length === 0 || !entries.every(([, value]) => isInline(value))))
    return url;
  if (portable) {
    const target = parsePortableTarget(url.href, url.origin);
    if (!target.ok) url.searchParams.set(PORTABLE_TARGET_ERROR_KEY, target.error);
  }
  if (entries.length === 0) return url;
  for (const [key, value] of entries) url.searchParams.set(key, value);
  url.hash = '';
  return url;
}

export const inlineInFragment: LocationRewrite = {
  input: ({ url }) => fromFragment(url),
  output: ({ url }) => toFragment(url),
};
