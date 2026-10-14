import { bundledLayout, getPreset, toCanonicalJson } from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../test/memory-storage.js';
import { readSaved, savedError } from './read.js';

const qwerty = bundledLayout('qwerty');
if (!qwerty) throw new Error('qwerty is bundled');

describe('reading a saved document', () => {
  it('reads each collection as what it holds', async () => {
    const storage = new MemoryStorage();
    await storage.put('layouts', 'mine', toCanonicalJson({ ...qwerty, name: 'Mine' }));
    await storage.put('rulesets', 'strict', { ...getPreset('keysolve'), name: 'Strict' });
    await storage.put('corpora', 'notes', { name: 'Notes', sample: 'the fox' });

    const layout = await readSaved(storage, 'layouts', 'mine');
    expect(layout.status === 'read' && layout.doc.name).toBe('Mine');
    const ruleSet = await readSaved(storage, 'rulesets', 'strict');
    expect(ruleSet.status === 'read' && ruleSet.doc.rules.length).toBeGreaterThan(0);
    const text = await readSaved(storage, 'corpora', 'notes');
    expect(text).toEqual({ status: 'read', doc: { name: 'Notes', sample: 'the fox' } });
  });

  it('says a document storage does not hold is missing', async () => {
    expect(await readSaved(new MemoryStorage(), 'rulesets', 'gone')).toEqual({ status: 'missing' });
  });

  it('says a document is unreadable when storage fails, or it is not one of its collection', async () => {
    const storage = new MemoryStorage();
    await storage.put('rulesets', 'broken', { name: 'Broken' });
    expect(await readSaved(storage, 'rulesets', 'broken')).toMatchObject({ status: 'unreadable' });

    storage.get = async () => {
      throw new Error('offline');
    };
    expect(await readSaved(storage, 'layouts', 'mine')).toEqual({
      status: 'unreadable',
      why: 'offline',
    });
  });

  it('tells why in the same words for every collection', () => {
    expect(savedError('layouts', 'mine', { status: 'missing' })).toBe(
      'layout mine is not saved here',
    );
    expect(savedError('rulesets', 'mine', { status: 'missing' })).toBe(
      'rule set mine is not saved here',
    );
    expect(savedError('corpora', 'notes', { status: 'unreadable', why: 'offline' })).toBe(
      'text notes cannot be read: offline',
    );
  });
});
