import type { StorageAdapter } from '@layerbench/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToasts } from '../state/toasts.js';
import { memoryMarks } from '../test/memory-marks.js';
import { MemoryStorage } from '../test/memory-storage.js';
import {
  checkAgain,
  copyEverything,
  dropMissing,
  forgetOffered,
  review,
  sendEverything,
  sendHeld,
  startAutoSync,
  syncNow,
  useSync,
  whileSending,
} from './auto-sync.js';
import { CompositeStorage, type Conflict, CopyUpError } from './composite.js';

/** Looking at every document is for the tests of it: elsewhere it would add requests that are not the point. */
const NO_AUDIT = Number.POSITIVE_INFINITY;
const TIMING = {
  settleMs: 1_000,
  retryMs: [5_000, 10_000],
  attemptMs: 20_000,
  auditEveryMs: NO_AUDIT,
};

function texts(): string[] {
  return useToasts.getState().toasts.map((t) => t.text);
}

/** A browser holding `Mine`, saved while nobody was signed in, and gists to send it to. */
async function offlineEdit() {
  const marks = memoryMarks();
  const local = new MemoryStorage('local');
  const remote = new MemoryStorage('github');
  await new CompositeStorage(local, null, marks).put('layouts', 'mine', { name: 'Mine' });
  return { marks, local, remote, storage: new CompositeStorage(local, remote, marks) };
}

/** Make `remote` fail every list for as long as `down.on`. */
function breakable(remote: StorageAdapter) {
  const down = { on: true };
  const list = remote.list.bind(remote);
  remote.list = async (collection) => {
    if (down.on) throw new Error('GitHub responded 503');
    return list(collection);
  };
  return down;
}

beforeEach(() => {
  vi.useFakeTimers();
  useToasts.setState({ toasts: [] });
  forgetOffered();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  useSync.setState({
    phase: 'idle',
    error: null,
    last: null,
    reviewing: false,
    held: null,
    scheduled: false,
    missing: null,
    auditFailed: false,
    auditing: false,
  });
});

describe('sending by itself', () => {
  it('sends what was saved while signed out as soon as storage reaches the gists', async () => {
    const { storage, remote, marks } = await offlineEdit();
    const stop = startAutoSync(storage, marks, TIMING);
    await vi.waitFor(async () =>
      expect((await remote.get('layouts', 'mine'))?.doc).toEqual({ name: 'Mine' }),
    );
    await vi.waitFor(() => expect(useSync.getState().phase).toBe('idle'));
    expect(marks.count()).toBe(0);
    expect(useSync.getState().last).toMatchObject({ copied: 1 });
    expect(texts()).toEqual(['Sent 1 document saved in this browser to your GitHub account']);
    stop();
  });

  it('does not so much as ask the gists when nothing is waiting', async () => {
    const marks = memoryMarks();
    const remote = new MemoryStorage('github');
    const storage = new CompositeStorage(new MemoryStorage('local'), remote, marks);
    const listed = vi.spyOn(remote, 'list');
    const stop = startAutoSync(storage, marks, TIMING);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(listed).not.toHaveBeenCalled();
    expect(useSync.getState()).toMatchObject({ phase: 'idle', last: null });
    expect(texts()).toEqual([]);
    stop();
  });

  it('does nothing where storage is this browser alone', async () => {
    const marks = memoryMarks();
    const storage = new CompositeStorage(new MemoryStorage('local'), null, marks);
    await storage.put('layouts', 'a', { name: 'A' });
    const stop = startAutoSync(storage, marks, TIMING);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(useSync.getState()).toMatchObject({ phase: 'idle', last: null });
    stop();
  });

  it('tries again once things are quiet after a save the gists did not take', async () => {
    const marks = memoryMarks();
    const local = new MemoryStorage('local');
    const remote = new MemoryStorage('github');
    const put = remote.put.bind(remote);
    let refuse = true;
    remote.put = async (collection, id, doc, opts) => {
      if (refuse) throw new Error('GitHub responded 401');
      return put(collection, id, doc, opts);
    };
    const storage = new CompositeStorage(local, remote, marks);
    const stop = startAutoSync(storage, marks, TIMING);

    // A save while signed in that GitHub turns down: the browser keeps it, marked, and the status says why.
    await storage.put('layouts', 'mine', { name: 'Mine' });
    expect(marks.count()).toBe(1);
    expect(await remote.get('layouts', 'mine')).toBeNull();

    refuse = false;
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(async () =>
      expect((await remote.get('layouts', 'mine'))?.doc).toEqual({ name: 'Mine' }),
    );
    expect(marks.count()).toBe(0);
    stop();
  });

  it('says why it could not send, and tries again later and later until it can', async () => {
    const { storage, remote, marks } = await offlineEdit();
    const down = breakable(remote);
    const stop = startAutoSync(storage, marks, TIMING);
    await vi.waitFor(() => expect(useSync.getState().phase).toBe('failed'));
    // It says which document, as well as why.
    expect(useSync.getState().error).toBe('Mine: GitHub responded 503');
    // Nothing is lost meanwhile.
    expect(marks.count()).toBe(1);

    const listed = vi.spyOn(remote, 'list');
    await vi.advanceTimersByTimeAsync(4_000);
    expect(listed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.waitFor(() => expect(listed).toHaveBeenCalled());
    // The second failure waits the second delay, not the first again.
    listed.mockClear();
    await vi.advanceTimersByTimeAsync(8_000);
    expect(listed).not.toHaveBeenCalled();

    down.on = false;
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.waitFor(() => expect(useSync.getState().phase).toBe('idle'));
    expect(useSync.getState().error).toBeNull();
    expect(marks.count()).toBe(0);
    expect((await remote.get('layouts', 'mine'))?.doc).toEqual({ name: 'Mine' });
    stop();
  });

  it('stops saying it failed once there is nothing left to send', async () => {
    const { storage, remote, marks } = await offlineEdit();
    breakable(remote);
    const stop = startAutoSync(storage, marks, TIMING);
    await vi.waitFor(() => expect(useSync.getState().phase).toBe('failed'));

    // The document is gone from this browser, or sent some other way: nothing is waiting.
    marks.forget('layouts', 'mine');
    expect(useSync.getState()).toMatchObject({ phase: 'idle', error: null });
    const listed = vi.spyOn(remote, 'list');
    await vi.advanceTimersByTimeAsync(600_000);
    expect(listed).not.toHaveBeenCalled();
    stop();
  });

  it('gives up on an attempt that is taking too long, so the next one can be made', async () => {
    const { storage, remote, marks } = await offlineEdit();
    const list = remote.list.bind(remote);
    // A request that is slow to give up, as one with a limit of its own is.
    let hang = true;
    let unblock: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    remote.list = async (collection) => {
      if (hang) await gate;
      return list(collection);
    };
    const stop = startAutoSync(storage, marks, TIMING);
    await vi.advanceTimersByTimeAsync(21_000);
    expect(useSync.getState()).toMatchObject({
      phase: 'failed',
      error: 'GitHub did not answer in time',
    });

    hang = false;
    unblock();
    syncNow();
    await vi.waitFor(() => expect(useSync.getState().phase).toBe('idle'));
    expect(marks.count()).toBe(0);
    stop();
  });

  it('sends what was saved while an attempt was out, which it had not looked at', async () => {
    const { storage, local, remote, marks } = await offlineEdit();
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const put = remote.put.bind(remote);
    let first = true;
    remote.put = async (collection, id, doc, opts) => {
      if (first) {
        first = false;
        await held;
      }
      return put(collection, id, doc, opts);
    };
    const stop = startAutoSync(storage, marks, TIMING);
    await vi.waitFor(() => expect(first).toBe(false));
    // Saved offline-style while the attempt is out: it is not in what the attempt listed.
    await new CompositeStorage(local, null, marks).put('layouts', 'late', { name: 'Late' });
    release();
    await vi.waitFor(() => expect(useSync.getState().phase).toBe('idle'));

    await vi.advanceTimersByTimeAsync(1_500);
    await vi.waitFor(async () =>
      expect((await remote.get('layouts', 'late'))?.doc).toEqual({ name: 'Late' }),
    );
    expect(marks.count()).toBe(0);
    stop();
  });

  it('tries at once when asked to', async () => {
    const { storage, remote, marks } = await offlineEdit();
    const down = breakable(remote);
    const stop = startAutoSync(storage, marks, TIMING);
    await vi.waitFor(() => expect(useSync.getState().phase).toBe('failed'));

    down.on = false;
    syncNow();
    await vi.waitFor(() => expect(useSync.getState().phase).toBe('idle'));
    expect(marks.count()).toBe(0);
    stop();
  });

  it('tries when the browser comes back online with something unsent', async () => {
    const { storage, remote, marks } = await offlineEdit();
    const down = breakable(remote);
    const stop = startAutoSync(storage, marks, { ...TIMING, retryMs: [3_600_000] });
    await vi.waitFor(() => expect(useSync.getState().phase).toBe('failed'));

    down.on = false;
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(useSync.getState().phase).toBe('idle'));
    expect(marks.count()).toBe(0);
    stop();
  });

  it('tries when the tab is shown again, but not twice in quick succession', async () => {
    const { storage, remote, marks } = await offlineEdit();
    const down = breakable(remote);
    const stop = startAutoSync(storage, marks, { ...TIMING, retryMs: [3_600_000] });
    await vi.waitFor(() => expect(useSync.getState().phase).toBe('failed'));

    const listed = vi.spyOn(remote, 'list');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(1);
    expect(listed).not.toHaveBeenCalled();

    down.on = false;
    await vi.advanceTimersByTimeAsync(15_000);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(useSync.getState().phase).toBe('idle'));
    expect(marks.count()).toBe(0);
    stop();
  });

  it('stops when storage stops reaching the gists, and forgets how the last try went', async () => {
    const { storage, remote, marks } = await offlineEdit();
    const down = breakable(remote);
    const stop = startAutoSync(storage, marks, TIMING);
    await vi.waitFor(() => expect(useSync.getState().phase).toBe('failed'));

    stop();
    expect(useSync.getState()).toMatchObject({ phase: 'idle', error: null, last: null });
    down.on = false;
    const listed = vi.spyOn(remote, 'list');
    await vi.advanceTimersByTimeAsync(600_000);
    expect(listed).not.toHaveBeenCalled();
    syncNow();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(listed).not.toHaveBeenCalled();
    expect(marks.count()).toBe(1);
  });
});

describe('an attempt that is given up on', () => {
  it('is stopped, not left running beside the next one', async () => {
    const { storage, remote, marks } = await offlineEdit();
    let seen: AbortSignal | undefined;
    const copyUp = storage.copyUp.bind(storage);
    storage.copyUp = (opts) => {
      seen = opts?.signal;
      return new Promise(() => {});
    };
    const stop = startAutoSync(storage, marks, TIMING);
    await vi.advanceTimersByTimeAsync(21_000);
    expect(useSync.getState().phase).toBe('failed');
    expect(seen?.aborted).toBe(true);
    storage.copyUp = copyUp;
    expect(remote).toBeDefined();
    stop();
  });

  it('does not try again and again for a mark it can neither send nor report', async () => {
    const { storage, remote, marks } = await offlineEdit();
    // A mark that names nothing a pass looks at.
    marks.mark('nothing' as never, 'x');
    const listed = vi.spyOn(remote, 'list');
    const stop = startAutoSync(storage, marks, TIMING);
    await vi.waitFor(() => expect(useSync.getState().phase).toBe('idle'));
    await vi.advanceTimersByTimeAsync(60_000);
    // Once for the first attempt, once more for the mark it left, and no more.
    const lists = listed.mock.calls.filter(([c]) => c === 'layouts').length;
    expect(lists).toBeLessThanOrEqual(4);
    stop();
  });
});

describe('documents that cannot be sent', () => {
  it('says which one, and why, and tries again later', async () => {
    const marks = memoryMarks();
    const local = new MemoryStorage('local');
    const remote = new MemoryStorage('github');
    const offline = new CompositeStorage(local, null, marks);
    await offline.put('layouts', 'a', { name: 'Alpha' });
    await offline.put('layouts', 'b', { name: 'Beta' });
    const put = remote.put.bind(remote);
    remote.put = async (collection, id, doc, opts) => {
      if (id === 'b') throw new Error('GitHub responded 422');
      return put(collection, id, doc, opts);
    };
    const stop = startAutoSync(new CompositeStorage(local, remote, marks), marks, TIMING);
    await vi.waitFor(() => expect(useSync.getState().phase).toBe('failed'));
    expect(useSync.getState().error).toBe('Beta: GitHub responded 422');
    // The one that could be sent was, and said so.
    expect(await remote.get('layouts', 'a')).not.toBeNull();
    expect(texts()).toEqual(['Sent 1 document saved in this browser to your GitHub account']);
    expect(useSync.getState().scheduled).toBe(true);
    stop();
  });

  it('keeps what a copy up that ended found, conflicts included', async () => {
    const marks = memoryMarks();
    const local = new MemoryStorage('local');
    const remote = new MemoryStorage('github');
    const signedIn = new CompositeStorage(local, remote, marks);
    await signedIn.put('layouts', 'gust', { name: 'Gust' });
    await new CompositeStorage(local, null, marks).put('layouts', 'gust', { name: 'Gust (phone)' });
    await remote.put('layouts', 'gust', { name: 'Gust (laptop)' });
    const offline = new CompositeStorage(local, null, marks);
    for (const id of ['x1', 'x2', 'x3']) await offline.put('layouts', id, { name: id });
    const put = remote.put.bind(remote);
    remote.put = async (collection, id, doc, opts) => {
      if (id.startsWith('x')) throw new Error('too large');
      return put(collection, id, doc, opts);
    };

    const stop = startAutoSync(signedIn, marks, TIMING);
    await vi.waitFor(() => expect(useSync.getState().phase).toBe('failed'));
    // Ended after several in a row: the conflict found before is still shown.
    expect(useSync.getState().last?.conflicts.map((c) => c.id)).toEqual(['gust']);
    stop();
  });

  it('shows no attempt waiting once nothing is left to send', async () => {
    const { storage, remote, marks } = await offlineEdit();
    breakable(remote);
    const stop = startAutoSync(storage, marks, TIMING);
    await vi.waitFor(() => expect(useSync.getState().phase).toBe('failed'));
    expect(useSync.getState().scheduled).toBe(true);
    marks.forget('layouts', 'mine');
    expect(useSync.getState().scheduled).toBe(false);
    stop();
  });
});

describe('one tab sends at a time', () => {
  /** Web Locks as the browser has them when another tab holds the lock for as long as `other.holds`. */
  function locks(other: { holds: boolean }) {
    const request = vi.fn(
      async (_name: string, _opts: unknown, work: (lock: object | null) => unknown) =>
        work(other.holds ? null : { name: 'layerbench:send' }),
    );
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    return request;
  }

  it('leaves it to the tab that has the lock, and looks again later', async () => {
    const { storage, remote, marks } = await offlineEdit();
    const other = { holds: true };
    const request = locks(other);
    const copyUp = vi.spyOn(storage, 'copyUp');
    const stop = startAutoSync(storage, marks, TIMING);
    await vi.waitFor(() => expect(request).toHaveBeenCalled());
    expect(request).toHaveBeenCalledWith(
      'layerbench:send',
      { ifAvailable: true },
      expect.any(Function),
    );
    await vi.advanceTimersByTimeAsync(1_000);
    expect(copyUp).not.toHaveBeenCalled();
    // Waiting for another tab is not about to send: the status does not say it is sending.
    expect(useSync.getState()).toMatchObject({ phase: 'idle', scheduled: false });

    // The other tab is done, or gone.
    other.holds = false;
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.waitFor(async () => expect(await remote.get('layouts', 'mine')).not.toBeNull());
    expect(marks.count()).toBe(0);
    stop();
  });
});

describe('sending behind a lock that may not be there', () => {
  it('goes on with the work where the lock cannot be asked for', async () => {
    const request = vi.fn(async () => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    const work = vi.fn(async () => 'sent');
    expect(await whileSending(work)).toBe('sent');
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('does not run the work twice when the work itself fails', async () => {
    const request = vi.fn(async (_n: string, _o: unknown, cb: (lock: object | null) => unknown) =>
      cb({}),
    );
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    const work = vi.fn(async () => {
      throw new Error('its own');
    });
    await expect(whileSending(work)).rejects.toThrow('its own');
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('says another tab has it, by not running the work', async () => {
    const request = vi.fn(async (_n: string, _o: unknown, cb: (lock: object | null) => unknown) =>
      cb(null),
    );
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    const work = vi.fn(async () => 'sent');
    expect(await whileSending(work)).toBeNull();
    expect(work).not.toHaveBeenCalled();
  });
});

describe('what the account lacks, once documents are sent', () => {
  it('is looked at again after a copy of everything, so the status can say it lacks nothing', async () => {
    const marks = memoryMarks();
    const local = new MemoryStorage('local');
    const remote = new MemoryStorage('github');
    await local.put('layouts', 'only-here', { name: 'Only here' });
    const storage = new CompositeStorage(local, remote, marks);
    const stop = startAutoSync(storage, marks, { ...TIMING, auditEveryMs: 0 });
    await vi.waitFor(() => expect(useSync.getState().missing).toHaveLength(1));

    sendEverything();
    await vi.waitFor(() => expect(useSync.getState().missing).toEqual([]));
    expect(await remote.get('layouts', 'only-here')).not.toBeNull();
    expect(marks.audit()?.lacking).toBe(0);
    stop();
  });

  it('is not offered on a browser another account last sent to', async () => {
    const marks = memoryMarks();
    marks.setAccount('alice');
    const local = new MemoryStorage('local');
    await local.put('layouts', 'alices', { name: "Alice's" });
    const storage = new CompositeStorage(local, new MemoryStorage('github'), marks);
    const stop = startAutoSync(storage, marks, { ...TIMING, auditEveryMs: 0 }, 'bob');
    await vi.waitFor(() => expect(marks.audit()?.account).toBe('bob'));
    expect(useSync.getState().missing).toEqual([]);
    expect(marks.audit()?.lacking).toBe(0);
    stop();
  });

  it('is said to be being checked until the first look has finished', async () => {
    const marks = memoryMarks();
    const local = new MemoryStorage('local');
    const remote = new MemoryStorage('github');
    await local.put('layouts', 'a', { name: 'A' });
    const list = remote.list.bind(remote);
    let release: () => void = () => {};
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    remote.list = async (collection) => {
      await slow;
      return list(collection);
    };
    const stop = startAutoSync(new CompositeStorage(local, remote, marks), marks, {
      ...TIMING,
      auditEveryMs: 0,
    });
    await vi.waitFor(() => expect(useSync.getState().auditing).toBe(true));
    release();
    await vi.waitFor(() => expect(useSync.getState().auditing).toBe(false));
    stop();
  });
});

describe('a copy of everything that stops partway', () => {
  it('keeps the conflicts already shown for documents it did not reach', async () => {
    const shown = {
      collection: 'layouts',
      id: 'gust',
      name: 'Gust',
      mine: { doc: { name: 'Gust' }, updatedAt: '2026-11-10T09:00:00Z' },
      theirs: { name: 'Gust', doc: { name: 'G2' }, updatedAt: '2026-11-10T10:00:00Z', sha: 's' },
    } as Conflict;
    useSync.setState({
      last: { copied: 0, current: 0, conflicts: [shown], taken: 0, failed: [] },
    });
    await copyEverything(async () => {
      throw new CopyUpError(
        { copied: 1, current: 0, conflicts: [], taken: 0, failed: [] },
        new Error('GitHub did not answer in time'),
      );
    });
    expect(useSync.getState().last?.conflicts.map((c) => c.id)).toEqual(['gust']);
    expect(useSync.getState().last?.copied).toBe(1);
  });
});

describe('looking at every document, once in a while', () => {
  it('is made for each account, not once for the browser', async () => {
    const marks = memoryMarks();
    const local = new MemoryStorage('local');
    const remote = new MemoryStorage('github');
    await local.put('layouts', 'a', { name: 'A' });
    await remote.put('layouts', 'a', { name: 'A' });
    const storage = new CompositeStorage(local, remote, marks);
    const timing = { ...TIMING, auditEveryMs: 3_600_000 };

    const first = startAutoSync(storage, marks, timing, 'alice');
    await vi.waitFor(() => expect(marks.audit()?.account).toBe('alice'));
    first();
    const listed = vi.spyOn(remote, 'list');
    // The same account again soon: not looked at, and what was found is still said.
    marks.setAudit({ account: 'alice', at: Date.now(), lacking: 0, missing: [] });
    startAutoSync(storage, marks, timing, 'alice')();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(listed).not.toHaveBeenCalled();

    // Another account on the same browser: looked at at once.
    const second = startAutoSync(storage, marks, timing, 'bob');
    await vi.waitFor(() => expect(marks.audit()?.account).toBe('bob'));
    second();
    expect(listed).toHaveBeenCalled();
  });

  it('keeps what it found for the status, even when it is not repeated', async () => {
    const marks = memoryMarks();
    const found = [
      { collection: 'layouts', id: 'a', name: 'A', sent: false },
      { collection: 'corpora', id: 'b', name: 'B', sent: true },
    ] as const;
    marks.setAudit({ account: 'alice', at: Date.now(), lacking: 2, missing: [...found] });
    const local = new MemoryStorage('l');
    await local.put('layouts', 'a', { name: 'A' });
    await local.put('corpora', 'b', { name: 'B' });
    const storage = new CompositeStorage(local, new MemoryStorage('g'), marks);
    const stop = startAutoSync(storage, marks, { ...TIMING, auditEveryMs: 3_600_000 }, 'alice');
    await vi.advanceTimersByTimeAsync(10);
    expect(useSync.getState().missing).toEqual(found);
    stop();
  });

  it('drops from what it kept the documents deleted here since, as they are not what it found', async () => {
    const marks = memoryMarks();
    const found = [
      { collection: 'layouts', id: 'kept', name: 'Kept', sent: false },
      { collection: 'layouts', id: 'deleted', name: 'Deleted', sent: false },
    ] as const;
    marks.setAudit({ account: 'alice', at: Date.now(), lacking: 2, missing: [...found] });
    const local = new MemoryStorage('l');
    await local.put('layouts', 'kept', { name: 'Kept' });
    const storage = new CompositeStorage(local, new MemoryStorage('g'), marks);
    const stop = startAutoSync(storage, marks, { ...TIMING, auditEveryMs: 3_600_000 }, 'alice');
    await vi.advanceTimersByTimeAsync(10);
    expect(useSync.getState().missing?.map((d) => d.id)).toEqual(['kept']);
    expect(marks.audit()?.missing?.map((d) => d.id)).toEqual(['kept']);
    expect(marks.audit()?.lacking).toBe(1);
    stop();
  });

  it('takes a document off the list when it is deleted from the app, by whatever deletes it', async () => {
    const marks = memoryMarks();
    const local = new MemoryStorage('local');
    await local.put('layouts', 'gone', { name: 'Gone' });
    await local.put('layouts', 'stays', { name: 'Stays' });
    const storage = new CompositeStorage(local, new MemoryStorage('github'), marks);
    const stop = startAutoSync(storage, marks, { ...TIMING, auditEveryMs: 0 });
    await vi.waitFor(() => expect(useSync.getState().missing).toHaveLength(2));

    await storage.delete('layouts', 'gone');
    await vi.waitFor(() => expect(useSync.getState().missing?.map((d) => d.id)).toEqual(['stays']));
    expect(marks.audit()?.missing?.map((d) => d.id)).toEqual(['stays']);
    stop();
  });

  it('does not bring back, in what it kept, what another tab took off it', () => {
    const marks = memoryMarks();
    const a = { collection: 'layouts', id: 'a', name: 'A', sent: false } as const;
    const b = { collection: 'layouts', id: 'b', name: 'B', sent: false } as const;
    // This tab's list still has both; another tab deleted b, and kept it so.
    useSync.setState({ missing: [a, b] });
    marks.setAudit({ account: 'alice', at: 1, lacking: 1, missing: [a] });
    dropMissing(['layouts/a'], marks);
    expect(marks.audit()?.missing).toEqual([]);
    expect(useSync.getState().missing).toEqual([b]);
  });

  it('looks again when what it kept is only a count, so the documents can be named', async () => {
    const marks = memoryMarks();
    const local = new MemoryStorage('l');
    await local.put('layouts', 'only-here', { name: 'Only here' });
    // As an earlier version kept it: how many, not which.
    marks.setAudit({ account: 'alice', at: Date.now(), lacking: 1 });
    const storage = new CompositeStorage(local, new MemoryStorage('g'), marks);
    const stop = startAutoSync(storage, marks, { ...TIMING, auditEveryMs: 3_600_000 }, 'alice');
    await vi.waitFor(() =>
      expect(useSync.getState().missing).toEqual([
        { collection: 'layouts', id: 'only-here', name: 'Only here', sent: false },
      ]),
    );
    expect(marks.audit()?.missing).toHaveLength(1);
    stop();
  });

  it('says when it could not look, and looks again when asked', async () => {
    const marks = memoryMarks();
    const local = new MemoryStorage('local');
    const remote = new MemoryStorage('github');
    await local.put('layouts', 'a', { name: 'A (here)' });
    await remote.put('layouts', 'a', { name: 'A (there)' });
    const list = remote.list.bind(remote);
    let down = true;
    remote.list = async (collection) => {
      if (down) throw new Error('GitHub did not answer in time');
      return list(collection);
    };
    const storage = new CompositeStorage(local, remote, marks);
    const stop = startAutoSync(storage, marks, { ...TIMING, auditEveryMs: 0 });
    await vi.waitFor(() => expect(useSync.getState().auditFailed).toBe(true));
    expect(marks.audit()).toBeNull();

    down = false;
    checkAgain();
    await vi.waitFor(() => expect(useSync.getState().auditFailed).toBe(false));
    expect(marks.audit()).not.toBeNull();
    stop();
  });

  it('marks what differs and is not known to be older, and asks about it as a conflict', async () => {
    const marks = memoryMarks();
    const local = new MemoryStorage('local');
    const remote = new MemoryStorage('github');
    await local.put('layouts', 'gust', { name: 'Gust (phone)' });
    await remote.put('layouts', 'gust', { name: 'Gust (laptop)' });
    await local.put('layouts', 'only-here', { name: 'Only here' });
    const storage = new CompositeStorage(local, remote, marks);

    const stop = startAutoSync(storage, marks, { ...TIMING, auditEveryMs: 0 });
    await vi.waitFor(() => expect(useSync.getState().last?.conflicts).toHaveLength(1));
    expect(useSync.getState().missing).toHaveLength(1);
    expect(useSync.getState().reviewing).toBe(true);
    // Neither was written over, and the one the account lacks was not sent: it may have been deleted.
    expect((await remote.get('layouts', 'gust'))?.doc.name).toBe('Gust (laptop)');
    expect(await remote.get('layouts', 'only-here')).toBeNull();
    stop();
  });

  it('is not repeated within the time it is given', async () => {
    const marks = memoryMarks();
    const local = new MemoryStorage('local');
    const remote = new MemoryStorage('github');
    await local.put('layouts', 'a', { name: 'A' });
    await remote.put('layouts', 'a', { name: 'A' });
    const storage = new CompositeStorage(local, remote, marks);
    const timing = { ...TIMING, auditEveryMs: 3_600_000 };

    const first = startAutoSync(storage, marks, timing);
    await vi.waitFor(() => expect(marks.audit()).not.toBeNull());
    first();
    const listed = vi.spyOn(remote, 'list');
    startAutoSync(storage, marks, timing)();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(listed).not.toHaveBeenCalled();
  });

  it('is not made for documents held back for another account', async () => {
    const marks = memoryMarks();
    const local = new MemoryStorage('local');
    const remote = new MemoryStorage('github');
    await new CompositeStorage(local, null, marks).put('layouts', 'mine', { name: 'Mine' });
    marks.setAccount('someone-else');
    const listed = vi.spyOn(remote, 'list');
    const stop = startAutoSync(
      new CompositeStorage(local, remote, marks),
      marks,
      {
        ...TIMING,
        auditEveryMs: 0,
      },
      'you',
    );
    await vi.advanceTimersByTimeAsync(5_000);
    expect(listed).not.toHaveBeenCalled();
    stop();
  });
});

describe('whose account the documents go to', () => {
  it('sends to the first account this browser is signed in to, and records it', async () => {
    const { storage, remote, marks } = await offlineEdit();
    const stop = startAutoSync(storage, marks, TIMING, 'you');
    await vi.waitFor(async () => expect(await remote.get('layouts', 'mine')).not.toBeNull());
    expect(marks.account()).toBe('you');
    expect(useSync.getState().held).toBeNull();
    stop();
  });

  it('records the account that signs in when nothing is waiting, so it is that account the browser sends to', async () => {
    const marks = memoryMarks();
    marks.setAccount('someone-else');
    const storage = new CompositeStorage(new MemoryStorage('l'), new MemoryStorage('g'), marks);
    const stop = startAutoSync(storage, marks, TIMING, 'you');
    expect(marks.account()).toBe('you');
    stop();
  });

  it('holds back what is waiting for another account than the one this browser last sent to', async () => {
    const { storage, remote, marks } = await offlineEdit();
    marks.setAccount('someone-else');
    const listed = vi.spyOn(remote, 'list');
    const stop = startAutoSync(storage, marks, TIMING, 'you');
    await vi.advanceTimersByTimeAsync(60_000);
    window.dispatchEvent(new Event('online'));
    syncNow();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(listed).not.toHaveBeenCalled();
    expect(await remote.get('layouts', 'mine')).toBeNull();
    expect(useSync.getState().held).toEqual({ account: 'someone-else' });
    expect(marks.count()).toBe(1);
    stop();
  });

  it('lets go of what was held back once nothing is left to hold', async () => {
    const { storage, marks } = await offlineEdit();
    marks.setAccount('someone-else');
    const stop = startAutoSync(storage, marks, TIMING, 'you');
    expect(useSync.getState().held).not.toBeNull();

    // Sent some other way (the copy of everything), or deleted: nothing is held any more.
    marks.forget('layouts', 'mine');
    expect(useSync.getState().held).toBeNull();
    stop();
  });

  it('holds back what is waiting from an account that signs in after one that was first and failed', async () => {
    const { storage, remote, marks } = await offlineEdit();
    breakable(remote);
    const first = startAutoSync(storage, marks, TIMING, 'first');
    await vi.waitFor(() => expect(useSync.getState().phase).toBe('failed'));
    // The browser is the first account's, though nothing went up.
    expect(marks.account()).toBe('first');
    first();

    const second = startAutoSync(storage, marks, TIMING, 'second');
    expect(useSync.getState().held).toEqual({ account: 'first' });
    second();
  });

  it('sends what was held back once the user says it is theirs to send', async () => {
    const { storage, remote, marks } = await offlineEdit();
    marks.setAccount('someone-else');
    const stop = startAutoSync(storage, marks, TIMING, 'you');
    expect(useSync.getState().held).not.toBeNull();

    sendHeld();
    await vi.waitFor(async () => expect(await remote.get('layouts', 'mine')).not.toBeNull());
    expect(useSync.getState().held).toBeNull();
    expect(marks.account()).toBe('you');
    stop();
  });
});

describe('when both have changed', () => {
  /** The phone's edit, made offline, and the laptop's, made in the account. */
  async function conflicted() {
    const marks = memoryMarks();
    const local = new MemoryStorage('local');
    const remote = new MemoryStorage('github');
    const signedIn = new CompositeStorage(local, remote, marks);
    await signedIn.put('layouts', 'gust', { name: 'Gust' });
    await new CompositeStorage(local, null, marks).put('layouts', 'gust', { name: 'Gust (phone)' });
    await remote.put('layouts', 'gust', { name: 'Gust (laptop)' });
    return { marks, local, remote, storage: signedIn };
  }

  it('finds the conflict, writes over neither, and opens the dialog for it', async () => {
    const { storage, remote, marks } = await conflicted();
    const stop = startAutoSync(storage, marks, TIMING);
    await vi.waitFor(() => expect(useSync.getState().last?.conflicts).toHaveLength(1));
    expect(useSync.getState().reviewing).toBe(true);
    expect((await remote.get('layouts', 'gust'))?.doc.name).toBe('Gust (laptop)');
    expect(marks.has('layouts', 'gust')).toBe(true);
    // Not announced as sent: nothing was.
    expect(texts()).toEqual([]);
    stop();
  });

  it('does not open the dialog again for the same conflict once it is put off, until the next visit', async () => {
    const { storage, marks } = await conflicted();
    const stop = startAutoSync(storage, marks, TIMING);
    await vi.waitFor(() => expect(useSync.getState().reviewing).toBe(true));

    review(false);
    syncNow();
    await vi.waitFor(() => expect(useSync.getState().phase).toBe('idle'));
    await vi.advanceTimersByTimeAsync(5_000);
    // Found again, and still waiting, but the user is not asked again at every attempt.
    expect(useSync.getState().last?.conflicts).toHaveLength(1);
    expect(useSync.getState().reviewing).toBe(false);
    stop();

    // A new visit: asked again.
    forgetOffered();
    const again = startAutoSync(storage, marks, TIMING);
    await vi.waitFor(() => expect(useSync.getState().reviewing).toBe(true));
    again();
  });

  it('does not open the dialog again when the conflicted document is saved again here', async () => {
    const { storage, local, marks } = await conflicted();
    const stop = startAutoSync(storage, marks, TIMING);
    await vi.waitFor(() => expect(useSync.getState().reviewing).toBe(true));
    review(false);

    // Put off, and the document edited again meanwhile: it is the same conflict.
    vi.setSystemTime(Date.now() + 60_000);
    await storage.put('layouts', 'gust', { name: 'Gust (phone, again)' });
    expect((await local.get('layouts', 'gust'))?.doc.name).toBe('Gust (phone, again)');
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.waitFor(() =>
      expect(useSync.getState().last?.conflicts[0]?.mine.doc.name).toBe('Gust (phone, again)'),
    );
    expect(useSync.getState().reviewing).toBe(false);
    stop();
  });

  it('opens the dialog again for a conflict that is a different one', async () => {
    const { storage, remote, marks } = await conflicted();
    const stop = startAutoSync(storage, marks, TIMING);
    await vi.waitFor(() => expect(useSync.getState().reviewing).toBe(true));
    review(false);

    // The account changed again: what there is to choose between is not what was put off.
    await remote.put('layouts', 'gust', { name: 'Gust (laptop, again)' });
    syncNow();
    await vi.waitFor(() => expect(useSync.getState().reviewing).toBe(true));
    stop();
  });
});

describe('a delete made on another browser', () => {
  it('is followed when the phone opens, though nothing of its own waits to be sent', async () => {
    const remote = new MemoryStorage('github');
    const phoneMarks = memoryMarks();
    const phone = new CompositeStorage(new MemoryStorage('local'), remote, phoneMarks);
    await phone.put('layouts', 'lemon', { name: 'Lemon' });
    await phone.put('layouts', 'fusion', { name: 'Fusion' });
    const laptop = new CompositeStorage(new MemoryStorage('laptop'), remote, memoryMarks());
    await laptop.get('layouts', 'lemon');
    await laptop.get('layouts', 'fusion');
    await laptop.delete('layouts', 'lemon');
    await laptop.put(
      'layouts',
      'magic-caster',
      { name: 'Magic Caster' },
      { replacing: ['fusion'] },
    );
    await laptop.delete('layouts', 'fusion');
    expect(phoneMarks.count()).toBe(0);

    const stop = startAutoSync(phone, phoneMarks, TIMING);
    await vi.waitFor(async () =>
      expect((await phone.list('layouts')).map((e) => e.name)).toEqual(['Magic Caster']),
    );
    stop();
  });
});
