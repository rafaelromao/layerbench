import type { Collection, IndexEntry, StorageAdapter } from '@layoutmaster/core';
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
import { gitHubReady, useSession } from '../state/session.js';
import { CompositeStorage } from './composite.js';
import { GitHubAdapter } from './github.js';
import { IndexedDbAdapter } from './indexeddb.js';

const StorageContext = createContext<StorageAdapter | null>(null);

/** Makes saved documents available to the view tree. Tests pass their own adapter. */
export function StorageProvider({
  adapter,
  children,
}: {
  adapter?: StorageAdapter;
  children: ReactNode;
}) {
  const github = useSession((s) => s.github);
  const token = useSession((s) => s.githubToken);

  const value = useMemo(() => {
    if (adapter) return adapter;
    const local = new IndexedDbAdapter();
    // The repository only joins in once it is configured and switched on.
    if (!gitHubReady({ github, githubToken: token })) return local;
    return new CompositeStorage(local, new GitHubAdapter({ ...github, token }));
  }, [adapter, github, token]);

  return <StorageContext.Provider value={value}>{children}</StorageContext.Provider>;
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

/** The index of one collection, refreshed on demand after a save or a delete. */
export function useCollection(collection: Collection): CollectionState {
  const storage = useStorage();
  const [entries, setEntries] = useState<IndexEntry[]>([]);
  const [available, setAvailable] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const list = await storage.list(collection);
      if (!mounted.current) return;
      setEntries(list);
      setAvailable(true);
    } catch {
      if (!mounted.current) return;
      setEntries([]);
      setAvailable(false);
    }
  }, [storage, collection]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { entries, available, refresh };
}
