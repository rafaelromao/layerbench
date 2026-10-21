import { bundledLayout, type Layout, toCanonicalJson } from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import { setCommunitySource } from '../community/community.js';
import { branchWith, communityDoc } from '../test/community.js';
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
  it('opens a bundled layout as a layout of its own, saying it is the bundled one', async () => {
    const o = await opened('qwerty', await storageWith());
    expect(o.layout.name).toBe('Qwerty');
    expect(o.storedId).toBeNull();
    expect(o.source).toEqual({ kind: 'bundled', id: 'qwerty' });
  });

  it('opens a custom layout, by `custom:` or by its id alone, as that custom layout', async () => {
    const storage = await storageWith(mine);
    expect(await opened('custom:mine', storage)).toMatchObject({ storedId: 'mine', source: null });
    expect(await opened('mine', storage)).toMatchObject({ storedId: 'mine', source: null });
  });

  it('opens a layout carried whole as the custom one only where that is saved with the same contents', async () => {
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
    expect(await openLayout('custom:gone', storage)).toEqual({
      ok: false,
      error: 'layout gone is not saved here',
    });
    expect(await openLayout('no such layout', storage)).toEqual({
      ok: false,
      error: 'layout no such layout not found',
    });
    expect((await openLayout('inline:garbage', storage)).ok).toBe(false);
    await storage.put('layouts', 'broken', { name: 'Broken' });
    expect(await openLayout('custom:broken', storage)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/^layout broken cannot be read: /),
    });
  });
});

describe('Opening a community layout', () => {
  it('opens it as a layout of its own, which saving copies, and carries it as it is', async () => {
    setCommunitySource(branchWith(communityDoc('night-owl', 'Night owl')));
    const storage = await storageWith();
    const o = await opened('community:night-owl', storage);
    expect(o).toMatchObject({
      layout: { name: 'Night owl' },
      storedId: null,
      source: { kind: 'community', id: 'night-owl' },
    });
    expect(await carriedRef('community:night-owl', o)).toBe('community:night-owl');
    expect(await openLayout('community:lark', storage)).toEqual({
      ok: false,
      error: 'community layout lark not found',
    });
  });
});

describe('What a link carries', () => {
  it('carries a custom layout named by its id whole, its id inside, and anything else as it is', async () => {
    const storage = await storageWith(mine);
    for (const ref of ['custom:mine', 'mine']) {
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
