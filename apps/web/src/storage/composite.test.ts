import type { Collection, StorageAdapter } from '@layerbench/core';
import { NameTakenError, StorageConflictError } from '@layerbench/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryMarks } from '../test/memory-marks.js';
import { MemoryStorage } from '../test/memory-storage.js';
import { CompositeStorage, CopyUpError } from './composite.js';
import { IndexedDbAdapter } from './indexeddb.js';

let counter = 0;
const localAdapter = () => new IndexedDbAdapter(`layerbench-composite-${++counter}`);

/** The gists as a gist's adapter is: a version is the hash of its text, as the browser's store gives it too. */
const contentRemote = () => new MemoryStorage('github', true);

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

  it('saves locally and leaves it marked when the gists changed in between, rather than losing it', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote({
      async put() {
        throw new StorageConflictError();
      },
    });
    const composite = new CompositeStorage(local, remote, marks);

    await composite.put('layouts', 'mine', { name: 'Mine' });
    expect((await local.get('layouts', 'mine'))?.doc).toEqual({ name: 'Mine' });
    expect(marks.has('layouts', 'mine')).toBe(true);
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
      failed: [],
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

  it('sends what the gists lack, and asks about what differs, whichever was saved later', async () => {
    const local = localAdapter();
    const remote = fakeRemote();
    // Saved here after the gists' copy, with no record of which version it is an edit of: asked about.
    await saveAt(remote, '2026-10-01T10:00:00Z', 'layouts', 'edited-here');
    await saveAt(local, '2026-10-02T10:00:00Z', 'layouts', 'edited-here');
    // Saved in the gists after this one's: asked about too, and not sent over.
    await saveAt(local, '2026-10-01T10:00:00Z', 'layouts', 'edited-there');
    await saveAt(remote, '2026-10-02T10:00:00Z', 'layouts', 'edited-there');
    // Only here, in each collection: sent.
    await saveAt(local, '2026-10-01T10:00:00Z', 'rulesets', 'mine');
    await saveAt(local, '2026-10-01T10:00:00Z', 'corpora', 'notes');

    const composite = new CompositeStorage(local, remote);
    expect(composite.reachesRemote).toBe(true);
    const result = await composite.copyUp({ everything: true });
    expect(result).toMatchObject({ copied: 2, current: 0, taken: 0, failed: [] });
    expect(result.conflicts.map((c) => c.id).sort()).toEqual(['edited-here', 'edited-there']);

    const name = async (c: Collection, id: string) => (await remote.get(c, id))?.doc.name;
    // Neither was written over, by clock or otherwise.
    expect(await name('layouts', 'edited-here')).toBe(
      'edited-here from github at 2026-10-01T10:00:00Z',
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
      failed: [],
    });
  });

  it('goes on past a document that cannot be sent, and says which it was and why', async () => {
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

    const first = await composite.copyUp({ everything: true });
    expect(first).toMatchObject({ copied: 1 });
    expect(first.failed).toEqual([{ collection: 'layouts', id: 'b', name: 'B', error: 'offline' }]);

    fail = false;
    expect(await composite.copyUp({ everything: true })).toEqual({
      copied: 1,
      current: 1,
      conflicts: [],
      taken: 0,
      failed: [],
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
      failed: [],
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
      if (collection === 'layouts' && ++lists === 1) {
        await remote.put('layouts', 'busy', { name: 'theirs' });
      }
      return listed;
    };

    const result = await new CompositeStorage(local, remote).copyUp({ everything: true });
    expect(result).toMatchObject({ copied: 0, current: 0, taken: 0 });
    expect(result.conflicts.map((c) => c.id)).toEqual(['busy']);
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
      if (collection === 'layouts' && ++lists === 1) {
        await remote.put('layouts', 'new', { name: 'theirs' });
      }
      return listed;
    };

    const result = await new CompositeStorage(local, remote).copyUp({ everything: true });
    expect(result).toMatchObject({ copied: 0, current: 0, taken: 0 });
    expect(result.conflicts.map((c) => c.id)).toEqual(['new']);
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
    expect(await signedIn.copyUp()).toEqual({
      copied: 1,
      current: 0,
      conflicts: [],
      taken: 0,
      failed: [],
    });
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
    expect(await composite.copyUp()).toEqual({
      copied: 0,
      current: 0,
      conflicts: [],
      taken: 0,
      failed: [],
    });
    expect(await remote.get('layouts', 'old')).toBeNull();
    expect(await composite.copyUp({ everything: true })).toMatchObject({ copied: 1 });
    expect(await remote.get('layouts', 'old')).not.toBeNull();
  });

  it('does not bring back a document another browser deleted', async () => {
    const { marks, local, remote, composite } = await agreed();
    // Deleted from the account elsewhere; this browser still holds it, saved and sent as it was.
    await remote.delete('layouts', 'gust');
    expect(await composite.copyUp()).toEqual({
      copied: 0,
      current: 0,
      conflicts: [],
      taken: 0,
      failed: [],
    });
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

    expect(await composite.copyUp()).toEqual({
      copied: 1,
      current: 0,
      conflicts: [],
      taken: 0,
      failed: [],
    });
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
      if (collection === 'layouts' && ++lists === 1) {
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

  it('keeps the mark of each document it could not send', async () => {
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

    const result = await new CompositeStorage(local, remote, marks).copyUp();
    expect(result.failed.map((f) => f.id)).toEqual(['b']);
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

  it('brings up a copy never edited here, rather than sending it over a version that moved on', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = contentRemote();
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
    expect((await local.get('layouts', 'gust'))?.doc.name).toBe('Gust (laptop)');
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

  it("writes nothing when this browser's copy was saved again since the user was shown the two", async () => {
    const { marks, local, remote, composite, conflict } = await conflicted();
    // Put off with "decide later", and edited again meanwhile: not what they were shown.
    await composite.put('layouts', 'gust', { name: 'Gust (phone, edited since)' });

    expect(await composite.keepTheirs(conflict)).toBe('edited');
    expect((await local.get('layouts', 'gust'))?.doc.name).toBe('Gust (phone, edited since)');
    expect((await remote.get('layouts', 'gust'))?.doc.name).toBe('Gust (laptop)');
    expect(marks.has('layouts', 'gust')).toBe(true);
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

describe('a save is marked before anything else is done with it', () => {
  it('has a mark at every wait after it is written here, so a tab closed meanwhile loses nothing', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    const composite = new CompositeStorage(local, remote, marks);
    await composite.put('layouts', 'gust', { name: 'Gust' });
    // The gists answer slowly to the read before the write, then to the write.
    let release: () => void = () => {};
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    let releaseWrite: () => void = () => {};
    const slowWrite = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const get = remote.get.bind(remote);
    const put = remote.put.bind(remote);
    let stage = 'read';
    remote.get = async (collection, id) => {
      if (stage === 'read') await slow;
      return get(collection, id);
    };
    remote.put = async (collection, id, doc, opts) => {
      stage = 'write';
      await slowWrite;
      return put(collection, id, doc, opts);
    };

    // The mark is there at the moment the browser's copy is written, not only after: a tab killed
    // between the two would leave an edit with no mark, which the gists' older copy then hides.
    let markedAtWrite: boolean | null = null;
    const write = local.put.bind(local);
    local.put = async (collection, id, doc, opts) => {
      markedAtWrite = marks.has(collection, id);
      return write(collection, id, doc, opts);
    };
    const saving = composite.put('layouts', 'gust', { name: 'Gust, edited on the phone' });
    // Waiting on the read: written here, marked.
    await vi.waitFor(async () =>
      expect((await local.get('layouts', 'gust'))?.doc.name).toBe('Gust, edited on the phone'),
    );
    expect(markedAtWrite).toBe(true);
    expect(marks.has('layouts', 'gust')).toBe(true);
    release();
    // Waiting on the write: still marked.
    await vi.waitFor(() => expect(stage).toBe('write'));
    expect(marks.has('layouts', 'gust')).toBe(true);
    releaseWrite();
    await saving;
    expect(marks.has('layouts', 'gust')).toBe(false);
  });

  it('does not leave a mark for a save the browser refused', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    await local.put('layouts', 'other', { name: 'Same' });
    const composite = new CompositeStorage(local, null, marks);
    await expect(composite.put('layouts', 'mine', { name: 'Same' })).rejects.toBeInstanceOf(
      NameTakenError,
    );
    expect(marks.count()).toBe(0);
  });

  it('puts back what it held, and leaves nothing marked, when the gists refuse the name', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    await local.put('layouts', 'gust', { name: 'Gust before' });
    const composite = new CompositeStorage(local, remote, marks);
    // The gists' list does not show it, then their write refuses it: a layout made meanwhile.
    remote.put = async () => {
      throw new NameTakenError({ id: 'x', name: 'Gust' });
    };
    await expect(composite.put('layouts', 'gust', { name: 'Gust' })).rejects.toBeInstanceOf(
      NameTakenError,
    );
    expect((await local.get('layouts', 'gust'))?.doc.name).toBe('Gust before');
    expect(marks.count()).toBe(0);

    // A document that was not there at all is not left behind.
    await expect(composite.put('layouts', 'new', { name: 'Gust' })).rejects.toBeInstanceOf(
      NameTakenError,
    );
    expect(await local.get('layouts', 'new')).toBeNull();
  });

  it("does not leave what a caller's own check refused to be sent unasked", async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    await remote.put('rulesets', 'mine', { name: 'Theirs' });
    const composite = new CompositeStorage(local, remote, marks);
    await expect(
      composite.put('rulesets', 'mine', { name: 'Mine' }, { expectedSha: 'a-version-long-gone' }),
    ).rejects.toBeInstanceOf(StorageConflictError);
    expect(marks.count()).toBe(0);
    expect(await local.get('rulesets', 'mine')).toBeNull();
  });
});

describe('a signed-in save that cannot be weighed against the gists', () => {
  it('stays here, marked, when the gists cannot be read', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    const composite = new CompositeStorage(local, remote, marks);
    await composite.put('layouts', 'gust', { name: 'Gust' });
    remote.get = async () => {
      throw new Error('GitHub did not answer in time');
    };
    const put = vi.spyOn(remote, 'put');

    await composite.put('layouts', 'gust', { name: 'Gust, edited' });
    expect(put).not.toHaveBeenCalled();
    expect((await local.get('layouts', 'gust'))?.doc.name).toBe('Gust, edited');
    expect(marks.has('layouts', 'gust')).toBe(true);
  });

  it('is written over the version just read, and no other', async () => {
    const marks = memoryMarks();
    const remote = fakeRemote();
    const composite = new CompositeStorage(localAdapter(), remote, marks);
    await composite.put('layouts', 'gust', { name: 'Gust' });
    const put = vi.spyOn(remote, 'put');
    const before = (await remote.get('layouts', 'gust'))?.meta.sha;

    await composite.put('layouts', 'gust', { name: 'Gust, edited' });
    expect(put).toHaveBeenCalledWith(
      'layouts',
      'gust',
      { name: 'Gust, edited' },
      expect.objectContaining({ expectedSha: before }),
    );
  });

  it('stays here, marked, for a document this browser held a copy of with no record of its version', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    await local.put('layouts', 'gust', { name: 'Gust, from before versions were kept' });
    await remote.put('layouts', 'gust', { name: 'Gust (laptop)' });

    await new CompositeStorage(local, remote, marks).put('layouts', 'gust', {
      name: 'Gust, edited here',
    });
    expect((await remote.get('layouts', 'gust'))?.doc.name).toBe('Gust (laptop)');
    expect(marks.has('layouts', 'gust')).toBe(true);
  });

  it('is not weighed again when it already is what the gists hold', async () => {
    const marks = memoryMarks();
    const remote = fakeRemote();
    const composite = new CompositeStorage(localAdapter(), remote, marks);
    await remote.put('layouts', 'gust', { name: 'Gust' });
    const put = vi.spyOn(remote, 'put');
    await composite.put('layouts', 'gust', { name: 'Gust' });
    expect(put).not.toHaveBeenCalled();
    expect(marks.count()).toBe(0);
  });
});

describe('what an edit is made on', () => {
  it('is the version this browser was handed, which its own copy is brought up to', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = contentRemote();
    const composite = new CompositeStorage(local, remote, marks);
    await composite.put('layouts', 'x', { name: 'X v1' });
    // The laptop edits; the phone opens it, signed in.
    await remote.put('layouts', 'x', { name: 'X v2' });
    expect((await composite.get('layouts', 'x'))?.doc.name).toBe('X v2');
    await composite.whenIdle();
    expect((await local.get('layouts', 'x'))?.doc.name).toBe('X v2');

    // Then offline, from the copy it holds: an edit of v2.
    await new CompositeStorage(local, null, marks).put('layouts', 'x', { name: 'X v2 edited' });
    expect(await composite.copyUp()).toMatchObject({ copied: 1, conflicts: [] });
    expect((await remote.get('layouts', 'x'))?.doc.name).toBe('X v2 edited');
  });

  it("is a conflict, not an overwrite, when the laptop edits again after the phone's copy was brought up", async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = contentRemote();
    const composite = new CompositeStorage(local, remote, marks);
    await composite.put('layouts', 'x', { name: 'X v1' });
    await remote.put('layouts', 'x', { name: 'X v2' });
    await composite.get('layouts', 'x');
    await composite.whenIdle();
    await new CompositeStorage(local, null, marks).put('layouts', 'x', { name: 'X v2 edited' });
    await remote.put('layouts', 'x', { name: 'X v3' });

    const { conflicts, copied } = await composite.copyUp();
    expect(copied).toBe(0);
    expect(conflicts.map((c) => c.theirs.doc.name)).toEqual(['X v3']);
    expect((await remote.get('layouts', 'x'))?.doc.name).toBe('X v3');
  });

  it("is not moved to the gists' version when this browser could not bring its copy up to it", async () => {
    const marks = memoryMarks();
    const inner = localAdapter();
    const remote = contentRemote();
    // The browser refuses what it is told to read in, as a name it holds for another layout would.
    const local = Object.assign(Object.create(inner) as typeof inner, {
      put: async (...args: Parameters<typeof inner.put>) => {
        if (args[3]?.message?.startsWith('Read')) throw new Error('refused');
        return inner.put(...args);
      },
    });
    const composite = new CompositeStorage(local, remote, marks);
    await composite.put('layouts', 'x', { name: 'X v1' });
    await remote.put('layouts', 'x', { name: 'X v2' });
    await composite.get('layouts', 'x');
    await composite.whenIdle();
    expect((await inner.get('layouts', 'x'))?.doc.name).toBe('X v1');

    // Offline, an edit of v1: the gists hold v2, so it is weighed, not sent over it.
    await new CompositeStorage(inner, null, marks).put('layouts', 'x', { name: 'X v1 edited' });
    const { conflicts, copied } = await composite.copyUp();
    expect(copied).toBe(0);
    expect(conflicts).toHaveLength(1);
    expect((await remote.get('layouts', 'x'))?.doc.name).toBe('X v2');
  });
});

describe('looking at every document against the gists by content', () => {
  const sha = async (doc: object) => (await import('./indexeddb.js')).sha1Hex(JSON.stringify(doc));

  it('records what both hold where it is the same, and says it is', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    await local.put('layouts', 'same', { name: 'Same' });
    await remote.put('layouts', 'same', { name: 'Same' });
    const found = await new CompositeStorage(local, remote, marks).audit();
    expect(found).toEqual({ equal: 1, adopted: 0, marked: 0, lacking: 0 });
    expect(marks.base('layouts', 'same')).toBe((await remote.get('layouts', 'same'))?.meta.sha);
  });

  it("brings this browser's copy up to the gists' when it was not edited here since they agreed", async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    const v1 = { name: 'X v1' };
    await local.put('layouts', 'x', v1);
    await remote.put('layouts', 'x', { name: 'X v2' });
    // Both held v1 when they last agreed.
    marks.setBase('layouts', 'x', await sha(v1));

    const found = await new CompositeStorage(local, remote, marks).audit();
    expect(found).toMatchObject({ adopted: 1, marked: 0 });
    expect((await local.get('layouts', 'x'))?.doc.name).toBe('X v2');
    expect(marks.count()).toBe(0);
  });

  it('marks a document that differs and is not known to be an older copy, never deciding by clocks', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    // The phone's, saved before edits were marked, and never sent; the gists have an older one.
    await remote.put('layouts', 'gust', { name: 'Gust (older, in the account)' });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.now() + 3_600_000));
    await local.put('layouts', 'gust', { name: 'Gust (phone)' });
    vi.useRealTimers();

    const composite = new CompositeStorage(local, remote, marks);
    expect(await composite.audit()).toMatchObject({ marked: 1 });
    expect(marks.has('layouts', 'gust')).toBe(true);
    // Weighed like any other: with no version on record it is a conflict, even though it is later.
    const { conflicts } = await composite.copyUp();
    expect(conflicts.map((c) => c.id)).toEqual(['gust']);
    expect((await remote.get('layouts', 'gust'))?.doc.name).toBe('Gust (older, in the account)');
  });

  it('counts what the gists lack and leaves it alone, as another browser may have deleted it', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    await local.put('layouts', 'only-here', { name: 'Only here' });
    const found = await new CompositeStorage(local, remote, marks).audit();
    expect(found).toMatchObject({ lacking: 1, marked: 0 });
    expect(marks.count()).toBe(0);
    expect(await remote.get('layouts', 'only-here')).toBeNull();
  });

  it('leaves alone what is waiting to be sent', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    await local.put('layouts', 'a', { name: 'A (here)' });
    await remote.put('layouts', 'a', { name: 'A (there)' });
    marks.mark('layouts', 'a');
    const found = await new CompositeStorage(local, remote, marks).audit();
    expect(found).toEqual({ equal: 0, adopted: 0, marked: 0, lacking: 0 });
  });

  it('does not say a document is up to date when it differs: it is asked about', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    await local.put('layouts', 'a', { name: 'A (here)' });
    await remote.put('layouts', 'a', { name: 'A (there)' });
    // A version on record that this browser's copy is not: it is an edit, whatever the clocks say.
    marks.setBase('layouts', 'a', 'a-version-this-browser-no-longer-has');
    const result = await new CompositeStorage(local, remote, marks).copyUp({ everything: true });
    expect(result).toMatchObject({ current: 0, copied: 0 });
    expect(result.conflicts.map((c) => c.id)).toEqual(['a']);
  });
});

describe('deleting', () => {
  it('does not delete a version another browser saved since this one last held it', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    const composite = new CompositeStorage(local, remote, marks);
    await composite.put('layouts', 'gust', { name: 'Gust' });
    await remote.put('layouts', 'gust', { name: 'Gust (laptop)' });

    await expect(composite.delete('layouts', 'gust')).rejects.toBeInstanceOf(StorageConflictError);
    expect((await remote.get('layouts', 'gust'))?.doc.name).toBe('Gust (laptop)');
    expect(await local.get('layouts', 'gust')).not.toBeNull();
  });

  it('keeps an edit not sent yet, and the mark, when the gists cannot be reached to delete from', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    const composite = new CompositeStorage(local, remote, marks);
    await new CompositeStorage(local, null, marks).put('layouts', 'gust', { name: 'Gust (phone)' });
    remote.get = async () => {
      throw new Error('GitHub did not answer in time');
    };

    await expect(composite.delete('layouts', 'gust')).rejects.toThrow('did not answer');
    expect((await local.get('layouts', 'gust'))?.doc.name).toBe('Gust (phone)');
    expect(marks.has('layouts', 'gust')).toBe(true);
  });

  it('deletes from both, and forgets it, when nobody else has touched it', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = fakeRemote();
    const composite = new CompositeStorage(local, remote, marks);
    await composite.put('layouts', 'gust', { name: 'Gust' });
    await composite.delete('layouts', 'gust');
    expect(await local.get('layouts', 'gust')).toBeNull();
    expect(await remote.get('layouts', 'gust')).toBeNull();
    expect(marks.base('layouts', 'gust')).toBeNull();
  });

  it('keeps the mark of an unsent document when the browser fails to delete it', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const composite = new CompositeStorage(local, null, marks);
    await composite.put('layouts', 'gust', { name: 'Gust' });
    local.delete = async () => {
      throw new Error('the browser refused');
    };
    await expect(composite.delete('layouts', 'gust')).rejects.toThrow('the browser refused');
    expect(marks.has('layouts', 'gust')).toBe(true);
  });
});

describe('where the browser is all there is', () => {
  it('says so when it cannot be read, rather than listing nothing', async () => {
    const local = localAdapter();
    local.list = async () => {
      throw new Error('the browser refused to open its database');
    };
    await expect(new CompositeStorage(local, null).list('layouts')).rejects.toThrow('refused');
  });

  it('still lists the gists when signed in and the browser cannot be read', async () => {
    const local = localAdapter();
    local.list = async () => {
      throw new Error('refused');
    };
    const remote = fakeRemote();
    await remote.put('layouts', 'there', { name: 'There' });
    expect((await new CompositeStorage(local, remote).list('layouts')).map((e) => e.id)).toEqual([
      'there',
    ]);
  });
});

describe('a copy up that meets documents it cannot send', () => {
  it('goes on to the rest, and ends once several in a row fail, with what it did', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const offline = new CompositeStorage(local, null, marks);
    for (const id of ['a', 'b', 'c', 'd', 'e']) await offline.put('layouts', id, { name: id });
    const remote = fakeRemote();
    const put = remote.put.bind(remote);
    remote.put = async (collection, id, doc, opts) => {
      if (id !== 'a') throw new Error(`too large: ${id}`);
      return put(collection, id, doc, opts);
    };

    const error = await new CompositeStorage(local, remote, marks)
      .copyUp()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CopyUpError);
    const { result } = error as CopyUpError;
    expect(result.copied).toBe(1);
    expect(result.failed.map((f) => f.id)).toEqual(['b', 'c', 'd']);
    expect(marks.marked('layouts').sort()).toEqual(['b', 'c', 'd', 'e']);
  });
});

describe('a read of a document whose copy here may be an edit', () => {
  it('keeps and marks a copy that differs and has no version on record, rather than overwriting it', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = contentRemote();
    // Saved by the first version, which kept no mark and no record: an edit, and an older gist copy.
    await remote.put('layouts', 'x', { name: 'X in the account' });
    await local.put('layouts', 'x', { name: 'X edited on the phone' });
    const composite = new CompositeStorage(local, remote, marks);

    expect((await composite.get('layouts', 'x'))?.doc.name).toBe('X edited on the phone');
    await composite.whenIdle();
    expect((await local.get('layouts', 'x'))?.doc.name).toBe('X edited on the phone');
    expect(marks.has('layouts', 'x')).toBe(true);
    // And weighed like any other edit: asked about, not sent over the account's.
    expect((await composite.copyUp()).conflicts.map((c) => c.id)).toEqual(['x']);
    expect((await remote.get('layouts', 'x'))?.doc.name).toBe('X in the account');
  });

  it('does the same where a mark was lost, though a version is on record', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = contentRemote();
    const composite = new CompositeStorage(local, remote, marks);
    await composite.put('layouts', 'x', { name: 'X v1' });
    // Edited here without the mark (lost): the record is still of v1, which this copy is not.
    await local.put('layouts', 'x', { name: 'X v1, edited' });
    await remote.put('layouts', 'x', { name: 'X v2' });

    expect((await composite.get('layouts', 'x'))?.doc.name).toBe('X v1, edited');
    expect(marks.has('layouts', 'x')).toBe(true);
    expect((await local.get('layouts', 'x'))?.doc.name).toBe('X v1, edited');
  });

  it("survives the Library's bulk reads and the audit all at once", async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = contentRemote();
    for (const id of ['a', 'b', 'c', 'x'])
      await remote.put('layouts', id, { name: `${id} in the account` });
    for (const id of ['a', 'b', 'c'])
      await local.put('layouts', id, { name: `${id} in the account` });
    await local.put('layouts', 'x', { name: 'x edited on the phone' });
    const composite = new CompositeStorage(local, remote, marks);

    await Promise.all([
      composite.audit(),
      ...['a', 'b', 'c', 'x'].map((id) => composite.get('layouts', id)),
      ...['a', 'b', 'c', 'x'].map((id) => composite.get('layouts', id)),
    ]);
    await composite.whenIdle();
    expect((await local.get('layouts', 'x'))?.doc.name).toBe('x edited on the phone');
    expect(marks.has('layouts', 'x')).toBe(true);
  });

  it('does not bring a copy up that a save changed while the account was being read', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = contentRemote();
    const composite = new CompositeStorage(local, remote, marks);
    await composite.put('layouts', 'd', { name: 'D v1' });
    // The account moved on; this browser's copy is unedited, so the audit means to bring it up.
    await remote.put('layouts', 'd', { name: 'D v2' });
    let release: () => void = () => {};
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const get = remote.get.bind(remote);
    remote.get = async (collection, id) => {
      const seen = await get(collection, id);
      await slow;
      return seen;
    };

    const auditing = composite.audit();
    await new Promise((r) => setTimeout(r, 20));
    // Saved while it waits.
    await new CompositeStorage(local, null, marks).put('layouts', 'd', { name: 'D v1, edited' });
    release();
    await auditing;

    expect((await local.get('layouts', 'd'))?.doc.name).toBe('D v1, edited');
    expect(marks.has('layouts', 'd')).toBe(true);
  });

  it('does not bring a copy up that a save marked while a read was being settled', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = contentRemote();
    const composite = new CompositeStorage(local, remote, marks);
    await composite.put('layouts', 'd', { name: 'D v1' });
    await remote.put('layouts', 'd', { name: 'D v2' });
    // Read, which would bring this copy up to v2 in its own turn; a save lands first.
    await composite.get('layouts', 'd');
    await new CompositeStorage(local, null, marks).put('layouts', 'd', { name: 'D v1, edited' });
    await composite.whenIdle();
    expect((await local.get('layouts', 'd'))?.doc.name).toBe('D v1, edited');
  });
});

describe('a save weighed against the version the editor read', () => {
  it('stays here, and is a conflict, when the account moved on, though a read since moved the record on', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = contentRemote();
    const composite = new CompositeStorage(local, remote, marks);
    await composite.put('layouts', 'x', { name: 'X R1' });
    const r1 = (await remote.get('layouts', 'x'))?.meta.sha as string;
    // The laptop saves R2; the Library's read brings this browser's copy and its record up to R2.
    await remote.put('layouts', 'x', { name: 'X R2' });
    await composite.get('layouts', 'x');
    await composite.whenIdle();
    expect(marks.base('layouts', 'x')).toBe((await remote.get('layouts', 'x'))?.meta.sha);

    // The editor, still on R1 with edits, saves.
    await composite.put('layouts', 'x', { name: 'X R1, edited' }, { basedOn: r1 });
    expect((await remote.get('layouts', 'x'))?.doc.name).toBe('X R2');
    expect(marks.has('layouts', 'x')).toBe(true);
    // And it is asked about, not sent over R2.
    expect((await composite.copyUp()).conflicts.map((c) => c.theirs.doc.name)).toEqual(['X R2']);
    expect((await remote.get('layouts', 'x'))?.doc.name).toBe('X R2');
  });

  it('is written through when the account still holds the version the editor read', async () => {
    const marks = memoryMarks();
    const remote = contentRemote();
    const composite = new CompositeStorage(localAdapter(), remote, marks);
    await composite.put('layouts', 'x', { name: 'X R1' });
    const r1 = (await remote.get('layouts', 'x'))?.meta.sha as string;
    await composite.put('layouts', 'x', { name: 'X R1, edited' }, { basedOn: r1 });
    expect((await remote.get('layouts', 'x'))?.doc.name).toBe('X R1, edited');
    expect(marks.count()).toBe(0);
  });

  it('records the version an offline edit was made on, for the sender', async () => {
    const marks = memoryMarks();
    const local = localAdapter();
    const remote = contentRemote();
    const composite = new CompositeStorage(local, remote, marks);
    await composite.put('layouts', 'x', { name: 'X R1' });
    const r1 = (await remote.get('layouts', 'x'))?.meta.sha as string;
    await remote.put('layouts', 'x', { name: 'X R2' });
    await composite.get('layouts', 'x');
    await composite.whenIdle();

    // Signed out, the editor that read R1 saves: its edit is of R1, whatever was read since.
    await new CompositeStorage(local, null, marks).put(
      'layouts',
      'x',
      { name: 'X R1, edited' },
      { basedOn: r1 },
    );
    expect(marks.base('layouts', 'x')).toBe(r1);
    expect((await composite.copyUp()).conflicts).toHaveLength(1);
  });
});

describe('a save and a read on a slow connection', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps a layout before the gists are asked about its name, and goes on when they are slow', async () => {
    vi.useFakeTimers();
    const marks = memoryMarks();
    const local = new MemoryStorage('local');
    const remote = new MemoryStorage('github');
    const list = remote.list.bind(remote);
    // The name check never answers; everything after it does.
    let asked = false;
    remote.list = (collection) => {
      if (asked) return list(collection);
      asked = true;
      return new Promise(() => {});
    };
    const composite = new CompositeStorage(local, remote, marks);

    const saving = composite.put('layouts', 'mine', { name: 'Mine' });
    // Written and marked at once, long before the gists give up.
    await vi.advanceTimersByTimeAsync(10);
    expect((await local.get('layouts', 'mine'))?.doc.name).toBe('Mine');
    expect(marks.has('layouts', 'mine')).toBe(true);

    await vi.advanceTimersByTimeAsync(6_000);
    await saving;
  });

  it('shows the copy it has rather than waiting for slow gists', async () => {
    vi.useFakeTimers();
    const marks = memoryMarks();
    const local = new MemoryStorage('local');
    const remote = new MemoryStorage('github');
    await local.put('layouts', 'mine', { name: 'Mine' });
    remote.get = () => new Promise(() => {});
    const composite = new CompositeStorage(local, remote, marks);

    const read = composite.get('layouts', 'mine');
    await vi.advanceTimersByTimeAsync(5_500);
    expect((await read)?.doc.name).toBe('Mine');
  });

  it('still waits for the gists when it has no copy to show', async () => {
    vi.useFakeTimers();
    const local = new MemoryStorage('local');
    const remote = new MemoryStorage('github');
    await remote.put('layouts', 'there', { name: 'There' });
    const get = remote.get.bind(remote);
    remote.get = async (collection, id) => {
      await new Promise((r) => setTimeout(r, 8_000));
      return get(collection, id);
    };
    const read = new CompositeStorage(local, remote).get('layouts', 'there');
    await vi.advanceTimersByTimeAsync(9_000);
    expect((await read)?.doc.name).toBe('There');
  });
});
