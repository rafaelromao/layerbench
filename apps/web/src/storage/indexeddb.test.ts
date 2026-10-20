import {
  bundledLayout,
  NameTakenError,
  StorageConflictError,
  slug,
  toCanonicalJson,
} from '@layerbench/core';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexedDbAdapter } from './indexeddb.js';

/** A fresh database per test, so one test's documents never leak into another. */
let adapter: IndexedDbAdapter;
let counter = 0;

beforeEach(() => {
  adapter = new IndexedDbAdapter(`layerbench-test-${++counter}`);
});

describe('custom documents', () => {
  it('stores, lists, reloads and deletes a layout', async () => {
    const layout = bundledLayout('colemak-dh')!;
    const doc = toCanonicalJson(layout);
    const id = slug(layout.name);
    expect(id).toBe('colemak-dh');

    expect(await adapter.list('layouts')).toEqual([]);

    const meta = await adapter.put('layouts', id, doc);
    expect(meta.sha).toMatch(/^[0-9a-f]{40}$/);

    const entries = await adapter.list('layouts');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id, name: 'Colemak-DH', layers: 4, geometry: '3x5+2' });

    const loaded = await adapter.get('layouts', id);
    expect(loaded?.doc).toEqual(doc);
    expect(loaded?.meta.sha).toBe(meta.sha);

    await adapter.delete('layouts', id);
    expect(await adapter.get('layouts', id)).toBeNull();
    expect(await adapter.list('layouts')).toEqual([]);
  });

  it('refuses a write that lost a race, and accepts the current version', async () => {
    const doc = toCanonicalJson(bundledLayout('qwerty')!);
    const first = await adapter.put('layouts', 'qwerty', doc);

    await expect(
      adapter.put('layouts', 'qwerty', { ...doc, name: 'Other' }, { expectedSha: 'stale' }),
    ).rejects.toBeInstanceOf(StorageConflictError);

    const second = await adapter.put(
      'layouts',
      'qwerty',
      { ...doc, name: 'Renamed' },
      { expectedSha: first.sha },
    );
    expect(second.sha).not.toBe(first.sha);
    const loaded = await adapter.get('layouts', 'qwerty');
    expect(loaded?.doc.name).toBe('Renamed');
  });

  it('treats a first write of an id as uncontested', async () => {
    const doc = toCanonicalJson(bundledLayout('dvorak')!);
    await expect(
      adapter.put('layouts', 'dvorak', doc, { expectedSha: 'anything' }),
    ).resolves.toBeDefined();
  });

  it('keeps the index sorted by name and free of duplicates', async () => {
    await adapter.put('layouts', 'z', { name: 'Zeta' });
    await adapter.put('layouts', 'a', { name: 'Alpha' });
    await adapter.put('layouts', 'z', { name: 'Zeta again' });

    const entries = await adapter.list('layouts');
    expect(entries.map((e) => e.id)).toEqual(['a', 'z']);
    expect(entries.map((e) => e.name)).toEqual(['Alpha', 'Zeta again']);
  });

  it('refuses a second layout under a name one already has, and writes nothing', async () => {
    await adapter.put('layouts', 'mine', { name: 'Mine' });
    const refused = adapter.put('layouts', 'mine-2', { name: 'MINE ' });
    await expect(refused).rejects.toBeInstanceOf(NameTakenError);
    await expect(refused).rejects.toMatchObject({ taken: { id: 'mine', name: 'Mine' } });
    expect(await adapter.get('layouts', 'mine-2')).toBeNull();
    expect((await adapter.list('layouts')).map((e) => e.id)).toEqual(['mine']);
  });

  it('overwrites the layout that has the name in place, and renames to a name nobody has', async () => {
    await adapter.put('layouts', 'mine', { name: 'Mine' });
    await adapter.put('layouts', 'other', { name: 'Other' });
    await adapter.put('layouts', 'mine', { name: 'Mine', description: 'newer' });
    expect((await adapter.get('layouts', 'mine'))?.doc.description).toBe('newer');

    await expect(adapter.put('layouts', 'mine', { name: 'Other' })).rejects.toMatchObject({
      taken: { id: 'other' },
    });
    await adapter.put('layouts', 'mine', { name: 'Yours' });
    expect((await adapter.list('layouts')).map((e) => e.name)).toEqual(['Other', 'Yours']);
  });

  it('refuses a name already taken even when the index was lost', async () => {
    await adapter.put('layouts', 'mine', { name: 'Mine' });
    const db = await openDB(`layerbench-test-${counter}`);
    await db.delete('indexes', 'layouts');
    db.close();

    await expect(adapter.put('layouts', 'mine-2', { name: 'Mine' })).rejects.toBeInstanceOf(
      NameTakenError,
    );
    await adapter.put('layouts', 'other', { name: 'Other' });
    expect((await adapter.list('layouts')).map((e) => e.id)).toEqual(['mine', 'other']);
  });

  it('summarizes each collection with its own fields', async () => {
    await adapter.put('rulesets', 'mine', { name: 'Mine', description: 'd', rules: [1, 2, 3] });
    await adapter.put('corpora', 'notes', {
      name: 'Notes',
      language: 'en',
      license: 'user-provided',
      words: 42,
    });

    expect((await adapter.list('rulesets'))[0]).toMatchObject({ description: 'd', rules: 3 });
    expect((await adapter.list('corpora'))[0]).toMatchObject({ language: 'en', words: 42 });
  });

  it('rebuilds a lost index with each document as of when it was saved', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T10:00:00Z'));
    await adapter.put('layouts', 'mine', { name: 'Mine' });
    vi.useRealTimers();
    const db = await openDB(`layerbench-test-${counter}`);
    await db.delete('indexes', 'layouts');
    db.close();

    expect(await adapter.list('layouts')).toMatchObject([
      { id: 'mine', updatedAt: '2026-10-01T10:00:00.000Z' },
    ]);
  });
});
