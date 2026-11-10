import type { StorageAdapter } from '@layerbench/core';
import { useEffect } from 'react';
import { create } from 'zustand';
import { toast } from '../state/toasts.js';
import { CompositeStorage, type Conflict, type CopiedUp } from './composite.js';
import { type Unsynced, unsynced } from './unsynced.js';

/** Where sending this browser's documents to the gists stands. */
export interface SyncState {
  phase: 'idle' | 'syncing' | 'failed';
  /** Why the last attempt stopped, while `phase` is `failed`. */
  error: string | null;
  /** What the last attempt that went through did, conflicts included. */
  last: CopiedUp | null;
  /** Whether the dialog that settles conflicts is open. */
  reviewing: boolean;
  /**
   * Set while unsent documents are held back because this browser last sent its documents to
   * another account than the one signed in now: they may not be this account's to have.
   */
  held: { account: string } | null;
}

const IDLE: SyncState = { phase: 'idle', error: null, last: null, reviewing: false, held: null };

export const useSync = create<SyncState>(() => IDLE);

/** A save that failed to reach the gists is tried again once things have been quiet this long. */
const SETTLE_MS = 3_000;
/** And again after each failure, later and later. */
const RETRY_MS = [30_000, 60_000, 120_000, 300_000];
/** A tab shown again does not start another attempt when one has just run. */
const MIN_GAP_MS = 15_000;
/** An attempt that has not finished by now has failed, so the next one can be made. */
const ATTEMPT_LIMIT_MS = 120_000;

const documents = (n: number) => `${n} document${n === 1 ? '' : 's'}`;

/** What to tell the user an attempt did, if it did anything they would not see for themselves. */
function announce({ copied }: CopiedUp): void {
  if (copied > 0) {
    toast.info(`Sent ${documents(copied)} saved in this browser to your GitHub account`);
  }
}

/**
 * Which conflict this is: the document and the version of it in the gists. This browser's version
 * is left out, since it changes with every save of the document while the conflict stays one.
 */
const versionOf = (c: Conflict) => `${c.collection}/${c.id}@${c.theirs.sha}`;

/**
 * The conflicts the dialog has opened for since the page loaded. It opens by itself for ones it has
 * not shown, once, so a user who puts it off is not asked again at every attempt; it is open to
 * them from the status whenever they want it, and opens again for these on the next visit.
 */
const offered = new Set<string>();

/** Forget which conflicts were shown: for tests, which each stand for a visit. */
export function forgetOffered(): void {
  offered.clear();
}

/** What an attempt found, kept for the status, and the dialog opened for conflicts not shown yet. */
export function noteResult(result: CopiedUp): void {
  const fresh = result.conflicts.some((c) => !offered.has(versionOf(c)));
  for (const c of result.conflicts) offered.add(versionOf(c));
  useSync.setState({ last: result, ...(fresh && { reviewing: true }) });
}

/** Open or close the dialog that settles conflicts. */
export function review(open: boolean): void {
  useSync.setState({ reviewing: open });
}

/** A conflict the user has settled, taken off what the status shows. */
export function settledConflict(conflict: Conflict): void {
  useSync.setState((s) => ({
    last: s.last && { ...s.last, conflicts: s.last.conflicts.filter((c) => c !== conflict) },
  }));
}

let active: { now: () => void; release: () => void } | null = null;

/** Try sending now, rather than waiting for the next attempt; nothing while storage is this browser's alone. */
export function syncNow(): void {
  active?.now();
}

/** Send what was held back, as the user has said it is theirs to send to the account signed in. */
export function sendHeld(): void {
  active?.release();
}

/**
 * Keep this browser's unsent documents going to the gists by themselves: once as storage starts
 * reaching them, which is when someone has signed in or opens the page signed in, if anything is
 * waiting; again whenever a save failed to reach them, once things are quiet, and after each
 * failure, later and later; and when the browser comes back online or the tab is shown again with
 * something still unsent. Each attempt is a copy up, which writes over nothing the gists hold that
 * the edit was not made on. Returns what stops it.
 *
 * Documents waiting when someone signs in whom this browser has not last sent to are held back for
 * the user to release: the browser may be one that someone else used, and sending is public enough
 * (secret gists are unlisted, not private) not to be done to a stranger's account unasked.
 */
export function startAutoSync(
  storage: CompositeStorage,
  marks: Unsynced = unsynced,
  timing: { settleMs?: number; retryMs?: readonly number[]; attemptMs?: number } = {},
  login: string | null = null,
): () => void {
  if (!storage.reachesRemote) return () => {};
  const settleMs = timing.settleMs ?? SETTLE_MS;
  const retryMs = timing.retryMs ?? RETRY_MS;
  const attemptMs = timing.attemptMs ?? ATTEMPT_LIMIT_MS;
  let stopped = false;
  let running = false;
  let held = false;
  let failures = 0;
  let lastRun = 0;
  /** How many marks the last attempt left that it neither sent nor reported, to stop at no progress. */
  let lastLeft = -1;
  let settle: ReturnType<typeof setTimeout> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;

  const cancelTimers = () => {
    if (settle) clearTimeout(settle);
    if (retry) clearTimeout(retry);
    settle = null;
    retry = null;
  };

  /** The attempt, or a failure once it has gone on too long: one stuck request must not stop every later one. */
  const attempt = (): Promise<CopiedUp> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const given = new AbortController();
    const limit = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        // Stopped, not only given up on: it ends at the next document, keeping what went up.
        given.abort();
        reject(new Error('GitHub did not answer in time'));
      }, attemptMs);
    });
    const copying = storage.copyUp({ signal: given.signal });
    // One that finishes after the limit has been given up on is nobody's to hear about.
    copying.catch(() => {});
    return Promise.race([copying, limit]).finally(() => clearTimeout(timer));
  };

  const run = async (): Promise<void> => {
    if (stopped || running || held) return;
    running = true;
    cancelTimers();
    useSync.setState({ phase: 'syncing', error: null });
    let result: CopiedUp | null = null;
    try {
      result = await attempt();
      if (stopped) return;
      failures = 0;
      // What this browser holds has been sent to this account, whose it is from now on.
      if (login) marks.setAccount(login);
      useSync.setState({ phase: 'idle', error: null });
      noteResult(result);
      announce(result);
    } catch (e) {
      if (stopped) return;
      failures++;
      useSync.setState({ phase: 'failed', error: e instanceof Error ? e.message : String(e) });
      retry = setTimeout(() => void run(), retryMs[Math.min(failures, retryMs.length) - 1]);
    } finally {
      running = false;
      lastRun = Date.now();
    }
    // Something saved while it ran, and not one it left for the user, has not been looked at. Once
    // an attempt has left as many as the one before it, it can do nothing more with them.
    if (result) {
      const left = marks.count() - result.conflicts.length - result.taken;
      if (left > 0 && left !== lastLeft && !settle) {
        settle = setTimeout(() => void run(), settleMs);
      }
      lastLeft = left;
    }
  };

  const onMarks = () => {
    if (marks.count() === 0) {
      // Nothing is left to send, so nothing is held back, waiting to be tried again, or failing.
      cancelTimers();
      if (held) {
        held = false;
        useSync.setState({ held: null });
      }
      if (!running && useSync.getState().phase === 'failed') {
        useSync.setState({ phase: 'idle', error: null });
      }
    } else if (!running && !settle && !retry && !held) {
      settle = setTimeout(() => void run(), settleMs);
    }
  };
  const unsubscribe = marks.subscribe(onMarks);
  const onOnline = () => {
    if (marks.count() > 0) void run();
  };
  const onVisible = () => {
    if (
      document.visibilityState === 'visible' &&
      marks.count() > 0 &&
      Date.now() - lastRun >= MIN_GAP_MS
    ) {
      void run();
    }
  };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);

  const release = () => {
    if (!held) return;
    held = false;
    if (login) marks.setAccount(login);
    useSync.setState({ held: null });
    void run();
  };
  const handle = { now: () => void run(), release };
  active = handle;

  const before = marks.account();
  if (marks.count() === 0) {
    // Nothing is waiting, so there is nothing to send, and nothing to ask: the browser is the
    // account's that signed in.
    if (login) marks.setAccount(login);
  } else if (login && before !== null && before !== login) {
    held = true;
    useSync.setState({ held: { account: before } });
  } else {
    // The first account to sign in with documents waiting is the browser's from here on, whether
    // or not this attempt goes through: another that signs in after it has them held.
    if (login) marks.setAccount(login);
    void run();
  }

  return () => {
    stopped = true;
    cancelTimers();
    unsubscribe();
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    if (active === handle) active = null;
    useSync.setState(IDLE);
  };
}

/** Runs `startAutoSync` for as long as `storage` is the one the app saves to and reaches the gists. */
export function AutoSync({
  storage,
  login = null,
}: {
  storage: StorageAdapter;
  login?: string | null;
}): null {
  useEffect(
    () =>
      storage instanceof CompositeStorage ? startAutoSync(storage, unsynced, {}, login) : undefined,
    [storage, login],
  );
  return null;
}
