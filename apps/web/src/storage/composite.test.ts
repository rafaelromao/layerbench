import type { Collection, JsonObject, StorageAdapter } from '@layoutmaster/core';
import { StorageConflictError } from '@layoutmaster/core';
import { describe, expect, it } from 'vitest';
import { CompositeStorage } from './composite.js';
import { IndexedDbAdapter } from './indexeddb.js';

let counter = 0;
const localAdapter = () => new IndexedDbAdapter(`layoutmaster-composite-${++counter}`);

/** A stand-in for the repository, so the tests are about the composition, not the network. */
function fakeRemote(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  const docs = new Map<string, JsonObject>();
  return {
    id: 'github',
    async list() {
      return [...docs.entries()].map(([id, doc]) => ({
        id,
        name: (doc.name as string) ?? id,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }));
    },
    async get(_c: Collection, id: string) {
      const doc = docs.get(id);
      return doc ? { doc, meta: { sha: 'remote' } } : null;
    },
    async put(_c: Collection, id: string, doc: JsonObject) {
      docs.set(id, doc);
      return { sha: 'remote' };
    },
    async delete(_c: Collection, id: string) {
      docs.delete(id);
    },
    ...overrides,
  };
}

describe('two stores at once', () => {
  it('writes to both, and the repository answers reads', async () => {
    const local = localAdapter();
    const remote = fakeRemote();
    const composite = new CompositeStorage(local, remote);

    await composite.put('layouts', 'mine', { name: 'Mine' });
    expect((await local.get('layouts', 'mine'))?.doc).toEqual({ name: 'Mine' });
    expect((await composite.get('layouts', 'mine'))?.meta.sha).toBe('remote');
  });

  it('keeps working when the repository is unreachable', async () => {
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

  it('merges both listings, with the repository winning a shared id', async () => {
    const local = localAdapter();
    const remote = fakeRemote();
    await local.put('layouts', 'shared', { name: 'Local copy' });
    await local.put('layouts', 'only-here', { name: 'Only here' });
    await remote.put('layouts', 'shared', { name: 'Repository copy' });

    const entries = await new CompositeStorage(local, remote).list('layouts');
    expect(entries.map((e) => e.id).sort()).toEqual(['only-here', 'shared']);
    expect(entries.find((e) => e.id === 'shared')?.name).toBe('Repository copy');
  });

  it('copies everything up for a first sync', async () => {
    const local = localAdapter();
    const remote = fakeRemote();
    await local.put('layouts', 'a', { name: 'A' });
    await local.put('layouts', 'b', { name: 'B' });

    const pushed = await new CompositeStorage(local, remote).pushAll('layouts');
    expect(pushed).toBe(2);
    expect((await remote.get('layouts', 'b'))?.doc).toEqual({ name: 'B' });
  });

  it('behaves like the browser store alone when no repository is set', async () => {
    const composite = new CompositeStorage(localAdapter(), null);
    await composite.put('layouts', 'mine', { name: 'Mine' });
    expect((await composite.get('layouts', 'mine'))?.doc).toEqual({ name: 'Mine' });
    expect(await composite.pushAll('layouts')).toBe(0);
  });
});
