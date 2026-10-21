import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '../storage/indexeddb.js';
import {
  type Proposal,
  pullApi,
  readProposal,
  recordProposal,
  settleProposals,
} from './proposals.js';

let n = 0;
const freshStorage = () => new IndexedDbAdapter(`proposals-${++n}`);

const COLEMAK: Proposal = {
  name: 'Colemak',
  target: { kind: 'bundled', id: 'colemak' },
  url: 'https://github.com/rafaelromao/layerbench/pull/100',
};

describe('a proposed change, as the browser keeps it', () => {
  it('reads back what was recorded, under the custom layout that holds it', async () => {
    const storage = freshStorage();
    await recordProposal(storage, 'colemak', COLEMAK);
    const stored = await storage.get('proposals', 'colemak');
    expect(readProposal(stored?.doc)).toEqual(COLEMAK);
  });

  it('reads nothing that is not a proposal on github.com', () => {
    expect(readProposal({ ...COLEMAK, url: 'https://example.com/pull/1' })).toBeNull();
    expect(readProposal({ ...COLEMAK, target: { kind: 'custom', id: 'colemak' } })).toBeNull();
    expect(readProposal({ name: 'Colemak' })).toBeNull();
  });

  it("finds its pull request's address in GitHub's API", () => {
    expect(pullApi(COLEMAK.url)).toBe(
      'https://api.github.com/repos/rafaelromao/layerbench/pulls/100',
    );
    expect(pullApi('https://github.com/someone/else/pull/1')).toBeNull();
  });
});

describe('settling the proposals whose pull requests are done', () => {
  async function withTwo() {
    const storage = freshStorage();
    for (const id of ['colemak', 'breeze']) {
      await storage.put('layouts', id, { format: 'layerbench/layout@1', name: id });
    }
    await recordProposal(storage, 'colemak', COLEMAK);
    await recordProposal(storage, 'breeze', {
      name: 'Breeze',
      target: { kind: 'community', id: 'breeze' },
      url: 'https://github.com/rafaelromao/layerbench/pull/101',
    });
    return storage;
  }

  it('removes a merged one with its copy, and leaves a closed one an ordinary custom layout', async () => {
    const storage = await withTwo();
    const outcome = await settleProposals(storage, async (url) =>
      url.endsWith('/100') ? 'merged' : 'closed',
    );
    expect(outcome).toEqual({ accepted: ['Colemak'], declined: ['Breeze'] });
    expect((await storage.list('layouts')).map((e) => e.id)).toEqual(['breeze']);
    expect(await storage.list('proposals')).toEqual([]);
  });

  it('leaves one whose pull request is open, or cannot be read, as it is', async () => {
    const storage = await withTwo();
    const outcome = await settleProposals(storage, async (url) =>
      url.endsWith('/100') ? 'open' : 'unknown',
    );
    expect(outcome).toEqual({ accepted: [], declined: [] });
    expect(await storage.list('proposals')).toHaveLength(2);
  });
});
