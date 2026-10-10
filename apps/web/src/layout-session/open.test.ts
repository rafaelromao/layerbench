import { bundledLayout, type Layout, toCanonicalJson } from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../test/memory-storage.js';
import { encodeInline } from '../url/inline.js';
import { inlineRef } from '../url/params.js';
import { carriedRef, openLayout } from './open.js';

const qwerty = bundledLayout('qwerty') as Layout;
const mine: Layout = { ...qwerty, id: 'mine', name: 'Mine' };

async function storageWith(...layouts: Layout[]): Promise<MemoryStorage> {
  const storage = new MemoryStorage();
  for (const l of layouts) await storage.put('layouts', l.id as string, toCanonicalJson(l));
  return storage;
}

const opened = async (ref: string, storage: MemoryStorage) => {
  const o = await openLayout(ref, storage);
  if (!o.ok) throw new Error(o.error);
  return o;
};

describe('Opening a reference', () => {
  it('opens a bundled layout as a layout of its own', async () => {
    const o = await opened('qwerty', await storageWith());
    expect(o.layout.name).toBe('Qwerty');
    expect(o.storedId).toBeNull();
  });

  it('opens a saved layout, by `saved:` or by its id alone, as that saved layout', async () => {
    const storage = await storageWith(mine);
    expect(await opened('saved:mine', storage)).toMatchObject({ storedId: 'mine' });
    expect(await opened('mine', storage)).toMatchObject({ storedId: 'mine' });
  });

  it('opens a layout carried whole as the saved one only where that is saved with the same contents', async () => {
    const ref = inlineRef(await encodeInline(mine));
    expect((await opened(ref, await storageWith(mine))).storedId).toBe('mine');
    expect((await opened(ref, await storageWith())).storedId).toBeNull();
    const changed = { ...mine, name: 'Mine, changed' };
    expect((await opened(ref, await storageWith(changed))).storedId).toBeNull();
    expect(
      (await opened(inlineRef(await encodeInline(qwerty)), await storageWith())).storedId,
    ).toBeNull();
  });

  it('leaves a layout carried whole a layout of its own when storage cannot be read', async () => {
    const storage = await storageWith(mine);
    storage.get = async () => {
      throw new Error('offline');
    };
    const o = await opened(inlineRef(await encodeInline(mine)), storage);
    expect(o.layout.name).toBe('Mine');
    expect(o.storedId).toBeNull();
  });

  it('says why one will not open', async () => {
    const storage = await storageWith();
    expect(await openLayout('saved:gone', storage)).toEqual({
      ok: false,
      error: 'layout gone not found',
    });
    expect(await openLayout('no such layout', storage)).toEqual({
      ok: false,
      error: 'layout no such layout not found',
    });
    expect((await openLayout('inline:garbage', storage)).ok).toBe(false);
    await storage.put('layouts', 'broken', { name: 'Broken' });
    expect(await openLayout('saved:broken', storage)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/^storage error: /),
    });
  });
});

describe('What a link carries', () => {
  it('carries a saved layout named by its id whole, its id inside, and anything else as it is', async () => {
    const storage = await storageWith(mine);
    for (const ref of ['saved:mine', 'mine']) {
      const carried = await carriedRef(ref, await opened(ref, storage));
      expect(carried).toMatch(/^inline:/);
      expect((await opened(carried, await storageWith())).layout).toMatchObject({
        id: 'mine',
        name: 'Mine',
      });
    }
    expect(await carriedRef('qwerty', await opened('qwerty', storage))).toBe('qwerty');
    const inline = inlineRef(await encodeInline(mine));
    expect(await carriedRef(inline, await opened(inline, storage))).toBe(inline);
  });
});
