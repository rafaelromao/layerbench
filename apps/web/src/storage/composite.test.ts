import type { Collection, StorageAdapter } from '@layerbench/core';
import { NameTakenError, StorageConflictError } from '@layerbench/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryMarks } from '../test/memory-marks.js';
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

  it('writes nothing in the browser when the gists already have a layout of that name', async () => {
    const local = localAdapter();
    const remote = fakeRemote();
    await remote.put('layouts', 'mine', { name: 'Mine' });
    await local.put('layouts', 'kept', { name: 'Kept' });
    const composite = new CompositeStorage(local, remote);

    const refused = composite.put('layouts', 'mine-2', { name: 'Mine' });
    await expect(refused).rejects.toBeInstanceOf(NameTakenError);
    await expect(refused).rejects.toMatchObject({ taken: { id: 'mine' } });
    await expect(composite.put('layouts', 'kept', { name: 'Mine' })).rejects.toBeInstanceOf(
      NameTakenError,
    );
    expect(await local.list('layouts')).toMatchObject([{ id: 'kept', name: 'Kept' }]);
  });

  it("overwrites the gists' layout of a name with the browser's one of it, which then goes", async () => {
    // Left so by copying up, or saved while the gists could not be listed.
    const local = localAdapter();
    const remote = fakeRemote();
    await remote.put('layouts', 'mine', { name: 'Mine' });
    await local.put('layouts', 'mine-2', { name: 'Mine', description: 'here' });
    const composite = new CompositeStorage(local, remote);

    await expect(
      composite.put('layouts', 'mine-2', { name: 'Mine', description: 'here' }),
    ).rejects.toMatchObject({ taken: { id: 'mine' } });
    await composite.put(
      'layouts',
      'mine',
      { name: 'Mine', description: 'here' },
      { replacing: ['mine-2'] },
    );
    await composite.delete('layouts', 'mine-2');
    expect((await composite.list('layouts')).map((e) => e.id)).toEqual(['mine']);
    expect((await remote.get('layouts', 'mine'))?.doc.description).toBe('here');
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
    expect(await composite.copyUp({ everything: true })).toEqual({
      copied: 0,
      current: 0,
      conflicts: [],
      taken: 0,
    });
  });
});

describe('copying up everything this browser holds', () => {
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
    expect(await composite.copyUp({ everything: true })).toEqual({
      copied: 3,
      current: 1,
      conflicts: [],
      taken: 0,
    });

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
    expect(await composite.copyUp({ everything: true })).toEqual({
      copied: 0,
      current: 1,
      conflicts: [],
      taken: 0,
    });
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

    const stopped = await composite.copyUp({ everything: true }).catch((e: unknown) => e);
    expect(stopped).toBeInstanceOf(CopyUpError);
    expect(stopped).toMatchObject({ copied: 1, message: 'offline' });

    fail = false;
    expect(await composite.copyUp({ everything: true })).toEqual({
      copied: 1,
      current: 1,
      conflicts: [],
      taken: 0,
    });
  });

  it('leaves a layout whose name the gists have under another id, and carries on', async () => {
    const local = localAdapter();
    const remote = fakeRemote();
    await remote.put('layouts', 'mine', { name: 'Mine' });
    await local.put('layouts', 'mine-2', { name: 'Mine' });
    await local.put('layouts', 'other', { name: 'Other' });

    expect(await new CompositeStorage(local, remote).copyUp({ everything: true })).toEqual({
      copied: 1,
      current: 0,
      conflicts: [],
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

    expect(await new CompositeStorage(local, remote).copyUp({ everything: true })).toEqual({
      copied: 0,
      current: 1,
      conflicts: [],
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

    expect(await new CompositeStorage(local, remote).copyUp({ everything: true })).toEqual({
      copied: 0,
      current: 1,
      conflicts: [],
      taken: 0,
    });
    expect((await remote.get('layouts', 'new'))?.doc.name).toBe('theirs');
  });
});

describe('what is waiting to be sent', () => {
  afterEach(() => vi.useRealTimers());

  /** A document saved in `store` as of `at`, with `name` for what it says. */
  async function saveAt(store: StorageAdapter, at: string, id: string, name: string) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(at));
    await store.put('layouts', id, { name });
    vi.useRealTimers();
  }

  /** Two stores that last held the same version of `id`, which is then edited here and, if `there` is given, in the gists. */
  async function agreed(marks = memoryMarks(), id = 'gust') {
    const local = localAdapter();
    const remote = fakeRemote();
    const composite = new CompositeStorage(local, remote, marks);
    await composite.put('layouts', id, { name: 'Gust' });
    return { marks, local, remote, composite };
  }

  it('marks what is saved while nobody is signed in, and sends it once someone is', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    await new CompositeStorage(local, null, marks).put('layouts', 'mine', { name: 'Mine' });
    expect(marks.has('layouts', 'mine')).toBe(true);

    const signedIn = new CompositeStorage(local, remote, marks);
    expect(await signedIn.copyUp()).toEqual({ copied: 1, current: 0, conflicts: [], taken: 0 });
    expect((await remote.get('layouts', 'mine'))?.doc).toEqual({ name: 'Mine' });
    expect(marks.count()).toBe(0);
  });

  it('leaves no mark on a save that reached both stores, and records what both now hold', async () => {
    const { marks, remote } = await agreed();
    expect(marks.count()).toBe(0);
    expect(marks.base('layouts', 'gust')).toBe((await remote.get('layouts', 'gust'))?.meta.sha);
  });

  it('sends nothing it was not told is waiting, unless asked for everything', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    // Saved before edits were marked: never marked, and the gists lack it.
    await local.put('layouts', 'old', { name: 'Old' });

    const composite = new CompositeStorage(local, remote, marks);
    expect(await composite.copyUp()).toEqual({ copied: 0, current: 0, conflicts: [], taken: 0 });
    expect(await remote.get('layouts', 'old')).toBeNull();
    expect(await composite.copyUp({ everything: true })).toMatchObject({ copied: 1 });
    expect(await remote.get('layouts', 'old')).not.toBeNull();
  });

  it('does not bring back a document another browser deleted', async () => {
    const { marks, local, remote, composite } = await agreed();
    // Deleted from the account elsewhere; this browser still holds it, saved and sent as it was.
    await remote.delete('layouts', 'gust');
    expect(await composite.copyUp()).toEqual({ copied: 0, current: 0, conflicts: [], taken: 0 });
    expect(await remote.get('layouts', 'gust')).toBeNull();
    expect((await local.get('layouts', 'gust'))?.doc).toEqual({ name: 'Gust' });
    expect(marks.count()).toBe(0);
  });

  it('marks a save the gists did not take, and sends it when tried again', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    const put = remote.put.bind(remote);
    let offline = true;
    remote.put = async (collection, id, doc, opts) => {
      if (offline) throw new Error('GitHub responded 401');
      return put(collection, id, doc, opts);
    };
    const composite = new CompositeStorage(local, remote, marks);
    await expect(composite.put('layouts', 'mine', { name: 'Mine' })).rejects.toThrow('401');
    // The work is safe here, and waiting.
    expect((await local.get('layouts', 'mine'))?.doc).toEqual({ name: 'Mine' });
    expect(marks.has('layouts', 'mine')).toBe(true);

    offline = false;
    expect(await composite.copyUp()).toMatchObject({ copied: 1 });
    expect((await remote.get('layouts', 'mine'))?.doc).toEqual({ name: 'Mine' });
    expect(marks.count()).toBe(0);
  });

  it('does not mark a save the gists refused for what they hold: that is for the user to decide', async () => {
    for (const refusal of [
      new StorageConflictError(),
      new NameTakenError({ id: 'x', name: 'X' }),
    ]) {
      const marks = memoryMarks();
      const remote = fakeRemote({
        async put() {
          throw refusal;
        },
      });
      const composite = new CompositeStorage(localAdapter(), remote, marks);
      await expect(composite.put('layouts', 'mine', { name: 'Mine' })).rejects.toBe(refusal);
      expect(marks.count()).toBe(0);
    }
  });

  it('keeps a document waiting to be sent where its next save goes, and sends it a moment later', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    await new CompositeStorage(local, null, marks).put('layouts', 'mine', { name: 'First' });
    const composite = new CompositeStorage(local, remote, marks);
    await remote.put('layouts', 'mine', { name: 'Elsewhere' });

    // Signed in now, and saving again: the gists hold a version this edit was not made on, which a
    // save must not write over, so it stays here, still waiting.
    await composite.put('layouts', 'mine', { name: 'Second' });
    expect((await remote.get('layouts', 'mine'))?.doc.name).toBe('Elsewhere');
    expect((await local.get('layouts', 'mine'))?.doc.name).toBe('Second');
    expect(marks.has('layouts', 'mine')).toBe(true);
  });

  it('shows what is waiting to be sent, not the older copy the gists hold', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    await remote.put('layouts', 'mine', { name: 'In the account' });
    await new CompositeStorage(local, null, marks).put('layouts', 'mine', { name: 'Edited here' });

    const composite = new CompositeStorage(local, remote, marks);
    expect((await composite.get('layouts', 'mine'))?.doc.name).toBe('Edited here');
    expect((await composite.list('layouts')).map((e) => e.name)).toEqual(['Edited here']);
  });

  it('sends an edit made here to a document nobody has touched in the gists since', async () => {
    const { marks, local, remote, composite } = await agreed();
    // Offline, and edited here; the gists still hold what both held.
    const offline = new CompositeStorage(local, null, marks);
    await offline.put('layouts', 'gust', { name: 'Gust, edited on the phone' });
    expect(marks.has('layouts', 'gust')).toBe(true);

    expect(await composite.copyUp()).toEqual({ copied: 1, current: 0, conflicts: [], taken: 0 });
    expect((await remote.get('layouts', 'gust'))?.doc.name).toBe('Gust, edited on the phone');
    expect(marks.count()).toBe(0);
  });

  it('is not fooled by clocks: an edit made here goes up over the version it was made on, whenever each was saved', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    // Both held 'Gust' as of 2026-11-10 12:00; the phone's clock is hours behind the gists'.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
    await new CompositeStorage(local, remote, marks).put('layouts', 'gust', { name: 'Gust' });
    vi.setSystemTime(new Date('2026-11-10T08:00:00Z'));
    await new CompositeStorage(local, null, marks).put('layouts', 'gust', { name: 'Edited' });
    vi.useRealTimers();

    expect(await new CompositeStorage(local, remote, marks).copyUp()).toMatchObject({ copied: 1 });
    expect((await remote.get('layouts', 'gust'))?.doc.name).toBe('Edited');
  });

  it('finds a conflict where the document was edited here and in the gists since they agreed, and writes over neither', async () => {
    const { marks, local, remote, composite } = await agreed();
    await new CompositeStorage(local, null, marks).put('layouts', 'gust', { name: 'Gust (phone)' });
    await remote.put('layouts', 'gust', { name: 'Gust (laptop)' });

    const result = await composite.copyUp();
    expect(result).toMatchObject({ copied: 0, current: 0, taken: 0 });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      collection: 'layouts',
      id: 'gust',
      name: 'Gust (phone)',
      mine: { doc: { name: 'Gust (phone)' } },
      theirs: { name: 'Gust (laptop)', doc: { name: 'Gust (laptop)' } },
    });
    expect(result.conflicts[0].theirs.sha).toBe((await remote.get('layouts', 'gust'))?.meta.sha);
    // Neither was written over, and it is still waiting.
    expect((await remote.get('layouts', 'gust'))?.doc.name).toBe('Gust (laptop)');
    expect((await local.get('layouts', 'gust'))?.doc.name).toBe('Gust (phone)');
    expect(marks.has('layouts', 'gust')).toBe(true);
    // And again the same, until the user chooses.
    expect((await composite.copyUp()).conflicts).toHaveLength(1);
  });

  it('finds a conflict, rather than writing over, where it is not known which version an edit was made on', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    // Saved here, and in the gists, before bases were kept; edited here since; the gists differ.
    await saveAt(remote, '2026-11-01T10:00:00Z', 'gust', 'In the account');
    await saveAt(local, '2026-11-10T10:00:00Z', 'gust', 'Edited here, later');
    marks.mark('layouts', 'gust');

    const result = await new CompositeStorage(local, remote, marks).copyUp();
    expect(result.copied).toBe(0);
    expect(result.conflicts.map((c) => c.id)).toEqual(['gust']);
    expect((await remote.get('layouts', 'gust'))?.doc.name).toBe('In the account');
  });

  it('finds a conflict where the gists changed again while copying', async () => {
    const { marks, local, remote, composite } = await agreed();
    await new CompositeStorage(local, null, marks).put('layouts', 'gust', { name: 'Gust (phone)' });
    const list = remote.list.bind(remote);
    let lists = 0;
    remote.list = async (collection) => {
      const listed = await list(collection);
      if (collection === 'layouts' && ++lists === 2) {
        await remote.put('layouts', 'gust', { name: 'Gust (laptop)' });
      }
      return listed;
    };

    const result = await composite.copyUp();
    expect(result.conflicts.map((c) => c.theirs.doc.name)).toEqual(['Gust (laptop)']);
    expect((await remote.get('layouts', 'gust'))?.doc.name).toBe('Gust (laptop)');
  });

  it('finds a marked edit the gists already hold the same of up to date', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    await local.put('layouts', 'same', { name: 'Same' });
    await remote.put('layouts', 'same', { name: 'Same' });
    marks.mark('layouts', 'same');

    expect(await new CompositeStorage(local, remote, marks).copyUp()).toMatchObject({
      current: 1,
      conflicts: [],
    });
    expect(marks.count()).toBe(0);
  });

  it('forgets the marks of what this browser no longer holds, having looked', async () => {
    const marks = memoryMarks();
    marks.mark('layouts', 'gone');
    marks.mark('rulesets', 'gone-too');
    await new CompositeStorage(localAdapter(), fakeRemote(), marks).copyUp();
    expect(marks.count()).toBe(0);
  });

  it('keeps the mark of a document saved while it was being listed', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    const composite = new CompositeStorage(local, remote, marks);
    const list = local.list.bind(local);
    let saved = false;
    // Saved after the list is taken and before the marks are looked at.
    local.list = async (collection) => {
      const listed = await list(collection);
      if (collection === 'layouts' && !saved) {
        saved = true;
        await new CompositeStorage(local, null, marks).put('layouts', 'late', { name: 'Late' });
      }
      return listed;
    };
    await composite.copyUp();
    expect(marks.has('layouts', 'late')).toBe(true);
  });

  it('keeps the mark of a layout that stays for its name', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    await remote.put('layouts', 'mine', { name: 'Mine' });
    await new CompositeStorage(local, null, marks).put('layouts', 'mine-2', { name: 'Mine' });

    expect(await new CompositeStorage(local, remote, marks).copyUp()).toMatchObject({ taken: 1 });
    expect(marks.has('layouts', 'mine-2')).toBe(true);
  });

  it('keeps every mark that is not sent when copying stops partway', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const offline = new CompositeStorage(local, null, marks);
    await offline.put('layouts', 'a', { name: 'A' });
    await offline.put('layouts', 'b', { name: 'B' });
    const remote = fakeRemote();
    const put = remote.put.bind(remote);
    remote.put = async (collection, id, doc, opts) => {
      if (id === 'b') throw new Error('offline');
      return put(collection, id, doc, opts);
    };

    await expect(new CompositeStorage(local, remote, marks).copyUp()).rejects.toBeInstanceOf(
      CopyUpError,
    );
    expect(marks.has('layouts', 'a')).toBe(false);
    expect(marks.has('layouts', 'b')).toBe(true);
  });

  it('forgets everything known of a document deleted here', async () => {
    const { marks, composite } = await agreed();
    await composite.delete('layouts', 'gust');
    expect(marks.base('layouts', 'gust')).toBeNull();
    expect(marks.count()).toBe(0);
  });

  it('does one thing at a time: a save is not written over by a send that read the document before it', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    await new CompositeStorage(local, null, marks).put('layouts', 'a', { name: 'v1' });
    const composite = new CompositeStorage(local, remote, marks);
    // The send reads v1 and is about to write it, held up on the way.
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

    const sending = composite.copyUp();
    await vi.waitFor(() => expect(first).toBe(false));
    // The user saves v2 meanwhile: it waits its turn, rather than going to the gists beside the send.
    const saving = composite.put('layouts', 'a', { name: 'v2' });
    release();
    await Promise.all([sending, saving]);
    await composite.copyUp();

    expect((await remote.get('layouts', 'a'))?.doc.name).toBe('v2');
    expect((await local.get('layouts', 'a'))?.doc.name).toBe('v2');
  });
});

describe('a signed-in save of a document the gists hold another version of', () => {
  it('stays here, marked, rather than writing over a save another browser made since', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    const composite = new CompositeStorage(local, remote, marks);
    await composite.put('layouts', 'gust', { name: 'Gust' });
    // Another browser saves it; this one's editor, open since before, saves its own edit.
    await remote.put('layouts', 'gust', { name: 'Gust (laptop)' });
    await composite.put('layouts', 'gust', { name: 'Gust (phone)' });

    expect((await remote.get('layouts', 'gust'))?.doc.name).toBe('Gust (laptop)');
    expect((await local.get('layouts', 'gust'))?.doc.name).toBe('Gust (phone)');
    expect(marks.has('layouts', 'gust')).toBe(true);
    // It is found as the conflict it is, and asked about.
    const { conflicts } = await composite.copyUp();
    expect(conflicts.map((c) => [c.mine.doc.name, c.theirs.doc.name])).toEqual([
      ['Gust (phone)', 'Gust (laptop)'],
    ]);
  });

  it('is written through as ever when the gists hold the version it is an edit of', async () => {
    const marks = memoryMarks();
    const remote = fakeRemote();
    const composite = new CompositeStorage(localAdapter(), remote, marks);
    await composite.put('layouts', 'gust', { name: 'Gust' });
    await composite.put('layouts', 'gust', { name: 'Gust, edited' });
    expect((await remote.get('layouts', 'gust'))?.doc.name).toBe('Gust, edited');
    expect(marks.count()).toBe(0);
  });

  it('counts the version it handed out as the one an edit of it is made on', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    // Another browser saved it; this one has never held it, and opens it from the account.
    await remote.put('layouts', 'gust', { name: 'Gust (laptop)' });
    const composite = new CompositeStorage(local, remote, marks);
    const opened = await composite.get('layouts', 'gust');
    expect(marks.base('layouts', 'gust')).toBe(opened?.meta.sha);

    // Edited offline from it: its base is what the account held, so it goes up if nobody has touched it.
    await new CompositeStorage(local, null, marks).put('layouts', 'gust', { name: 'Gust (phone)' });
    expect(await composite.copyUp()).toMatchObject({ copied: 1, conflicts: [] });
    expect((await remote.get('layouts', 'gust'))?.doc.name).toBe('Gust (phone)');
  });
});

describe('what a send clears', () => {
  it('does not clear the mark of a document saved again here while it was going up', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    await new CompositeStorage(local, null, marks).put('layouts', 'a', { name: 'v2' });
    const put = remote.put.bind(remote);
    remote.put = async (collection, id, doc, opts) => {
      const meta = await put(collection, id, doc, opts);
      // Another tab of this browser saves v3 meanwhile, straight to the browser's store.
      await local.put('layouts', 'a', { name: 'v3' });
      return meta;
    };

    await new CompositeStorage(local, remote, marks).copyUp();
    expect((await remote.get('layouts', 'a'))?.doc.name).toBe('v2');
    // v3 is not what went up: still waiting, and what this browser shows.
    expect(marks.has('layouts', 'a')).toBe(true);
    expect((await new CompositeStorage(local, remote, marks).get('layouts', 'a'))?.doc.name).toBe(
      'v3',
    );
  });

  it('never writes over a document never edited here that the gists hold another version of', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    const composite = new CompositeStorage(local, remote, marks);
    await composite.put('layouts', 'gust', { name: 'Gust' });
    // Later by its clock, but another's version: this browser's copy was never edited here.
    await remote.put('layouts', 'gust', { name: 'Gust (laptop)' });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.now() + 3_600_000));
    await local.put('layouts', 'gust', { name: 'Gust' });
    vi.useRealTimers();

    expect(await composite.copyUp({ everything: true })).toMatchObject({
      copied: 0,
      conflicts: [],
    });
    expect((await remote.get('layouts', 'gust'))?.doc.name).toBe('Gust (laptop)');
  });
});

describe('a copy up that is given up on', () => {
  it('stops at the next document, keeping what went up', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const offline = new CompositeStorage(local, null, marks);
    await offline.put('layouts', 'a', { name: 'A' });
    await offline.put('layouts', 'b', { name: 'B' });
    await offline.put('layouts', 'c', { name: 'C' });
    const remote = fakeRemote();
    const controller = new AbortController();
    const put = remote.put.bind(remote);
    remote.put = async (collection, id, doc, opts) => {
      const meta = await put(collection, id, doc, opts);
      if (id === 'a') controller.abort();
      return meta;
    };

    await expect(
      new CompositeStorage(local, remote, marks).copyUp({ signal: controller.signal }),
    ).rejects.toBeInstanceOf(CopyUpError);
    expect((await remote.list('layouts')).map((e) => e.id)).toEqual(['a']);
    expect(marks.marked('layouts').sort()).toEqual(['b', 'c']);
  });
});

describe('settling a conflict', () => {
  async function conflicted() {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    const composite = new CompositeStorage(local, remote, marks);
    await composite.put('layouts', 'gust', { name: 'Gust' });
    await new CompositeStorage(local, null, marks).put('layouts', 'gust', { name: 'Gust (phone)' });
    await remote.put('layouts', 'gust', { name: 'Gust (laptop)' });
    const [conflict] = (await composite.copyUp()).conflicts;
    return { marks, local, remote, composite, conflict };
  }

  it("keeps this browser's version: it goes up over the one the user was shown", async () => {
    const { marks, local, remote, composite, conflict } = await conflicted();
    expect(await composite.keepMine(conflict)).toBe('kept');
    expect((await remote.get('layouts', 'gust'))?.doc.name).toBe('Gust (phone)');
    expect((await local.get('layouts', 'gust'))?.doc.name).toBe('Gust (phone)');
    expect(marks.count()).toBe(0);
    expect(marks.base('layouts', 'gust')).toBe((await remote.get('layouts', 'gust'))?.meta.sha);
    // Settled: nothing more to find.
    expect((await composite.copyUp()).conflicts).toEqual([]);
  });

  it("keeps the gists' version: this browser's copy becomes it", async () => {
    const { marks, local, remote, composite, conflict } = await conflicted();
    expect(await composite.keepTheirs(conflict)).toBe('kept');
    expect((await local.get('layouts', 'gust'))?.doc.name).toBe('Gust (laptop)');
    expect((await remote.get('layouts', 'gust'))?.doc.name).toBe('Gust (laptop)');
    expect(marks.count()).toBe(0);
    expect((await composite.copyUp()).conflicts).toEqual([]);
  });

  it('writes nothing, and says so, when the gists changed again after the user was shown them', async () => {
    const { marks, local, remote, composite, conflict } = await conflicted();
    await remote.put('layouts', 'gust', { name: 'Gust (laptop, again)' });

    expect(await composite.keepMine(conflict)).toBe('changed');
    expect(await composite.keepTheirs(conflict)).toBe('changed');
    expect((await remote.get('layouts', 'gust'))?.doc.name).toBe('Gust (laptop, again)');
    expect((await local.get('layouts', 'gust'))?.doc.name).toBe('Gust (phone)');
    expect(marks.has('layouts', 'gust')).toBe(true);
    // The conflict is found afresh, against what the gists hold now.
    expect((await composite.copyUp()).conflicts[0].theirs.name).toBe('Gust (laptop, again)');
  });

  it("keeps this browser's version, and says the gists' is gone, when it was deleted since", async () => {
    const { marks, local, remote, composite, conflict } = await conflicted();
    await remote.delete('layouts', 'gust');
    expect(await composite.keepTheirs(conflict)).toBe('gone');
    // Nothing was thrown away: it is still here, and still waiting to be sent.
    expect((await local.get('layouts', 'gust'))?.doc.name).toBe('Gust (phone)');
    expect(marks.has('layouts', 'gust')).toBe(true);
    expect(await composite.copyUp()).toMatchObject({ copied: 1, conflicts: [] });
  });
});
