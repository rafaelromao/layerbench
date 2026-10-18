import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { useGitHubSession } from '../auth/github-session.js';
import { useToasts } from '../state/toasts.js';
import { MemoryStorage } from '../test/memory-storage.js';
import { CompositeStorage } from './composite.js';
import { StorageSettings } from './StorageSettings.js';
import { StorageProvider } from './use-storage.js';

afterEach(() => useGitHubSession.setState({ status: 'unknown', login: null }));

describe('Storage', () => {
  it("copies this browser's documents up through the storage the app saves to", async () => {
    const user = userEvent.setup();
    const local = new MemoryStorage('local');
    const remote = new MemoryStorage('github');
    await local.put('layouts', 'mine', { name: 'Mine' });
    const storage = new CompositeStorage(local, remote);
    await storage.put('layouts', 'shared', { name: 'Shared' });
    useGitHubSession.setState({ status: 'signed-in', login: 'me' });
    render(
      <StorageProvider adapter={storage}>
        <StorageSettings />
      </StorageProvider>,
    );

    await user.click(screen.getByRole('button', { name: /^Storage/ }));
    await user.click(screen.getByRole('button', { name: "Copy this browser's documents up" }));

    await waitFor(() =>
      expect(useToasts.getState().toasts.map((t) => t.text)).toContain(
        'Copied 1 document to GitHub; 1 was already up to date',
      ),
    );
    expect((await remote.get('layouts', 'mine'))?.doc).toEqual({ name: 'Mine' });
  });

  it('cannot copy up where storage is this browser alone', async () => {
    const user = userEvent.setup();
    useGitHubSession.setState({ status: 'signed-in', login: 'me' });
    render(
      <StorageProvider adapter={new MemoryStorage()}>
        <StorageSettings />
      </StorageProvider>,
    );

    await user.click(screen.getByRole('button', { name: /^Storage/ }));
    expect(screen.getByRole('button', { name: "Copy this browser's documents up" })).toBeDisabled();
  });
});
