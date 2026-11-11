import { StorageConflictError } from '@layerbench/core';
import { describe, expect, it, vi } from 'vitest';
import { sha1Hex } from '../storage/indexeddb.js';
import { MemoryStorage } from './memory-storage.js';

describe('the store the tests use', () => {
  it("lets one of two writes of the same version win, as a store's transaction does", async () => {
    const store = new MemoryStorage();
    const v1 = await store.put('rulesets', 'r', { name: 'v1' });
    const results = await Promise.allSettled([
      store.put('rulesets', 'r', { name: 'a' }, { expectedSha: v1.sha }),
      store.put('rulesets', 'r', { name: 'b' }, { expectedSha: v1.sha }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected');
    expect(lost && 'reason' in lost && lost.reason).toBeInstanceOf(StorageConflictError);
  });

  it('deletes only the version it is told to, if it is told one', async () => {
    const store = new MemoryStorage();
    const v1 = await store.put('rulesets', 'r', { name: 'v1' });
    await store.put('rulesets', 'r', { name: 'v2' });
    await expect(store.delete('rulesets', 'r', { expectedSha: v1.sha })).rejects.toBeInstanceOf(
      StorageConflictError,
    );
    expect(await store.get('rulesets', 'r')).not.toBeNull();
    await store.delete('rulesets', 'gone', { expectedSha: v1.sha });
  });

  it("gives the version the browser's store and a gist give: the SHA-1 of the document's text", async () => {
    const doc = { name: 'Same', description: 'text — with a dash' };
    expect((await new MemoryStorage().put('rulesets', 'r', doc)).sha).toBe(
      await sha1Hex(JSON.stringify(doc)),
    );
  });

  it('is written without waiting on real time, so a test on fake timers is never left behind', async () => {
    vi.useFakeTimers();
    try {
      const store = new MemoryStorage();
      let written = false;
      const writing = store.put('layouts', 'x', { name: 'X' }).then(() => {
        written = true;
      });
      // Nothing but microtasks: one pass of the clock is enough, however slow the machine.
      await vi.advanceTimersByTimeAsync(0);
      expect(written).toBe(true);
      await writing;
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives the same version to the same text, a document changed and changed back included', async () => {
    const store = new MemoryStorage();
    const a = await store.put('rulesets', 'r', { name: 'A' });
    await store.put('rulesets', 'r', { name: 'B' });
    const again = await store.put('rulesets', 'r', { name: 'A' });
    expect(again.sha).toBe(a.sha);
  });
});
