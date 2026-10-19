import {
  compileLayout,
  documentLayout,
  isDocumentId,
  type Layout,
  toCanonicalJson,
} from '@layerbench/core';
import { create } from 'zustand';

/**
 * Community layouts: layouts someone else made, accepted into the Library by merging the pull
 * request that added one to the `layerbench-data` branch. That branch holds `community/<id>.json`,
 * each a layout as LayerBench saves it, and `community/index.json`, which a workflow there keeps
 * listing them. Anyone can read them, with no sign-in, so a layout accepted there is in every
 * Library at its next load, with no deploy.
 *
 * They are read as plain files rather than through the GitHub API, whose unauthenticated calls are
 * limited to 60 an hour for each address. The policy's `connect-src` names this folder of it.
 */
export const COMMUNITY_ORIGIN = 'https://raw.githubusercontent.com';
const COMMUNITY_BASE = `${COMMUNITY_ORIGIN}/rafaelromao/layerbench/layerbench-data/community/`;

/** Where community files are read from: a file's name in, its JSON out. */
export type CommunitySource = (file: string) => Promise<unknown>;

/** The branch on GitHub. A file there is cached for minutes, so the browser asks it every time. */
export const githubSource: CommunitySource = async (file) => {
  const res = await fetch(`${COMMUNITY_BASE}${file}`, { cache: 'no-cache', credentials: 'omit' });
  if (!res.ok) throw new Error(`${file}: ${res.status} ${res.statusText}`.trim());
  return res.json();
};

/**
 * The ids an index lists, `{ "layouts": ["id", …] }`: each a document id, once. The branch is
 * written by pull requests, so nothing in it is trusted: anything else is left out, and no id that
 * could leave the folder becomes a path.
 */
export function indexIds(index: unknown): string[] {
  const listed = (index as { layouts?: unknown } | null)?.layouts;
  if (!Array.isArray(listed)) throw new Error('index.json lists no layouts');
  const ids = listed.filter((id): id is string => typeof id === 'string' && isDocumentId(id));
  return [...new Set(ids)];
}

/**
 * A community document, checked as a bundled one is, `documentLayout`, and compiled, so every view
 * that lists it can open it; null if either fails.
 */
function checked(id: string, doc: unknown): Layout | null {
  try {
    const layout = documentLayout(id, doc);
    compileLayout(layout);
    return layout;
  } catch {
    return null;
  }
}

/** A layout the index lists, as read: the layout, not one as LayerBench saves it, or not read. */
export type CommunityRead =
  | { id: string; status: 'read'; layout: Layout }
  | { id: string; status: 'invalid' }
  | { id: string; status: 'unread' };

/**
 * Read every community layout the index lists. One that is not a layout as LayerBench saves it, with
 * an author, is invalid; one whose file would not come is unread, which says nothing about it. An
 * index that will not read fails the whole.
 */
export async function readCommunity(source: CommunitySource): Promise<CommunityRead[]> {
  const ids = indexIds(await source('index.json'));
  return Promise.all(
    ids.map(async (id): Promise<CommunityRead> => {
      let doc: unknown;
      try {
        doc = await source(`${id}.json`);
      } catch {
        return { id, status: 'unread' };
      }
      const layout = checked(id, doc);
      return layout ? { id, status: 'read', layout } : { id, status: 'invalid' };
    }),
  );
}

/**
 * The layouts a read gives, in the index's order: a layout whose file would not come this time
 * keeps the copy last read, if there is one, rather than leaving the Library for a network blip.
 */
export function readLayouts(read: CommunityRead[], before: Layout[]): Layout[] {
  return read.flatMap((r) => {
    if (r.status === 'read') return [r.layout];
    if (r.status === 'invalid') return [];
    const kept = before.find((l) => l.id === r.id);
    return kept ? [kept] : [];
  });
}

/** The community layouts last read, kept in this browser so the Library has them at once. */
const CACHE_KEY = 'layerbench:community';

function fromCache(): Layout[] {
  try {
    const docs: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]');
    if (!Array.isArray(docs)) return [];
    // Checked again: this browser's storage is no more trusted than the branch.
    return docs
      .map((doc) => checked(String((doc as { id?: unknown } | null)?.id), doc))
      .filter((layout) => layout !== null);
  } catch {
    return [];
  }
}

function toCache(layouts: Layout[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(layouts.map((l) => toCanonicalJson(l))));
  } catch {
    // A browser that keeps nothing reads them again next time.
  }
}

export interface CommunityState {
  /** The community layouts: those last read, until a fresh read replaces them. */
  layouts: Layout[];
  /**
   * `cached` until a read is asked for; `failed` keeps whatever was cached; `partial` is a read in
   * which some files did not come, each kept as last read, if it was.
   */
  status: 'cached' | 'reading' | 'read' | 'partial' | 'failed';
  error: string | null;
}

export const useCommunity = create<CommunityState>(() => ({
  layouts: fromCache(),
  status: 'cached',
  error: null,
}));

let source: CommunitySource = githubSource;
let reading: Promise<void> | null = null;
let readThisLoad = false;

/**
 * Read the community layouts afresh, keeping them for the next visit. Reads asked for while one is
 * running share it. The Library asks each time it opens.
 */
export function refreshCommunity(): Promise<void> {
  if (reading) return reading;
  useCommunity.setState({ status: 'reading' });
  const from = source;
  reading = readCommunity(from)
    .then(
      (read) => {
        if (from !== source) return;
        const layouts = readLayouts(read, useCommunity.getState().layouts);
        toCache(layouts);
        const unread = read.filter((r) => r.status === 'unread').map((r) => r.id);
        // Whole only when every file came: a link to one that did not reads again.
        readThisLoad = unread.length === 0;
        useCommunity.setState(
          unread.length === 0
            ? { layouts, status: 'read', error: null }
            : { layouts, status: 'partial', error: `could not read ${unread.join(', ')}` },
        );
      },
      (e: unknown) => {
        if (from !== source) return;
        // What the last read found is no longer known to be whole: the next link reads again.
        readThisLoad = false;
        useCommunity.setState({
          status: 'failed',
          error: e instanceof Error ? e.message : String(e),
        });
      },
    )
    .finally(() => {
      if (from === source) reading = null;
    });
  return reading;
}

/** Read them afresh unless they have been since the page loaded: for a view that only lists them. */
export function readCommunityOnce(): Promise<void> {
  return readThisLoad ? Promise.resolve() : refreshCommunity();
}

/**
 * The community layout `id`, as the branch has it now: they are read afresh first, unless they have
 * been since the page loaded, so a link opens one accepted, changed or removed since the last visit
 * as it is. The copy kept here stands in only when the branch cannot be read. A read that failed,
 * or left a file unread, is tried again by the next link.
 */
export async function communityLayout(id: string): Promise<Layout | undefined> {
  await readCommunityOnce();
  return useCommunity.getState().layouts.find((l) => l.id === id);
}

/** Read from somewhere else, and start over from this browser's cache: for tests. */
export function setCommunitySource(next: CommunitySource): void {
  source = next;
  reading = null;
  readThisLoad = false;
  useCommunity.setState({ layouts: fromCache(), status: 'cached', error: null });
}
