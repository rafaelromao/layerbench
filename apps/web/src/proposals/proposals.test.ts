import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '../storage/indexeddb.js';
import {
  followProposal,
  forgetProposal,
  type Proposal,
  proposalOf,
  pullApi,
  readProposal,
  recordProposal,
  settleProposals,
} from './proposals.js';

let n = 0;
const freshStorage = () => new IndexedDbAdapter(`proposals-${++n}`);

const COLEMAK = {
  name: 'Colemak',
  target: { kind: 'bundled', id: 'colemak' },
  url: 'https://github.com/rafaelromao/layerbench/pull/100',
} satisfies Proposal;

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
    // One saved but not sent yet has no pull request.
    expect(readProposal({ ...COLEMAK, url: null })).toEqual({ ...COLEMAK, url: null });
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

  it('forgets one whose copy was deleted, and leaves one not sent yet', async () => {
    const storage = await withTwo();
    await storage.delete('layouts', 'colemak');
    await recordProposal(storage, 'breeze', { ...COLEMAK, name: 'Breeze', url: null });
    const read: string[] = [];
    const outcome = await settleProposals(storage, async (url) => {
      read.push(url);
      return 'merged';
    });
    expect(outcome).toEqual({ accepted: [], declined: [] });
    expect(read).toEqual([]);
    expect((await storage.list('proposals')).map((e) => e.id)).toEqual(['breeze']);
    expect(await forgetProposal(storage, 'breeze')).toBe(true);
    expect(await forgetProposal(storage, 'breeze')).toBe(false);
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

describe('saving the copy of a proposal again', () => {
  const NEW = 'https://github.com/rafaelromao/layerbench/pull/102';

  async function withColemak() {
    const storage = freshStorage();
    await recordProposal(storage, 'colemak', COLEMAK);
    const sent: Proposal[] = [];
    const send = async (proposal: Proposal) => {
      sent.push(proposal);
      return { kind: 'sent' as const, url: proposal.url ?? COLEMAK.url, reused: true };
    };
    return { storage, sent, send };
  }

  it('sends it again while its pull request is open, or cannot be read', async () => {
    for (const now of ['open', 'unknown'] as const) {
      const { storage, sent, send } = await withColemak();
      const followed = await followProposal(storage, 'colemak', 'colemak', send, async () => now);
      expect(followed).toMatchObject({ kind: 'sent', proposal: COLEMAK });
      expect(sent).toEqual([COLEMAK]);
      expect(await proposalOf(storage, 'colemak')).toEqual(COLEMAK);
    }
  });

  it('keeps the pull request GitHub answers with, and moves to where the copy went', async () => {
    const { storage } = await withColemak();
    const renewed = async () => ({ kind: 'sent' as const, url: NEW, reused: false });
    await followProposal(storage, 'colemak', 'my-colemak', renewed, async () => 'open');
    expect(await proposalOf(storage, 'colemak')).toBeNull();
    expect(await proposalOf(storage, 'my-colemak')).toEqual({ ...COLEMAK, url: NEW });
  });

  it('is settled instead, sending nothing, once its pull request is merged or closed', async () => {
    for (const now of ['merged', 'closed'] as const) {
      const { storage, sent, send } = await withColemak();
      await storage.put('layouts', 'colemak', { format: 'layerbench/layout@1', name: 'Colemak' });
      const followed = await followProposal(storage, 'colemak', 'colemak', send, async () => now);
      expect(followed).toEqual({ kind: 'done', proposal: COLEMAK, state: now });
      expect(sent).toEqual([]);
      expect(await storage.list('proposals')).toEqual([]);
      // The copy was just saved: it stays, an ordinary custom layout.
      expect((await storage.list('layouts')).map((e) => e.id)).toEqual(['colemak']);
    }
  });

  it('sends one not sent yet, reading no pull request, and keeps the one it opens', async () => {
    const { storage, sent } = await withColemak();
    await recordProposal(storage, 'colemak', { ...COLEMAK, url: null });
    const opened = async (proposal: Proposal) => {
      sent.push(proposal);
      return { kind: 'sent' as const, url: NEW, reused: false };
    };
    const state = async () => {
      throw new Error('no pull request to read');
    };
    await followProposal(storage, 'colemak', 'colemak', opened, state);
    expect(sent).toHaveLength(1);
    expect(await proposalOf(storage, 'colemak')).toEqual({ ...COLEMAK, url: NEW });
  });

  it('is nothing for a custom layout that is not a proposal', async () => {
    const { storage, send } = await withColemak();
    expect(await followProposal(storage, 'breeze', 'breeze', send)).toEqual({ kind: 'none' });
  });
});
