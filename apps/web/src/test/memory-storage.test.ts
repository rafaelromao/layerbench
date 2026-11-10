import { StorageConflictError } from '@layerbench/core';
import { describe, expect, it } from 'vitest';
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

  it('gives the same version to the same text, a document changed and changed back included', async () => {
    const store = new MemoryStorage();
    const a = await store.put('rulesets', 'r', { name: 'A' });
    await store.put('rulesets', 'r', { name: 'B' });
    const again = await store.put('rulesets', 'r', { name: 'A' });
    expect(again.sha).toBe(a.sha);
  });
});
