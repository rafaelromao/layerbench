import { bundledLayout, type Layout, NameTakenError } from '@layerbench/core';
import { describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../test/memory-storage.js';
import { freeCopyName, retryingSaver, sameDocument, saveNewLayout } from './save-new.js';

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

  it('numbers the id rather than overwrite a layout whose different name slugs the same', async () => {
    const storage = new MemoryStorage();
    await saveNewLayout(storage, { ...qwerty, name: 'My Board' }, 'First');
    const second = await saveNewLayout(storage, { ...qwerty, name: 'My-Board' }, 'Second');
    expect(second.id).toBe('my-board-2');
    expect((await storage.list('layouts')).map((e) => e.id).sort()).toEqual([
      'my-board',
      'my-board-2',
    ]);
  });

  it('makes no second layout under a name one has: it says which, and writes nothing', async () => {
    const storage = new MemoryStorage();
    await saveNewLayout(storage, { ...qwerty, name: 'Magic Breeze' }, 'First');
    const heard = vi.fn();
    const refused = saveNewLayout(storage, { ...qwerty, name: ' magic  breeze' }, 'Again', heard);
    await expect(refused).rejects.toBeInstanceOf(NameTakenError);
    await expect(refused).rejects.toMatchObject({
      taken: { id: 'magic-breeze', name: 'Magic Breeze' },
    });
    expect(heard).not.toHaveBeenCalled();
    expect((await storage.list('layouts')).map((e) => e.id)).toEqual(['magic-breeze']);
  });

  it('overwrites the layout that has the name when asked to, under its id', async () => {
    const storage = new MemoryStorage();
    await saveNewLayout(storage, { ...qwerty, name: 'Magic Breeze' }, 'First');
    const saved = await saveNewLayout(
      storage,
      { ...qwerty, name: 'Magic Breeze', description: 'newer' },
      'Overwrite',
      undefined,
      { overwrite: 'magic-breeze' },
    );
    expect(saved).toEqual({ id: 'magic-breeze' });
    expect(await storage.list('layouts')).toHaveLength(1);
    expect((await storage.get('layouts', 'magic-breeze'))?.doc).toMatchObject({
      id: 'magic-breeze',
      description: 'newer',
    });
  });

  it('does not overwrite a layout renamed since it was offered: it asks about the name anew', async () => {
    const storage = new MemoryStorage();
    await saveNewLayout(storage, { ...qwerty, name: 'Gust' }, 'First');
    await storage.put('layouts', 'gust', {
      ...(await storage.get('layouts', 'gust'))?.doc,
      name: 'Gale',
    });
    expect(
      await saveNewLayout(storage, { ...qwerty, name: 'Gust' }, 'Overwrite', undefined, {
        overwrite: 'gust',
      }),
    ).toEqual({ id: 'gust-2' });
    expect((await storage.get('layouts', 'gust'))?.doc.name).toBe('Gale');
  });

  it('saves under another name picked instead, beside the one that had it', async () => {
    const storage = new MemoryStorage();
    await saveNewLayout(storage, { ...qwerty, name: 'Magic Breeze' }, 'First');
    expect(await saveNewLayout(storage, { ...qwerty, name: 'Magic Breeze 2' }, 'Second')).toEqual({
      id: 'magic-breeze-2',
    });
    expect((await storage.list('layouts')).map((e) => e.name)).toEqual([
      'Magic Breeze',
      'Magic Breeze 2',
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
      saveNewLayout(storage, { ...qwerty, name: 'Mine!' }, 'Second', (id, doc) =>
        heard.push([id, doc]),
      ),
    ).rejects.toThrow('offline');
    expect(heard).toHaveLength(1);
    expect(heard[0][1]).toMatchObject({ id: 'mine-2', name: 'Mine!' });
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
    expect(freeCopyName('Qwerty', ['Qwerty  copy'])).toBe('Qwerty copy 2');
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

describe('retryingSaver', () => {
  /** Storage whose writes land and then fail, as a repository that is down does after the browser. */
  function writesThenFails(storage: MemoryStorage) {
    const put = storage.put.bind(storage);
    storage.put = async (...args) => {
      await put(...args);
      throw new Error('offline');
    };
    return () => {
      storage.put = put;
    };
  }

  it('saves as saveNewLayout does when nothing failed before', async () => {
    const storage = new MemoryStorage();
    const save = retryingSaver();
    expect(await save(storage, { ...qwerty, name: 'Mine' }, 'One')).toEqual({ id: 'mine' });
    await expect(save(storage, { ...qwerty, name: 'Mine' }, 'Two')).rejects.toBeInstanceOf(
      NameTakenError,
    );
    expect(
      await save(storage, { ...qwerty, name: 'Mine', description: 'newer' }, 'Three', {
        overwrite: 'mine',
      }),
    ).toEqual({ id: 'mine' });
    expect((await storage.list('layouts')).map((e) => e.id)).toEqual(['mine']);
    expect((await storage.get('layouts', 'mine'))?.doc.description).toBe('newer');
  });

  it('takes over what a failed save wrote when the same layout is saved again', async () => {
    const storage = new MemoryStorage();
    const save = retryingSaver();
    const mend = writesThenFails(storage);
    await expect(save(storage, { ...qwerty, name: 'Mine' }, 'One')).rejects.toThrow('offline');
    mend();
    expect(await save(storage, { ...qwerty, name: 'Mine' }, 'Two')).toEqual({ id: 'mine' });
    expect((await storage.list('layouts')).map((e) => e.id)).toEqual(['mine']);
  });

  it('makes a layout of its own of a different one saved after a failure', async () => {
    const storage = new MemoryStorage();
    const save = retryingSaver();
    const mend = writesThenFails(storage);
    await expect(save(storage, { ...qwerty, name: 'Mine' }, 'One')).rejects.toThrow('offline');
    mend();
    expect(await save(storage, { ...qwerty, name: 'Yours' }, 'Two')).toEqual({ id: 'yours' });
    expect((await storage.list('layouts')).map((e) => e.id).sort()).toEqual(['mine', 'yours']);
  });

  it('leaves alone a different layout that has the id the failed save took', async () => {
    const storage = new MemoryStorage();
    const save = retryingSaver();
    const put = storage.put.bind(storage);
    storage.put = async () => {
      throw new Error('offline');
    };
    await expect(save(storage, { ...qwerty, name: 'Mine' }, 'One')).rejects.toThrow('offline');
    storage.put = put;
    await saveNewLayout(storage, { ...qwerty, name: 'Theirs', description: 'not mine' }, 'Theirs');
    // Theirs took "theirs"; put another there under the failed id to be sure it is not overwritten.
    await put('layouts', 'mine', {
      ...(await storage.get('layouts', 'theirs'))?.doc,
      id: 'mine',
      name: 'Theirs too',
    });
    expect(await save(storage, { ...qwerty, name: 'Mine' }, 'Two')).toEqual({ id: 'mine-2' });
    expect((await storage.get('layouts', 'mine'))?.doc.description).toBe('not mine');
  });
});
