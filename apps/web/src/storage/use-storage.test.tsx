import type { IndexEntry, StorageAdapter } from '@layerbench/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useGitHubSession } from '../auth/github-session.js';
import { IndexedDbAdapter } from './indexeddb.js';
import { StorageProvider, useCollection } from './use-storage.js';

function entry(id: string, name: string): IndexEntry {
  return { id, name, updatedAt: '2026-10-01T00:00:00.000Z' };
}

/** An adapter that lists what it is given, or never answers when given nothing. */
function listing(entries?: IndexEntry[]): StorageAdapter {
  return {
    id: 'test',
    list: () => (entries ? Promise.resolve(entries) : new Promise(() => {})),
  } as unknown as StorageAdapter;
}

function render(adapter?: StorageAdapter) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StorageProvider adapter={adapter}>{children}</StorageProvider>
  );
  return renderHook(() => useCollection('layouts'), { wrapper });
}

const names = (entries: IndexEntry[]) => entries.map((e) => e.name);

afterEach(() => useGitHubSession.setState({ status: 'unknown' }));

describe('the saved index, as the last visit listed it', () => {
  it('lists what the last visit listed at once, before storage answers', async () => {
    const first = render(listing([entry('breeze', 'Breeze'), entry('gust', 'Gust')]));
    await waitFor(() => expect(names(first.result.current.entries)).toEqual(['Breeze', 'Gust']));
    first.unmount();

    const again = render(listing());
    expect(names(again.result.current.entries)).toEqual(['Breeze', 'Gust']);
  });

  it('adds what storage lists while sign-in is not known yet, and drops nothing until it is', async () => {
    // Last visit was signed in, and Breeze is only on GitHub.
    localStorage.setItem(
      'layerbench:index:layouts',
      JSON.stringify([entry('breeze', 'Breeze'), entry('gust', 'Gust')]),
    );
    const local = new IndexedDbAdapter();
    await local.put('layouts', 'gust', { id: 'gust', name: 'Gust' } as never);
    await local.put('layouts', 'mine', { id: 'mine', name: 'Mine' } as never);

    // The browser's own copy answers first: Mine is added, Breeze stays.
    const visit = render();
    await waitFor(() =>
      expect(names(visit.result.current.entries)).toEqual(['Breeze', 'Gust', 'Mine']),
    );

    // Once it is known nobody is signed in, the browser's copy is the whole list, and is kept.
    act(() => useGitHubSession.setState({ status: 'signed-out' }));
    await waitFor(() => expect(names(visit.result.current.entries)).toEqual(['Gust', 'Mine']));
    const kept = JSON.parse(localStorage.getItem('layerbench:index:layouts') ?? '[]');
    expect(names(kept)).toEqual(['Gust', 'Mine']);
  });

  it('ignores a kept index it cannot read', () => {
    localStorage.setItem('layerbench:index:layouts', JSON.stringify([{ id: 3 }, 'x']));
    expect(render(listing()).result.current.entries).toEqual([]);
    localStorage.setItem('layerbench:index:layouts', '{');
    expect(render(listing()).result.current.entries).toEqual([]);
  });
});
