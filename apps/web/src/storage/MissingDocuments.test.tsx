import type { Collection, StorageAdapter } from '@layerbench/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGitHubSession } from '../auth/github-session.js';
import { useToasts } from '../state/toasts.js';
import { MemoryStorage } from '../test/memory-storage.js';
import { startAutoSync, useSync } from './auto-sync.js';
import { CompositeStorage } from './composite.js';
import { SyncNote } from './SyncNote.js';
import { unsynced } from './unsynced.js';
import { StorageProvider } from './use-storage.js';

/** Looking at every document, as it is when the account is signed in and none has been looked at. */
const TIMING = { settleMs: 20, retryMs: [50], attemptMs: 5_000, auditEveryMs: 0 };

const texts = () => useToasts.getState().toasts.map((t) => t.text);

let stop: (() => void) | null = null;

afterEach(() => {
  stop?.();
  stop = null;
  useSync.setState({ missing: null });
  useGitHubSession.setState({ status: 'unknown', login: null, problem: null });
});

/** The gists' every request, to say none was made. */
function watched(remote: StorageAdapter) {
  return (['list', 'get', 'put', 'delete'] as const).map((m) => vi.spyOn(remote, m));
}

/**
 * A browser holding `documents`, which the account does not have, signed in as it looks at them
 * and finds that out, with the status shown.
 */
async function shown(documents: [Collection, string, string][]) {
  const local = new MemoryStorage('local');
  const remote = new MemoryStorage('github');
  for (const [collection, id, name] of documents) await local.put(collection, id, { name });
  const storage = new CompositeStorage(local, remote);
  useGitHubSession.setState({ status: 'signed-in', login: 'me' });
  render(
    <StorageProvider adapter={storage}>
      <SyncNote />
    </StorageProvider>,
  );
  stop = startAutoSync(storage, unsynced, TIMING, 'me');
  await waitFor(() => expect(useSync.getState().missing).toHaveLength(documents.length));
  return { local, remote, storage };
}

const list = () =>
  screen.getByRole('list', {
    name: 'Documents saved in this browser that are not in your GitHub account',
  });

describe('the status that says the account lacks documents', () => {
  it('names a document, and what kind it is, with the choices on its own row', async () => {
    await shown([['layouts', 'my-layout', 'My layout']]);
    const row = within(list()).getByRole('listitem');
    expect(row).toHaveTextContent('My layout · layout');
    expect(screen.getByRole('status')).toHaveTextContent(
      '1 document saved in this browser is not in your GitHub account',
    );
    expect(
      within(row).getByRole('button', { name: 'Send My layout to your GitHub account' }),
    ).toBeVisible();
    expect(
      within(row).getByRole('button', { name: 'Delete My layout from this browser' }),
    ).toBeVisible();
    // The one button for the lot stays.
    expect(screen.getByRole('button', { name: 'Send them' })).toBeVisible();
  });

  it('names several, each with its own buttons, named for it', async () => {
    await shown([
      ['layouts', 'alpha', 'Alpha'],
      ['rulesets', 'beta', 'Beta'],
      ['corpora', 'gamma', 'Gamma'],
    ]);
    const rows = within(list()).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent?.split('·')[0].trim())).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ]);
    expect(rows[1]).toHaveTextContent('Beta · rule set');
    expect(rows[2]).toHaveTextContent('Gamma · text');
    for (const name of ['Alpha', 'Beta', 'Gamma']) {
      expect(
        screen.getByRole('button', { name: `Delete ${name} from this browser` }),
      ).toBeInTheDocument();
    }
  });

  it('lists many in a list that scrolls, leaving none out', async () => {
    const many = Array.from({ length: 12 }, (_, i): [Collection, string, string] => [
      'layouts',
      `layout-${String(i).padStart(2, '0')}`,
      `Layout ${String(i).padStart(2, '0')}`,
    ]);
    await shown(many);
    expect(within(list()).getAllByRole('listitem')).toHaveLength(12);
    expect(list()).toHaveClass('overflow-y-auto', 'max-h-36', 'sm:max-h-44');
  });

  it('says which it held once, and says nothing of a reason it cannot know', async () => {
    const local = new MemoryStorage('local');
    const remote = new MemoryStorage('github');
    await local.put('layouts', 'deleted-there', { name: 'Deleted there' });
    await local.put('layouts', 'never-sent', { name: 'Never sent' });
    const storage = new CompositeStorage(local, remote);
    // The account had it once: the version both held is on record.
    unsynced.setBase('layouts', 'deleted-there', 'a-version');
    useGitHubSession.setState({ status: 'signed-in', login: 'me' });
    render(
      <StorageProvider adapter={storage}>
        <SyncNote />
      </StorageProvider>,
    );
    stop = startAutoSync(storage, unsynced, TIMING, 'me');
    await waitFor(() => expect(useSync.getState().missing).toHaveLength(2));
    const [first, second] = within(list()).getAllByRole('listitem');
    expect(first).toHaveTextContent('Deleted there · layout, was in your account once');
    expect(second).toHaveTextContent(/^Never sent · layout(?!,)/);
  });

  it('asks before deleting, and keeping changes nothing', async () => {
    const user = userEvent.setup();
    const { local } = await shown([['layouts', 'mine', 'Mine']]);
    await user.click(screen.getByRole('button', { name: 'Delete Mine from this browser' }));

    const row = within(list()).getByRole('listitem');
    expect(row).toHaveTextContent(
      'Delete Mine from this browser? It is not in your GitHub account, so it will be gone for good.',
    );
    // Nothing has gone, and focus is on the choice that deletes nothing.
    expect(await local.get('layouts', 'mine')).not.toBeNull();
    const keep = screen.getByRole('button', { name: 'Keep Mine' });
    expect(keep).toHaveFocus();

    await user.click(keep);
    expect(await local.get('layouts', 'mine')).not.toBeNull();
    expect(within(list()).getByRole('listitem')).toHaveTextContent('Mine · layout');
    expect(screen.queryByRole('button', { name: 'Delete Mine for good' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete Mine from this browser' })).toHaveFocus();
    expect(useSync.getState().missing).toHaveLength(1);
  });

  it('deletes from this browser alone once confirmed, and the account is never asked', async () => {
    const user = userEvent.setup();
    const { local, remote } = await shown([
      ['layouts', 'one', 'One'],
      ['layouts', 'two', 'Two'],
    ]);
    // Requests made while looking are not the delete's.
    const calls = watched(remote);
    await user.click(screen.getByRole('button', { name: 'Delete One from this browser' }));
    await user.click(screen.getByRole('button', { name: 'Delete One for good' }));

    await waitFor(() => expect(texts()).toContain('Deleted One from this browser'));
    expect(await local.get('layouts', 'one')).toBeNull();
    expect(await local.get('layouts', 'two')).not.toBeNull();
    for (const call of calls) expect(call).not.toHaveBeenCalled();
    // The other is still listed, and the mark and base of the one deleted are gone.
    expect(within(list()).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list()).getByRole('listitem')).toHaveTextContent('Two');
    expect(unsynced.has('layouts', 'one')).toBe(false);
    expect(unsynced.base('layouts', 'one')).toBeNull();
    expect(unsynced.audit()?.missing?.map((d) => d.id)).toEqual(['two']);
  });

  it('leaves a document the account holds under the same id where it is', async () => {
    const user = userEvent.setup();
    const { local, remote } = await shown([['layouts', 'same-id', 'Here']]);
    // Another browser sent one under that id since the look.
    await remote.put('layouts', 'same-id', { name: 'There' });
    await user.click(screen.getByRole('button', { name: 'Delete Here from this browser' }));
    await user.click(screen.getByRole('button', { name: 'Delete Here for good' }));

    await waitFor(() => expect(texts()).toContain('Deleted Here from this browser'));
    expect(await local.get('layouts', 'same-id')).toBeNull();
    expect((await remote.get('layouts', 'same-id'))?.doc).toEqual({ name: 'There' });
  });

  it('goes with the last document deleted', async () => {
    const user = userEvent.setup();
    await shown([['layouts', 'only', 'Only']]);
    await user.click(screen.getByRole('button', { name: 'Delete Only from this browser' }));
    await user.click(screen.getByRole('button', { name: 'Delete Only for good' }));

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.queryByRole('list')).toBeNull();
    expect(useSync.getState().missing).toEqual([]);
    expect(unsynced.audit()?.lacking).toBe(0);
  });

  it('says so, and deletes nothing, when the document was saved since it was listed', async () => {
    const user = userEvent.setup();
    const { local, storage } = await shown([['layouts', 'mine', 'Mine']]);
    // What storage answers when a save marked it between the confirmation and the delete.
    vi.spyOn(storage, 'deleteHere').mockResolvedValueOnce(null);
    await user.click(screen.getByRole('button', { name: 'Delete Mine from this browser' }));
    await user.click(screen.getByRole('button', { name: 'Delete Mine for good' }));

    await waitFor(() =>
      expect(texts()).toContain(
        'Mine was saved again since you were shown it, so it was not deleted.',
      ),
    );
    expect(await local.get('layouts', 'mine')).not.toBeNull();
  });

  it('takes a document off the list once it is saved again, as it is then sent by itself', async () => {
    await shown([
      ['layouts', 'mine', 'Mine'],
      ['layouts', 'other', 'Other'],
    ]);
    unsynced.mark('layouts', 'mine');
    await waitFor(() => expect(within(list()).getAllByRole('listitem')).toHaveLength(1));
    expect(within(list()).getByRole('listitem')).toHaveTextContent('Other');
  });

  it('sends one document on its row, and the rest stay listed', async () => {
    const user = userEvent.setup();
    const { local, remote } = await shown([
      ['layouts', 'one', 'One'],
      ['layouts', 'two', 'Two'],
    ]);
    await user.click(screen.getByRole('button', { name: 'Send One to your GitHub account' }));

    await waitFor(async () => expect(await remote.get('layouts', 'one')).not.toBeNull());
    expect(await remote.get('layouts', 'two')).toBeNull();
    await waitFor(() => expect(within(list()).getAllByRole('listitem')).toHaveLength(1));
    expect(within(list()).getByRole('listitem')).toHaveTextContent('Two');
    expect(await local.get('layouts', 'one')).not.toBeNull();
  });

  it('still sends all of them with Send them', async () => {
    const user = userEvent.setup();
    const { remote } = await shown([
      ['layouts', 'one', 'One'],
      ['rulesets', 'two', 'Two'],
    ]);
    await user.click(screen.getByRole('button', { name: 'Send them' }));

    await waitFor(async () => {
      expect(await remote.get('layouts', 'one')).not.toBeNull();
      expect(await remote.get('rulesets', 'two')).not.toBeNull();
    });
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });
});
