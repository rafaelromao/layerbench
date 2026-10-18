import { documentLayout, isDocumentId, type Layout, toCanonicalJson } from '@layerbench/core';
import { create } from 'zustand';

/**
 * Community layouts: layouts someone else made, accepted into the Library by merging the pull
 * request that added one to the `layerbench-data` branch. That branch holds `community/<id>.json`,
 * each a layout as LayerBench saves it, and `community/index.json`, which a workflow there keeps
 * listing them. Anyone can read them, with no sign-in, so a layout accepted there is in every
 * Library at its next load, with no deploy.
 *
 * They are read as plain files rather than through the GitHub API, whose unauthenticated calls are
 * limited to 60 an hour for each address. The policy's `connect-src` names this origin.
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

/** A community document, checked as a bundled one is: `documentLayout`, or null if it fails. */
function checked(id: string, doc: unknown): Layout | null {
  try {
    return documentLayout(id, doc);
  } catch {
    return null;
  }
}

/**
 * Read every community layout the index lists. A layout that will not read, or is not a layout as
 * LayerBench saves it, with an author and a linked source, is left out; an index that will not read
 * fails the whole.
 */
export async function readCommunity(source: CommunitySource): Promise<Layout[]> {
  const ids = indexIds(await source('index.json'));
  const read = await Promise.all(
    ids.map(async (id) => {
      try {
        return checked(id, await source(`${id}.json`));
      } catch {
        return null;
      }
    }),
  );
  return read.filter((layout) => layout !== null);
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
  /** `cached` until a read is asked for; `failed` keeps whatever was cached. */
  status: 'cached' | 'reading' | 'read' | 'failed';
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
      (layouts) => {
        if (from !== source) return;
        toCache(layouts);
        useCommunity.setState({ layouts, status: 'read', error: null });
      },
      (e: unknown) => {
        if (from !== source) return;
        useCommunity.setState({
          status: 'failed',
          error: e instanceof Error ? e.message : String(e),
        });
      },
    )
    .finally(() => {
      if (from !== source) return;
      readThisLoad = true;
      reading = null;
    });
  return reading;
}

/**
 * The community layout `id`, from those kept here, or once they are read afresh when it is not among
 * them and they have not been read since the page loaded: a link to one accepted since the last
 * visit opens too.
 */
export async function communityLayout(id: string): Promise<Layout | undefined> {
  const find = () => useCommunity.getState().layouts.find((l) => l.id === id);
  const found = find();
  if (found || readThisLoad) return found;
  await refreshCommunity();
  return find();
}

/** Read from somewhere else, and start over from this browser's cache: for tests. */
export function setCommunitySource(next: CommunitySource): void {
  source = next;
  reading = null;
  readThisLoad = false;
  useCommunity.setState({ layouts: fromCache(), status: 'cached', error: null });
}
