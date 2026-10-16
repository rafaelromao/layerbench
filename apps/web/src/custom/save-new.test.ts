import { bundledLayout, type Layout } from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../test/memory-storage.js';
import { freeCopyName, sameDocument, saveNewLayout } from './save-new.js';

const qwerty = bundledLayout('qwerty') as Layout;

describe('saveNewLayout', () => {
  it('stores the layout under the id its name gives, with that id in the document', async () => {
    const storage = new MemoryStorage();
    const { id } = await saveNewLayout(storage, { ...qwerty, name: 'My Board' }, 'Create');
    expect(id).toBe('my-board');
    const stored = await storage.get('layouts', id);
    expect(stored?.doc.id).toBe('my-board');
    expect(stored?.doc.name).toBe('My Board');
  });

  it('numbers the id rather than overwrite a layout whose name slugs the same', async () => {
    const storage = new MemoryStorage();
    await saveNewLayout(storage, { ...qwerty, name: 'My Board' }, 'First');
    const second = await saveNewLayout(storage, { ...qwerty, name: 'my  board' }, 'Second');
    expect(second.id).toBe('my-board-2');
    expect((await storage.list('layouts')).map((e) => e.id).sort()).toEqual([
      'my-board',
      'my-board-2',
    ]);
  });

  it('says which id it took before it writes, so a save that fails can be found again', async () => {
    const storage = new MemoryStorage();
    await saveNewLayout(storage, { ...qwerty, name: 'Mine' }, 'First');
    const heard: [string, unknown][] = [];
    storage.put = async () => {
      expect(heard.map(([id]) => id)).toEqual(['mine-2']);
      throw new Error('offline');
    };
    await expect(
      saveNewLayout(storage, { ...qwerty, name: 'Mine' }, 'Second', (id, doc) =>
        heard.push([id, doc]),
      ),
    ).rejects.toThrow('offline');
    expect(heard).toHaveLength(1);
    expect(heard[0][1]).toMatchObject({ id: 'mine-2', name: 'Mine' });
  });

  it('passes the commit message on', async () => {
    const storage = new MemoryStorage();
    const put = storage.put.bind(storage);
    const messages: (string | undefined)[] = [];
    storage.put = async (collection, id, doc, opts) => {
      messages.push(opts?.message);
      return put(collection, id, doc, opts);
    };
    await saveNewLayout(storage, qwerty, 'Import layout Qwerty');
    expect(messages).toEqual(['Import layout Qwerty']);
  });
});

describe('freeCopyName', () => {
  it('is the name with copy after it', () => {
    expect(freeCopyName('Qwerty', ['Qwerty', 'Dvorak'])).toBe('Qwerty copy');
  });

  it('is numbered while a layout already has the name', () => {
    expect(freeCopyName('Qwerty', ['Qwerty copy'])).toBe('Qwerty copy 2');
    expect(freeCopyName('Qwerty', ['Qwerty copy', 'Qwerty copy 2'])).toBe('Qwerty copy 3');
  });

  it('compares names as they read, not as they are written', () => {
    expect(freeCopyName('  Qwerty ', ['qwerty COPY '])).toBe('Qwerty copy 2');
  });
});

describe('sameDocument', () => {
  it('reads documents alike whichever order their keys came in', () => {
    expect(
      sameDocument(
        { a: 1, b: { c: 2, d: [1, { e: 1, f: 2 }] } },
        { b: { d: [1, { f: 2, e: 1 }], c: 2 }, a: 1 },
      ),
    ).toBe(true);
  });

  it('tells documents that differ, in a value or in the order of a list', () => {
    expect(sameDocument({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameDocument({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(sameDocument({ a: 1 }, { a: 1, b: 1 })).toBe(false);
  });
});
