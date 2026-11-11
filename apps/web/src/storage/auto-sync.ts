import { COLLECTIONS, type StorageAdapter } from '@layerbench/core';
import { useEffect } from 'react';
import { create } from 'zustand';
import { toast } from '../state/toasts.js';
import { CompositeStorage, type Conflict, type CopiedUp, CopyUpError } from './composite.js';
import { type Missing, type Unsynced, unsynced } from './unsynced.js';

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
  /** Whether an attempt is waiting on a timer: about to run, or to be tried again. */
  scheduled: boolean;
  /** The documents this browser holds that the account lacks, as last looked; null if not yet. */
  missing: Missing[] | null;
  /** Whether the last look at this browser's documents against the account's did not finish. */
  auditFailed: boolean;
  /** Whether this browser's documents are being looked at against the account's now. */
  auditing: boolean;
}

const IDLE: SyncState = {
  phase: 'idle',
  error: null,
  last: null,
  reviewing: false,
  held: null,
  scheduled: false,
  missing: null,
  auditFailed: false,
  auditing: false,
};

export const useSync = create<SyncState>(() => IDLE);

/** A save that failed to reach the gists is tried again once things have been quiet this long. */
const SETTLE_MS = 3_000;
/** And again after each failure, later and later. */
const RETRY_MS = [30_000, 60_000, 120_000, 300_000];
/** A tab shown again does not start another attempt when one has just run. */
const MIN_GAP_MS = 15_000;
/** An attempt that has not finished by now has failed, so the next one can be made. */
const ATTEMPT_LIMIT_MS = 120_000;
/** This browser's documents are looked at against the account's at most this often. */
const AUDIT_EVERY_MS = 12 * 3_600_000;

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

/**
 * Run `work` if no other tab is sending, and say so (null) if one is: they all hear the same online
 * event at once, and two sending would each edit a gist's index from what the other had not written
 * yet. Where the browser has no Web Locks, or refuses to give one (site data blocked), it runs.
 */
export async function whileSending<T>(work: () => Promise<T>): Promise<T | null> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return work();
  let started = false;
  try {
    return await locks.request('layerbench:send', { ifAvailable: true }, (lock) => {
      if (!lock) return null;
      started = true;
      return work();
    });
  } catch (e) {
    // The work failing is its own error; only a lock that could not be asked for is got round.
    if (started) throw e;
    return work();
  }
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** What a copy of everything did, in a sentence. */
function copyMessage({ copied, current, conflicts, taken, failed }: CopiedUp): string {
  const parts = [`Copied ${documents(copied)} to GitHub`];
  if (current > 0) parts.push(`${current} ${current === 1 ? 'was' : 'were'} already up to date`);
  if (conflicts.length > 0) {
    const n = conflicts.length;
    parts.push(
      `${n} ${n === 1 ? 'was' : 'were'} changed here and in GitHub, and ${n === 1 ? 'waits' : 'wait'} for you to choose`,
    );
  }
  if (failed.length > 0) {
    parts.push(`${failed.length} could not be sent (${failed[0].name}: ${failed[0].error})`);
  }
  if (taken > 0) {
    parts.push(
      `${taken} ${taken === 1 ? 'layout stays' : 'layouts stay'} in this browser, as GitHub has another of the same name`,
    );
  }
  return parts.join('; ');
}

/**
 * What the user asks for with "copy everything": the documents this browser holds are weighed
 * against the account's, as `copy` does, one tab at a time, and what came of it is said. Conflicts
 * found are asked about like any other, and kept even if it stopped partway.
 */
export async function copyEverything(copy: () => Promise<CopiedUp>): Promise<void> {
  try {
    const result = await whileSending(copy);
    if (result === null) {
      toast.info('Another tab of LayerBench is sending right now. Try again in a moment.');
      return;
    }
    noteResult(result);
    toast.info(copyMessage(result));
  } catch (e) {
    if (e instanceof CopyUpError) noteResult(mergedWithShown(e.result));
    const copied = e instanceof CopyUpError ? e.copied : 0;
    toast.error(`Copying stopped after ${documents(copied)}: ${messageOf(e)}`);
  } finally {
    // What the account lacks is not what it lacked: looked at again, so the status says so.
    active?.audit();
  }
}

/**
 * A result that stopped partway, with the conflicts already shown for documents it did not reach: they
 * are still there, and must not vanish from the status, or close the dialog, because it ended early.
 */
function mergedWithShown(result: CopiedUp): CopiedUp {
  const shown = useSync.getState().last?.conflicts ?? [];
  const kept = shown.filter(
    (p) => !result.conflicts.some((c) => c.collection === p.collection && c.id === p.id),
  );
  return { ...result, conflicts: [...result.conflicts, ...kept] };
}

let active: {
  now: () => void;
  release: () => void;
  audit: () => void;
  everything: () => Promise<void>;
  send: (document: Missing) => void;
} | null = null;

/** Try sending now, rather than waiting for the next attempt; nothing while storage is this browser's alone. */
export function syncNow(): void {
  active?.now();
}

/** Send what was held back, as the user has said it is theirs to send to the account signed in. */
export function sendHeld(): void {
  active?.release();
}

/** Copy everything this browser holds, as the status offers when the account lacks some of it. */
export function sendEverything(): void {
  void active?.everything();
}

/** Look at this browser's documents against the account's again, whatever was found the last time. */
export function checkAgain(): void {
  active?.audit();
}

const keyOf = (d: { collection: string; id: string }) => `${d.collection}/${d.id}`;

/**
 * Take documents (`collection/id`) off what the account is said to lack, in the status and in the
 * look kept for the next visit: they were sent, or deleted here, so they are not what was found.
 */
export function dropMissing(keys: readonly string[], marks: Unsynced = unsynced): void {
  const gone = new Set(keys);
  const left = useSync.getState().missing?.filter((d) => !gone.has(keyOf(d)));
  if (!left || left.length === useSync.getState().missing?.length) return;
  useSync.setState({ missing: left });
  const audit = marks.audit();
  if (audit) marks.setAudit({ ...audit, lacking: left.length, missing: left });
}

/** Send one document the account lacks, as the status offers: marked as unsent, which sending takes up. */
export function sendMissing(document: Missing): void {
  active?.send(document);
}

/**
 * Delete a document the account lacks from this browser, as the status offers once the user has
 * confirmed: nothing of the account is touched. The documents deleted, as `collection/id`; null when
 * it was saved since it was listed, so that nothing was.
 */
export async function deleteMissing(
  storage: CompositeStorage,
  document: Missing,
  marks: Unsynced = unsynced,
): Promise<string[] | null> {
  // A layout's proposal goes with it, as when the Library deletes it: no layout saved there later
  // under the same id inherits it.
  const gone = await storage.deleteHere(
    document.collection,
    document.id,
    document.collection === 'layouts' ? ['proposals'] : [],
  );
  if (gone !== null) dropMissing(gone, marks);
  return gone;
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
  timing: {
    settleMs?: number;
    retryMs?: readonly number[];
    attemptMs?: number;
    auditEveryMs?: number;
  } = {},
  login: string | null = null,
): () => void {
  if (!storage.reachesRemote) return () => {};
  const settleMs = timing.settleMs ?? SETTLE_MS;
  const retryMs = timing.retryMs ?? RETRY_MS;
  const attemptMs = timing.attemptMs ?? ATTEMPT_LIMIT_MS;
  const auditEveryMs = timing.auditEveryMs ?? AUDIT_EVERY_MS;
  let stopped = false;
  /** Marks changed while an attempt was out, which it did not look at. */
  let dirty = false;
  let running = false;
  let held = false;
  let failures = 0;
  let lastRun = 0;
  /** Which marks the last attempt left that it neither sent nor reported, to stop at no progress. */
  let lastLeft: string | null = null;
  let settle: ReturnType<typeof setTimeout> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;

  const cancelTimers = () => {
    if (settle) clearTimeout(settle);
    if (retry) clearTimeout(retry);
    settle = null;
    retry = null;
    if (useSync.getState().scheduled) useSync.setState({ scheduled: false });
  };

  const later = (which: 'settle' | 'retry', ms: number, shown = true) => {
    const timer = setTimeout(() => void run(), ms);
    if (which === 'settle') settle = timer;
    else retry = timer;
    // An attempt waiting for another tab to finish is not one that is about to send.
    if (shown) useSync.setState({ scheduled: true });
  };

  /** The attempt, or a failure once it has gone on too long: one stuck request must not stop every later one. */
  const attempt = (): Promise<CopiedUp | null> => {
    const work = (): Promise<CopiedUp> => {
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
    // One tab at a time. null: another tab is sending.
    return whileSending(work);
  };

  /** The marks an attempt left that it neither sent nor reported as conflicts or for names. */
  const leftBy = (result: CopiedUp): string[] => {
    const reported = new Set(result.conflicts.map((c) => `${c.collection}/${c.id}`));
    return COLLECTIONS.flatMap((c) => marks.marked(c).map((id) => `${c}/${id}`))
      .filter((k) => !reported.has(k))
      .sort();
  };

  const run = async (): Promise<void> => {
    if (stopped || running || held) return;
    running = true;
    cancelTimers();
    useSync.setState({ phase: 'syncing', error: null });
    dirty = false;
    let result: CopiedUp | null = null;
    try {
      result = await attempt();
      if (stopped) return;
      if (result === null) {
        // Another tab is sending these: this one looks again later, in case it is not, or fails.
        useSync.setState({ phase: 'idle', error: null });
        later('retry', retryMs[0] ?? 30_000, false);
        return;
      }
      // What this browser holds has been sent to this account, whose it is from now on.
      if (login) marks.setAccount(login);
      noteResult(result);
      announce(result);
      const first = result.failed[0];
      if (first) {
        // Some could not be sent: it says which, and why, and tries again later.
        failures++;
        const more = result.failed.length > 1 ? ` (and ${result.failed.length - 1} more)` : '';
        useSync.setState({ phase: 'failed', error: `${first.name}: ${first.error}${more}` });
        later('retry', retryMs[Math.min(failures, retryMs.length) - 1]);
      } else {
        failures = 0;
        useSync.setState({ phase: 'idle', error: null });
      }
    } catch (e) {
      if (stopped) return;
      failures++;
      // What it did before it stopped is still what it found.
      if (e instanceof CopyUpError) noteResult(mergedWithShown(e.result));
      useSync.setState({ phase: 'failed', error: e instanceof Error ? e.message : String(e) });
      later('retry', retryMs[Math.min(failures, retryMs.length) - 1]);
    } finally {
      running = false;
      lastRun = Date.now();
    }
    // Something saved while it ran has not been looked at, and neither has a mark it left that is not
    // one for the user to settle. Once an attempt leaves the same ones as the one before, there is
    // nothing more it can do with them.
    if (result && result.failed.length === 0) {
      const left = leftBy(result);
      const key = left.join(',');
      if ((dirty || (left.length > result.taken && key !== lastLeft)) && !settle) {
        later('settle', settleMs);
      }
      lastLeft = key;
    }
  };

  const onMarks = () => {
    // One saved or sent since it was found missing is not what the account lacks to be told of.
    const waiting = useSync.getState().missing?.filter((d) => marks.has(d.collection, d.id));
    if (waiting?.length) dropMissing(waiting.map(keyOf), marks);
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
    } else if (running) {
      dirty = true;
    } else if (!settle && !retry && !held) {
      later('settle', settleMs);
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
  const handle = {
    now: () => void run(),
    release,
    audit: () => void audit(true),
    everything: () => copyEverything(() => storage.copyUp({ everything: true })),
    send: (document: Missing) => {
      // Marked, it is what sending takes up, over what the account holds of it, which is nothing.
      marks.mark(document.collection, document.id);
      void run();
    },
  };
  active = handle;

  /**
   * Look at every document this browser holds against the account's by content, once in a while:
   * what it finds that differs is marked, and sent or asked about like any other.
   */
  const audit = async (force = false) => {
    // An infinite interval is never: for the tests of what is not about looking at everything.
    if (stopped || held || !Number.isFinite(auditEveryMs)) return;
    // Once for each account in a while: another account that signs in is looked at at once.
    const last = marks.audit();
    // A look made before the documents were listed has only a count, so it is made again if that
    // is more than none.
    if (
      !force &&
      last &&
      last.account === (login ?? '') &&
      Date.now() - last.at < auditEveryMs &&
      (last.missing || last.lacking === 0)
    ) {
      useSync.setState({ missing: last.missing ?? [] });
      return;
    }
    const given = new AbortController();
    const timer = setTimeout(() => given.abort(), attemptMs);
    useSync.setState({ auditing: true });
    try {
      const found = await storage.audit({ signal: given.signal });
      if (stopped) return;
      // On a browser another account last sent to, what the account lacks is not for the user to be
      // offered: it may be that account's, and is not this one's to have.
      const missing = accountChanged ? [] : found.missing;
      marks.setAudit({ account: login ?? '', at: Date.now(), lacking: missing.length, missing });
      useSync.setState({ missing, auditFailed: false });
      if (found.marked > 0) void run();
    } catch {
      // Said in the status, with a way to try again; looked at again on the next visit too.
      if (!stopped) useSync.setState({ auditFailed: true });
    } finally {
      clearTimeout(timer);
      if (!stopped) useSync.setState({ auditing: false });
    }
  };

  const before = marks.account();
  const accountChanged = login !== null && before !== null && before !== login;
  if (marks.count() === 0) {
    // Nothing is waiting, so there is nothing to send, and nothing to ask: the browser is the
    // account's that signed in.
    if (login) marks.setAccount(login);
    void audit();
  } else if (login && before !== null && before !== login) {
    held = true;
    useSync.setState({ held: { account: before } });
  } else {
    // The first account to sign in with documents waiting is the browser's from here on, whether
    // or not this attempt goes through: another that signs in after it has them held.
    if (login) marks.setAccount(login);
    void run().then(() => audit());
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
