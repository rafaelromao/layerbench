import type { Collection, StorageAdapter } from '@layerbench/core';
import { NameTakenError, StorageConflictError } from '@layerbench/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../test/memory-storage.js';
import { CompositeStorage, CopyUpError } from './composite.js';
import { IndexedDbAdapter } from './indexeddb.js';

let counter = 0;
const localAdapter = () => new IndexedDbAdapter(`layerbench-composite-${++counter}`);

/** A stand-in for the gists, so the tests are about the composition, not the network. */
function fakeRemote(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  return Object.assign(new MemoryStorage('github'), overrides);
}

describe('two stores at once', () => {
  it('writes to both, and the gists answer reads', async () => {
    const local = localAdapter();
    const remote = fakeRemote();
    const composite = new CompositeStorage(local, remote);

    await composite.put('layouts', 'mine', { name: 'Mine' });
    expect((await local.get('layouts', 'mine'))?.doc).toEqual({ name: 'Mine' });
    expect((await composite.get('layouts', 'mine'))?.meta.sha).toMatch(/^github-/);
  });

  it('keeps working when the gists are unreachable', async () => {
    const local = localAdapter();
    const remote = fakeRemote({
      async list() {
        throw new Error('offline');
      },
      async get() {
        throw new Error('offline');
      },
    });
    const composite = new CompositeStorage(local, remote);

    await local.put('layouts', 'mine', { name: 'Mine' });
    expect(await composite.list('layouts')).toHaveLength(1);
    expect((await composite.get('layouts', 'mine'))?.doc).toEqual({ name: 'Mine' });
    // Without a browser copy, the gists not answering is not the document not existing.
    await expect(composite.get('layouts', 'only-there')).rejects.toThrow('offline');
  });

  it('saves locally before reporting a conflict, so the work survives', async () => {
    const local = localAdapter();
    const remote = fakeRemote({
      async put() {
        throw new StorageConflictError();
      },
    });
    const composite = new CompositeStorage(local, remote);

    await expect(composite.put('layouts', 'mine', { name: 'Mine' })).rejects.toBeInstanceOf(
      StorageConflictError,
    );
    expect((await local.get('layouts', 'mine'))?.doc).toEqual({ name: 'Mine' });
  });

  it('takes back what the browser wrote when the gists already have a layout of that name', async () => {
    const local = localAdapter();
    const remote = fakeRemote();
    await remote.put('layouts', 'mine', { name: 'Mine' });
    await local.put('layouts', 'kept', { name: 'Kept' });
    const composite = new CompositeStorage(local, remote);

    // Not in the browser before: it is gone again.
    await expect(composite.put('layouts', 'mine-2', { name: 'Mine' })).rejects.toBeInstanceOf(
      NameTakenError,
    );
    expect(await local.get('layouts', 'mine-2')).toBeNull();

    // In the browser before, under another name: that one is back.
    await expect(composite.put('layouts', 'kept', { name: 'Mine' })).rejects.toBeInstanceOf(
      NameTakenError,
    );
    expect((await local.get('layouts', 'kept'))?.doc).toEqual({ name: 'Kept' });
    expect((await local.list('layouts')).map((e) => e.name)).toEqual(['Kept']);
  });

  it('merges both listings, with the gists winning a shared id', async () => {
    const local = localAdapter();
    const remote = fakeRemote();
    await local.put('layouts', 'shared', { name: 'Local copy' });
    await local.put('layouts', 'only-here', { name: 'Only here' });
    await remote.put('layouts', 'shared', { name: 'Repository copy' });

    const entries = await new CompositeStorage(local, remote).list('layouts');
    expect(entries.map((e) => e.id).sort()).toEqual(['only-here', 'shared']);
    expect(entries.find((e) => e.id === 'shared')?.name).toBe('Repository copy');
  });

  it('behaves like the browser store alone when no gists are set', async () => {
    const composite = new CompositeStorage(localAdapter(), null);
    await composite.put('layouts', 'mine', { name: 'Mine' });
    expect((await composite.get('layouts', 'mine'))?.doc).toEqual({ name: 'Mine' });
    expect(composite.reachesRemote).toBe(false);
    expect(await composite.copyUp()).toEqual({ copied: 0, current: 0, taken: 0 });
  });
});

describe('copying up', () => {
  afterEach(() => vi.useRealTimers());

  /** Save `doc` in `store` as of `at`, so which copy is newer is the test's to say. */
  async function saveAt(store: StorageAdapter, at: string, collection: Collection, id: string) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(at));
    await store.put(collection, id, { name: `${id} from ${store.id} at ${at}` });
    vi.useRealTimers();
  }

  it('sends what the gists lack, or have older, and leaves the rest as it is', async () => {
    const local = localAdapter();
    const remote = fakeRemote();
    // Saved here after the gists' copy, so this one goes up.
    await saveAt(remote, '2026-10-01T10:00:00Z', 'layouts', 'edited-here');
    await saveAt(local, '2026-10-02T10:00:00Z', 'layouts', 'edited-here');
    // Saved in the gists since, from another browser: its copy stays.
    await saveAt(local, '2026-10-01T10:00:00Z', 'layouts', 'edited-there');
    await saveAt(remote, '2026-10-02T10:00:00Z', 'layouts', 'edited-there');
    // Only here, in each collection.
    await saveAt(local, '2026-10-01T10:00:00Z', 'rulesets', 'mine');
    await saveAt(local, '2026-10-01T10:00:00Z', 'corpora', 'notes');

    const composite = new CompositeStorage(local, remote);
    expect(composite.reachesRemote).toBe(true);
    expect(await composite.copyUp()).toEqual({ copied: 3, current: 1, taken: 0 });

    const name = async (c: Collection, id: string) => (await remote.get(c, id))?.doc.name;
    expect(await name('layouts', 'edited-here')).toBe(
      'edited-here from local at 2026-10-02T10:00:00Z',
    );
    expect(await name('layouts', 'edited-there')).toBe(
      'edited-there from github at 2026-10-02T10:00:00Z',
    );
    expect(await name('rulesets', 'mine')).toBeDefined();
    expect(await name('corpora', 'notes')).toBeDefined();
  });

  it('counts a document saved in both at once, as every save is, as up to date', async () => {
    const composite = new CompositeStorage(localAdapter(), fakeRemote());
    await composite.put('layouts', 'mine', { name: 'Mine' });
    expect(await composite.copyUp()).toEqual({ copied: 0, current: 1, taken: 0 });
  });

  it('stops at the first failure, keeping what went up, and carries on when tried again', async () => {
    const local = localAdapter();
    await local.put('layouts', 'a', { name: 'A' });
    await local.put('layouts', 'b', { name: 'B' });
    const remote = fakeRemote();
    const put = remote.put.bind(remote);
    let fail = true;
    remote.put = async (collection, id, doc, opts) => {
      if (id === 'b' && fail) throw new Error('offline');
      return put(collection, id, doc, opts);
    };
    const composite = new CompositeStorage(local, remote);

    const stopped = await composite.copyUp().catch((e: unknown) => e);
    expect(stopped).toBeInstanceOf(CopyUpError);
    expect(stopped).toMatchObject({ copied: 1, message: 'offline' });

    fail = false;
    expect(await composite.copyUp()).toEqual({ copied: 1, current: 1, taken: 0 });
  });

  it('leaves a layout whose name the gists have under another id, and carries on', async () => {
    const local = localAdapter();
    const remote = fakeRemote();
    await remote.put('layouts', 'mine', { name: 'Mine' });
    await local.put('layouts', 'mine-2', { name: 'Mine' });
    await local.put('layouts', 'other', { name: 'Other' });

    expect(await new CompositeStorage(local, remote).copyUp()).toEqual({
      copied: 1,
      current: 0,
      taken: 1,
    });
    expect((await remote.list('layouts')).map((e) => e.id)).toEqual(['mine', 'other']);
  });

  it('leaves a copy saved in the gists while copying, from another browser', async () => {
    const local = localAdapter();
    const remote = fakeRemote();
    await saveAt(remote, '2026-10-01T10:00:00Z', 'layouts', 'busy');
    await saveAt(local, '2026-10-02T10:00:00Z', 'layouts', 'busy');
    // The other browser's save lands after the gists are checked a second time.
    const list = remote.list.bind(remote);
    let lists = 0;
    remote.list = async (collection) => {
      const listed = await list(collection);
      if (collection === 'layouts' && ++lists === 2) {
        await remote.put('layouts', 'busy', { name: 'theirs' });
      }
      return listed;
    };

    expect(await new CompositeStorage(local, remote).copyUp()).toEqual({
      copied: 0,
      current: 1,
      taken: 0,
    });
    expect((await remote.get('layouts', 'busy'))?.doc.name).toBe('theirs');
  });

  it('leaves a document made in the gists while copying, by another browser', async () => {
    const local = localAdapter();
    const remote = fakeRemote();
    await local.put('layouts', 'new', { name: 'mine' });
    const list = remote.list.bind(remote);
    let lists = 0;
    remote.list = async (collection) => {
      const listed = await list(collection);
      if (collection === 'layouts' && ++lists === 2) {
        await remote.put('layouts', 'new', { name: 'theirs' });
      }
      return listed;
    };

    expect(await new CompositeStorage(local, remote).copyUp()).toEqual({
      copied: 0,
      current: 1,
      taken: 0,
    });
    expect((await remote.get('layouts', 'new'))?.doc.name).toBe('theirs');
  });
});
