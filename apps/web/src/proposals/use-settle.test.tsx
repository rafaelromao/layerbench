import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToasts } from '../state/toasts.js';
import { IndexedDbAdapter } from '../storage/indexeddb.js';
import { recordProposal } from './proposals.js';
import { useSettleProposals } from './use-settle.js';

const PULL = 'https://github.com/rafaelromao/layerbench/pull/100';
const PULL_API = 'https://api.github.com/repos/rafaelromao/layerbench/pulls/100';

let n = 0;

/** A browser holding a copy of Colemak, proposed to the Library under this pull request. */
async function holdingColemak() {
  const storage = new IndexedDbAdapter(`settle-${++n}`);
  await storage.put('layouts', 'colemak', { format: 'layerbench/layout@1', name: 'Colemak' });
  await recordProposal(storage, 'colemak', {
    name: 'Colemak',
    target: { kind: 'bundled', id: 'colemak' },
    url: PULL,
  });
  return storage;
}

/** What GitHub answers about the pull request, once `release` is called. */
function pullRequest(answer: object) {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const asked: string[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    asked.push(String(input));
    await held;
    return String(input) === PULL_API
      ? new Response(JSON.stringify(answer))
      : new Response('', { status: 404 });
  });
  return { release, asked };
}

const shown = () => useToasts.getState().toasts.map((t) => t.text);

beforeEach(() => useToasts.setState({ toasts: [] }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('settling the proposals when the Library opens', () => {
  it('tells what it settled, though storage was swapped while GitHub was asked', async () => {
    // Sign-in is answered while the pull request is still being read: the page gets its storage
    // again. The copy the first run deletes is gone either way, and its owner is owed the notice.
    const first = await holdingColemak();
    const second = new IndexedDbAdapter(`settle-${++n}`);
    const github = pullRequest({ state: 'closed', merged: true });
    const settled = vi.fn();
    const { rerender } = renderHook(({ storage }) => useSettleProposals(storage, true, settled), {
      initialProps: { storage: first as IndexedDbAdapter },
    });
    await waitFor(() => expect(github.asked).toHaveLength(1));
    rerender({ storage: second });
    act(() => github.release());
    await waitFor(async () => expect(await first.list('layouts')).toEqual([]));
    await waitFor(() =>
      expect(shown()).toEqual(['Your change to Colemak was accepted; your copy of it is gone']),
    );
  });
  it('waits for storage to be the one documents are kept in, and asks GitHub then', async () => {
    const storage = await holdingColemak();
    const github = pullRequest({ state: 'closed', merged: false });
    github.release();
    const { rerender } = renderHook(({ ready }) => useSettleProposals(storage, ready, vi.fn()), {
      initialProps: { ready: false },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(github.asked).toEqual([]);
    rerender({ ready: true });
    await waitFor(() =>
      expect(shown()).toEqual([
        'Your change to Colemak was declined; your copy stays in your layouts',
      ]),
    );
    expect(github.asked).toEqual([PULL_API]);
  });

  it('keeps the copy of a change the app that is open lacks, and names it for the Library', async () => {
    const MERGE = 'a'.repeat(40);
    const BUILD = 'b'.repeat(40);
    vi.stubEnv('VITE_BUILD_COMMIT', BUILD);
    const storage = await holdingColemak();
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === PULL_API) {
        return new Response(
          JSON.stringify({ state: 'closed', merged: true, merge_commit_sha: MERGE }),
        );
      }
      return url.includes(`/compare/${MERGE}...${BUILD}`)
        ? new Response(JSON.stringify({ status: 'behind' }))
        : new Response('', { status: 404 });
    });
    const { result } = renderHook(() => useSettleProposals(storage, true, vi.fn()));
    await waitFor(() => expect([...result.current]).toEqual(['colemak']));
    expect((await storage.list('layouts')).map((e) => e.id)).toEqual(['colemak']);
    expect((await storage.list('proposals')).map((e) => e.id)).toEqual(['colemak']);
    expect(shown()).toEqual([]);
  });

  it('refreshes the lists only when something was settled', async () => {
    const storage = await holdingColemak();
    const github = pullRequest({ state: 'open', merged: false });
    github.release();
    const settled = vi.fn();
    renderHook(() => useSettleProposals(storage, true, settled));
    await waitFor(() => expect(github.asked).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(settled).not.toHaveBeenCalled();
  });
});
