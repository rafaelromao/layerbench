import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { customRef } from '../custom/ref.js';
import { useDocumentsChanged } from '../state/documents-changed.js';
import { useStorage } from '../storage/use-storage.js';
import { tabDrafts } from './drafts.js';
import { useRouterLink } from './router-link.js';
import { createLayoutSession, type LayoutSession, type SessionState } from './session.js';

/**
 * Whether a layout replaced in storage under an editor is to be opened again in it: only one with
 * nothing unsaved, which is the custom layout's own link. Opened over unsaved edits it would drop
 * them; left, they are weighed against the version they were made on when they are saved.
 */
export function reopenAfterReplace(state: SessionState, changed: readonly string[]): boolean {
  return (
    state.status === 'open' &&
    state.storedId !== null &&
    changed.includes(`layouts/${state.storedId}`) &&
    state.pickedRef === customRef(state.storedId)
  );
}

export type LayoutSessionView = SessionState &
  Pick<LayoutSession, 'edited' | 'save' | 'duplicate' | 'open' | 'link'>;

/** The layout session once its layout is open, as the editor has it. */
export type OpenSession = Extract<LayoutSessionView, { status: 'open' }>;

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

  // A layout replaced in storage under the editor (the user chose the account's version of it) is
  // opened again, so the next Save is not of the copy that was replaced.
  const replaced = useDocumentsChanged((s) => s.tick);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a document replaced asks for this
  useEffect(() => {
    if (!session) return;
    const now = session.getState();
    const { changed } = useDocumentsChanged.getState();
    if (reopenAfterReplace(now, changed) && now.status === 'open' && now.storedId) {
      void session.open(customRef(now.storedId));
    }
  }, [replaced]);

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
            duplicate: session.duplicate,
            open: session.open,
            link: session.link,
          }
        : {
            ...OPENING,
            edited: () => {},
            save: async () => ({ ok: false, reason: 'failed', error: 'nothing open' }) as const,
            duplicate: async () =>
              ({ ok: false, reason: 'failed', error: 'nothing open' }) as const,
            open: async () => {},
            link: async () => link.current(),
          },
    [session, state, link],
  );
}
