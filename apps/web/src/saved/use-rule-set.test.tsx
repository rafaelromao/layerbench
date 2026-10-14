import { getPreset, type StorageAdapter } from '@layerbench/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useGitHubSession } from '../auth/github-session.js';
import { IndexedDbAdapter } from '../storage/indexeddb.js';
import { StorageProvider } from '../storage/use-storage.js';
import { MemoryStorage } from '../test/memory-storage.js';
import { type RuleSetState, useRuleSet } from './use-rule-set.js';

/** Every state the hook gave, render by render, for the reference it was asked about. */
function track(ref: string, adapter?: StorageAdapter) {
  const seen: { asked: string; state: RuleSetState }[] = [];
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StorageProvider adapter={adapter}>{children}</StorageProvider>
  );
  const hook = renderHook(
    ({ asked }) => {
      const state = useRuleSet(asked);
      seen.push({ asked, state });
      return state;
    },
    { wrapper, initialProps: { asked: ref } },
  );
  return { ...hook, seen };
}

async function storageWith(...names: string[]): Promise<MemoryStorage> {
  const storage = new MemoryStorage();
  for (const name of names) {
    await storage.put('rulesets', name.toLowerCase(), { ...getPreset('keysolve'), name });
  }
  return storage;
}

afterEach(() => useGitHubSession.setState({ status: 'unknown' }));

describe('the rule set a reference names', () => {
  it('is a preset at once', () => {
    const { result } = track('cyanophage', new MemoryStorage());
    expect(result.current).toMatchObject({ status: 'read', ref: 'cyanophage' });
    expect(result.current.status === 'read' && result.current.ruleSet.name).toMatch(/cyanophage/i);
  });

  it('is read from storage when saved, and called by its id until then', async () => {
    const { result } = track('saved:strict', await storageWith('Strict'));
    expect(result.current).toEqual({ ref: 'saved:strict', name: 'strict', status: 'reading' });
    await waitFor(() => expect(result.current.status).toBe('read'));
    expect(result.current.name).toBe('Strict');
  });

  it('is never the one asked for before, not even for a render', async () => {
    const { result, rerender, seen } = track('saved:strict', await storageWith('Strict', 'Loose'));
    await waitFor(() => expect(result.current.status).toBe('read'));

    rerender({ asked: 'saved:loose' });
    await waitFor(() => expect(result.current.name).toBe('Loose'));
    rerender({ asked: 'keysolve' });
    const names: Record<string, string | undefined> = {
      'saved:strict': 'Strict',
      'saved:loose': 'Loose',
      keysolve: getPreset('keysolve').name,
    };
    for (const { asked, state } of seen) {
      expect(state.ref).toBe(asked);
      if (state.status === 'read') expect(state.ruleSet.name).toBe(names[asked]);
    }
  });

  it('says why a saved set will not open, and opens nothing in its place', async () => {
    const storage = await storageWith();
    await storage.put('rulesets', 'broken', { name: 'Broken' });

    const missing = track('saved:gone', storage);
    await waitFor(() => expect(missing.result.current.status).toBe('failed'));
    expect(missing.result.current).toMatchObject({
      name: 'gone',
      failure: { status: 'missing' },
      error: 'rule set gone is not saved here',
    });

    const broken = track('saved:broken', storage);
    await waitFor(() => expect(broken.result.current.status).toBe('failed'));
    expect(broken.result.current).toMatchObject({
      error: expect.stringMatching(/^rule set broken cannot be read: /),
    });
  });

  it('is not taken from the browser copy alone while sign-in is not known, as it may be behind', async () => {
    const id = `kept-${Date.now()}`;
    await new IndexedDbAdapter().put('rulesets', id, { ...getPreset('keysolve'), name: 'Kept' });
    const { result } = track(`saved:${id}`);
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(result.current.status).toBe('reading');

    act(() => useGitHubSession.setState({ status: 'signed-out' }));
    await waitFor(() => expect(result.current.status).toBe('read'));
    expect(result.current.name).toBe('Kept');
  });

  it('is still being read while sign-in is not known, as it may be on GitHub', async () => {
    // No adapter of the test's own: the browser's copy, until it is known nobody is signed in.
    const { result } = track(`saved:gone-${Date.now()}`);
    await new IndexedDbAdapter().list('rulesets');
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(result.current.status).toBe('reading');

    act(() => useGitHubSession.setState({ status: 'signed-out' }));
    await waitFor(() => expect(result.current.status).toBe('failed'));
  });

  it('is the same set when read again from storage swapped in on sign-in', async () => {
    let adapter: StorageAdapter = await storageWith('Strict');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StorageProvider adapter={adapter}>{children}</StorageProvider>
    );
    const { result, rerender } = renderHook(() => useRuleSet('saved:strict'), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('read'));
    const first = result.current.status === 'read' ? result.current.ruleSet : null;

    let read = 0;
    const swapped = await storageWith('Strict');
    const get = swapped.get.bind(swapped);
    swapped.get = async (c, id) => {
      read++;
      return get(c, id);
    };
    adapter = swapped;
    rerender();
    await waitFor(() => expect(read).toBe(1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(result.current.status === 'read' && result.current.ruleSet).toBe(first);
  });
});
