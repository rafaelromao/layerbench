import type { Collection, IndexEntry, StorageAdapter } from '@layerbench/core';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
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
      <SettledContext.Provider value={settled}>{children}</SettledContext.Provider>
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

/**
 * The index of one collection, refreshed on demand after a save or a delete. It opens with what the
 * last visit listed, so a list does not fill in after the page is drawn. Until storage is settled,
 * what it lists only adds to that: a document held only on GitHub is not dropped, to come back once
 * sign-in is known.
 */
export function useCollection(collection: Collection): CollectionState {
  const storage = useStorage();
  const settled = useContext(SettledContext);
  const [last] = useState(() => lastIndex(collection));
  const [entries, setEntries] = useState<IndexEntry[]>(last);
  const [available, setAvailable] = useState(true);
  const mounted = useRef(true);
  /** Only the latest listing is shown: an earlier one from the browser alone may answer last. */
  const asked = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const ask = ++asked.current;
    try {
      const list = await storage.list(collection);
      if (!mounted.current || ask !== asked.current) return;
      if (settled) keepIndex(collection, list);
      setEntries(settled ? list : withLast(list, last));
      setAvailable(true);
    } catch {
      if (!mounted.current || ask !== asked.current) return;
      setEntries([]);
      setAvailable(false);
    }
  }, [storage, collection, settled, last]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { entries, available, refresh };
}
