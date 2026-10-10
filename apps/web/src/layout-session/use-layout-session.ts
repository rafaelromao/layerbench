import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useStorage } from '../storage/use-storage.js';
import { tabDrafts } from './drafts.js';
import { useRouterLink } from './router-link.js';
import { createLayoutSession, type LayoutSession, type SessionState } from './session.js';

export type LayoutSessionView = SessionState &
  Pick<LayoutSession, 'edited' | 'save' | 'open' | 'link'>;

const OPENING: SessionState = { status: 'opening', opening: 0 };
const nothing = () => () => {};

/**
 * The layout session of the view on `/analyze`: the layout the link names, opened, with what the
 * session says of it and what can be done with it. Signing in swaps the storage under it without
 * opening the layout again; one that would not open, though, is tried again, as the storage signed
 * in to may have it.
 */
export function useLayoutSession(): LayoutSessionView {
  const link = useRouterLink();
  const storage = useStorage();
  const storageNow = useRef(storage);
  storageNow.current = storage;
  const [attempt, setAttempt] = useState(0);
  const [session, setSession] = useState<LayoutSession | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` asks for a new session
  useEffect(() => {
    const s = createLayoutSession({ storage: () => storageNow.current, drafts: tabDrafts(), link });
    setSession(s);
    return () => s.dispose();
  }, [link, attempt]);

  const first = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new storage asks for this
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (session && session.getState().status !== 'open') setAttempt((n) => n + 1);
  }, [storage]);

  const state = useSyncExternalStore(
    session?.subscribe ?? nothing,
    session?.getState ?? (() => OPENING),
  );
  return useMemo(
    () =>
      session
        ? {
            ...state,
            edited: session.edited,
            save: session.save,
            open: session.open,
            link: session.link,
          }
        : {
            ...OPENING,
            edited: () => {},
            save: async () => ({ ok: false, reason: 'failed', error: 'nothing open' }) as const,
            open: async () => {},
            link: async () => link.current(),
          },
    [session, state, link],
  );
}
