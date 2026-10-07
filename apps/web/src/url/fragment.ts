import type { LocationRewrite } from '@tanstack/react-router';

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

/** The router's address to the browser's: inline layouts leave the query for the fragment. */
export function toFragment(url: URL): URL {
  // An address with an anchor of its own is the guide's, which carries no layouts.
  if (url.hash) return url;
  const moved = [...url.searchParams].filter(([, value]) => isInline(value));
  if (moved.length === 0) return url;
  const fragment = new URLSearchParams();
  for (const [key, value] of moved) {
    url.searchParams.delete(key);
    fragment.set(key, value);
  }
  url.hash = fragment.toString();
  return url;
}

/** The browser's address to the router's: a fragment made only of inline layouts joins the search. */
export function fromFragment(url: URL): URL {
  const entries = [...new URLSearchParams(url.hash.slice(1))];
  // Anything else after the `#` is an anchor, such as a guide section's, and stays one.
  if (entries.length === 0 || !entries.every(([, value]) => isInline(value))) return url;
  for (const [key, value] of entries) url.searchParams.set(key, value);
  url.hash = '';
  return url;
}

export const inlineInFragment: LocationRewrite = {
  input: ({ url }) => fromFragment(url),
  output: ({ url }) => toFragment(url),
};
