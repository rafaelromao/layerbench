import { cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordProposal } from '../proposals/proposals.js';
import { bar, freshStorage, PULL, seed } from '../test/analyze-editing.js';
import { renderRoute } from '../test/render.js';

const PULL_API = 'https://api.github.com/repos/rafaelromao/layerbench/pulls/100';

/** What GitHub answers about the pull request: its state, or nothing at all; and each time asked. */
function pullIs(state: 'open' | 'merged' | 'closed' | 'unreachable') {
  const asked = vi.fn();
  const real = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== PULL_API) return real(input, init);
    asked();
    if (state === 'unreachable') throw new TypeError('offline');
    return new Response(
      JSON.stringify({ state: state === 'open' ? 'open' : 'closed', merged: state === 'merged' }),
    );
  });
  return asked;
}

/** Analyze on the custom layout `Plain`, a copy of Qwerty, with `proposal` kept beside it. */
async function openPlain(proposal: { url: string | null } | null) {
  const storage = freshStorage();
  await seed(storage, 'qwerty', 'plain', { name: 'Plain' });
  if (proposal) {
    await recordProposal(storage, 'plain', {
      name: 'Plain',
      target: { kind: 'bundled', id: 'qwerty' },
      url: proposal.url,
    });
  }
  renderRoute('/analyze?layout=custom%3Aplain&corpus=en-general&sample=1000', { storage });
  await waitFor(() => expect(within(bar()).getByLabelText('Name')).toHaveValue('Plain'));
  return storage;
}

const tag = () => within(bar()).queryByRole('link', { name: 'proposed' });

describe('the tag of a proposed change, on Analyze', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is beside the name of a custom layout a change was proposed from, linked to its pull request', async () => {
    pullIs('open');
    await openPlain({ url: PULL });
    const badge = await within(bar()).findByRole('link', { name: 'proposed' });
    expect(badge).toHaveAttribute('href', PULL);
    expect(badge).toHaveAttribute('title', 'A change proposed to the Library: its pull request');
  });

  it('is not on a custom layout no change was proposed from, nor on one not sent yet', async () => {
    pullIs('open');
    const user = userEvent.setup();
    await openPlain(null);
    expect(tag()).toBeNull();
    cleanup();
    await openPlain({ url: null });
    expect(tag()).toBeNull();
    // Nor on a bundled layout.
    await user.selectOptions(within(bar()).getByRole('combobox', { name: 'Layout' }), 'colemak');
    await waitFor(() => expect(within(bar()).getByLabelText('Name')).toHaveValue('Colemak'));
    expect(tag()).toBeNull();
  });

  it('goes when the layout in hand is another one', async () => {
    pullIs('open');
    const user = userEvent.setup();
    await openPlain({ url: PULL });
    await within(bar()).findByRole('link', { name: 'proposed' });
    await user.selectOptions(within(bar()).getByRole('combobox', { name: 'Layout' }), 'colemak');
    await waitFor(() => expect(within(bar()).getByLabelText('Name')).toHaveValue('Colemak'));
    expect(tag()).toBeNull();
  });

  it('stays while GitHub cannot say what the pull request is', async () => {
    pullIs('unreachable');
    await openPlain({ url: PULL });
    expect(await within(bar()).findByRole('link', { name: 'proposed' })).toHaveAttribute(
      'href',
      PULL,
    );
  });

  it.each(['merged', 'closed'] as const)(
    'is not shown once the pull request is %s, and nothing is settled by looking',
    async (state) => {
      const asked = pullIs(state);
      const storage = await openPlain({ url: PULL });
      // The tag waits for the answer, a moment after it is asked for. Looking settles nothing: the
      // Library does, and deletes a merged one's copy.
      await waitFor(() => expect(asked).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(tag()).toBeNull();
      expect((await storage.list('layouts')).map((e) => e.id)).toEqual(['plain']);
      expect((await storage.list('proposals')).map((e) => e.id)).toEqual(['plain']);
    },
  );
});
