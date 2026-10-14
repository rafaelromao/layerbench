import type { Collection, IndexEntry, StorageAdapter } from '@layerbench/core';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { gistIds, gitHubAccess, useGitHubSession } from '../auth/github-session.js';
import { CompositeStorage } from './composite.js';
import { GistAdapter } from './gist.js';
import { GitHubAdapter } from './github.js';
import { IndexedDbAdapter } from './indexeddb.js';
import type { StorageTarget } from './target.js';

const StorageContext = createContext<StorageAdapter | null>(null);
/**
 * Whether storage is the one documents are kept in for good. While sign-in is still being asked
 * about, or a signed-in user's repository found, it is the browser's copy alone, which may lack what
 * is only on GitHub.
 */
const SettledContext = createContext(true);

/** The GitHub copy of a signed-in user's documents: their fork, or their gists. */
export function remoteStorage(login: string, target: StorageTarget): StorageAdapter {
  return target.kind === 'repo'
    ? new GitHubAdapter({
        ...gitHubAccess,
        repo: target.repo,
        branch: target.branch,
      })
    : new GistAdapter(gitHubAccess, gistIds(login));
}

/** Makes saved documents available to the view tree. Tests pass their own adapter. */
export function StorageProvider({
  adapter,
  children,
}: {
  adapter?: StorageAdapter;
  children: ReactNode;
}) {
  const status = useGitHubSession((s) => s.status);
  const login = useGitHubSession((s) => s.login);
  const target = useGitHubSession((s) => s.target);
  const targetStatus = useGitHubSession((s) => s.targetStatus);
  const settled =
    !!adapter ||
    !(status === 'unknown' || (status === 'signed-in' && !target && targetStatus !== 'error'));

  const value = useMemo(() => {
    if (adapter) return adapter;
    const local = new IndexedDbAdapter();
    // GitHub only joins in once someone is signed in and it is known where their documents go.
    if (status !== 'signed-in' || !login || !target) return local;
    return new CompositeStorage(local, remoteStorage(login, target));
  }, [adapter, status, login, target]);

  return (
    <StorageContext.Provider value={value}>
      <SettledContext.Provider value={settled}>
        <ListingsProvider>{children}</ListingsProvider>
      </SettledContext.Provider>
    </StorageContext.Provider>
  );
}

export function useStorage(): StorageAdapter {
  const adapter = useContext(StorageContext);
  if (!adapter) throw new Error('useStorage must be used inside StorageProvider');
  return adapter;
}

export interface CollectionState {
  entries: IndexEntry[];
  /** False when the browser refuses to open its database, e.g. in a locked-down private window. */
  available: boolean;
  refresh: () => Promise<void>;
}

/** Where the last index listed for good is kept, so a visit opens with it. */
function indexKey(collection: Collection): string {
  return `layerbench:index:${collection}`;
}

function isEntry(value: unknown): value is IndexEntry {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.name === 'string';
}

function lastIndex(collection: Collection): IndexEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(indexKey(collection)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

function keepIndex(collection: Collection, entries: IndexEntry[]): void {
  try {
    localStorage.setItem(indexKey(collection), JSON.stringify(entries));
  } catch {
    // Without site data each visit waits for storage to list.
  }
}

/** A provisional list, with what the last visit listed that it lacks. */
function withLast(list: IndexEntry[], last: IndexEntry[]): IndexEntry[] {
  const ids = new Set(list.map((e) => e.id));
  return [...list, ...last.filter((e) => !ids.has(e.id))].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

type Listed = Omit<CollectionState, 'refresh'>;

/**
 * The index of one collection, shared by everything that lists it: one listing answers them all,
 * and a refresh after a save or a delete reaches every list.
 */
class Listing {
  private readonly last: IndexEntry[];
  private state: Listed;
  private readonly listeners = new Set<() => void>();
  /** Only the latest listing is shown: an earlier one from the browser alone may answer last. */
  private asked = 0;
  /** The listing still out, and the storage it asked, which a list opened meanwhile joins. */
  private pending: { storage: StorageAdapter; settled: boolean; done: Promise<void> } | null = null;

  constructor(private readonly collection: Collection) {
    this.last = lastIndex(collection);
    this.state = { entries: this.last, available: true };
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly snapshot = (): Listed => this.state;

  /** List again, whatever is already being listed: what was just saved or deleted must show. */
  refresh(storage: StorageAdapter, settled: boolean): Promise<void> {
    const ask = ++this.asked;
    const done = this.list(storage, settled, ask);
    this.pending = { storage, settled, done };
    void done.finally(() => {
      if (this.pending?.done === done) this.pending = null;
    });
    return done;
  }

  /** List for a list just opened, or a storage just changed, joining a listing already out. */
  open(storage: StorageAdapter, settled: boolean): Promise<void> {
    const p = this.pending;
    return p && p.storage === storage && p.settled === settled
      ? p.done
      : this.refresh(storage, settled);
  }

  private async list(storage: StorageAdapter, settled: boolean, ask: number): Promise<void> {
    let next: Listed;
    try {
      const list = await storage.list(this.collection);
      if (ask !== this.asked) return;
      if (settled) keepIndex(this.collection, list);
      next = { entries: settled ? list : withLast(list, this.last), available: true };
    } catch {
      if (ask !== this.asked) return;
      next = { entries: [], available: false };
    }
    this.state = next;
    for (const listener of this.listeners) listener();
  }
}

const ListingsContext = createContext<Map<Collection, Listing> | null>(null);

/** Shares one listing of each collection between everything below it. */
function ListingsProvider({ children }: { children: ReactNode }) {
  const [listings] = useState(() => new Map<Collection, Listing>());
  return <ListingsContext.Provider value={listings}>{children}</ListingsContext.Provider>;
}

/**
 * The index of one collection, refreshed on demand after a save or a delete. It opens with what the
 * last visit listed, so a list does not fill in after the page is drawn, and is listed again each
 * time a list of it opens; lists open at once share one listing. Until storage is settled, what it
 * lists only adds to that: a document held only on GitHub is not dropped, to come back once sign-in
 * is known.
 */
export function useCollection(collection: Collection): CollectionState {
  const storage = useStorage();
  const settled = useContext(SettledContext);
  const listings = useContext(ListingsContext);
  if (!listings) throw new Error('useCollection must be used inside StorageProvider');
  let listing = listings.get(collection);
  if (!listing) {
    listing = new Listing(collection);
    listings.set(collection, listing);
  }
  const { entries, available } = useSyncExternalStore(listing.subscribe, listing.snapshot);

  useEffect(() => {
    void listing.open(storage, settled);
  }, [listing, storage, settled]);

  const refresh = useCallback(() => listing.refresh(storage, settled), [listing, storage, settled]);

  return { entries, available, refresh };
}
