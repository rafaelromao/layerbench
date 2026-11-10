import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initGitHubSession, useGitHubSession } from '../auth/github-session.js';
import { MemoryStorage } from '../test/memory-storage.js';
import { useSync } from './auto-sync.js';
import { CompositeStorage } from './composite.js';
import { StorageSettings } from './StorageSettings.js';
import { SyncNote } from './SyncNote.js';
import { type SyncInput, summarize } from './sync-status.js';
import { unsynced } from './unsynced.js';
import { StorageProvider } from './use-storage.js';

const BASE: SyncInput = {
  status: 'signed-out',
  login: null,
  problem: null,
  pending: 0,
  phase: 'idle',
  error: null,
  taken: 0,
  conflicts: 0,
  held: null,
  offline: false,
  scheduled: false,
};

describe('what the status says', () => {
  it('says nothing of a browser that is where the work is kept, with no sign-in to offer', () => {
    for (const status of ['unavailable', 'signed-out'] as const) {
      expect(summarize({ ...BASE, status })).toMatchObject({ kind: 'plain', notable: false });
    }
  });

  it('is asking while sign-in is not known', () => {
    expect(summarize({ ...BASE, status: 'unknown' })).toMatchObject({
      kind: 'checking',
      notable: false,
    });
  });

  it('says a save is in this browser only, and offers to sign in', () => {
    expect(summarize({ ...BASE, pending: 1 })).toEqual({
      kind: 'here-only',
      text: 'Saved in this browser only. Sign in with GitHub to sync it.',
      label: ' · unsynced',
      action: 'sign-in',
      notable: true,
    });
    expect(summarize({ ...BASE, pending: 3 }).text).toBe(
      '3 documents are saved in this browser only. Sign in with GitHub to sync them.',
    );
  });

  it('says a sign-in ended, and what waits, whether or not anything does', () => {
    expect(summarize({ ...BASE, problem: 'ended' })).toMatchObject({
      kind: 'ended',
      action: 'sign-in',
      notable: true,
      text: 'Your GitHub sign-in ended, so nothing is syncing. Sign in again to keep your layouts in your account.',
    });
    expect(summarize({ ...BASE, problem: 'ended', pending: 2 }).text).toMatch(
      /2 saved here wait to be sent\.$/,
    );
  });

  it('says the sign-in server did not answer, and offers to ask again', () => {
    expect(summarize({ ...BASE, problem: 'unreachable', pending: 1 })).toMatchObject({
      kind: 'unreachable',
      action: 'retry-sign-in',
      notable: true,
      text: "GitHub sign-in did not answer, so only this browser's copies are shown and nothing is syncing. 1 saved here waits to be sent.",
    });
  });

  it('is synced when signed in with nothing waiting, and is syncing while it sends', () => {
    const signedIn = { ...BASE, status: 'signed-in', login: 'you' } as const;
    expect(summarize(signedIn)).toMatchObject({ kind: 'synced', label: ' ✓', notable: false });
    expect(summarize({ ...signedIn, phase: 'syncing' })).toMatchObject({
      kind: 'syncing',
      notable: false,
    });
    expect(summarize({ ...signedIn, pending: 1, scheduled: true })).toMatchObject({
      kind: 'syncing',
    });
  });

  it('says why a send failed, and that it tries again', () => {
    const summary = summarize({
      ...BASE,
      status: 'signed-in',
      login: 'you',
      phase: 'failed',
      error: 'GitHub responded 503',
      pending: 1,
    });
    expect(summary).toMatchObject({ kind: 'failed', action: 'retry-sync', notable: true });
    expect(summary.text).toBe(
      'Saved in this browser, but not sent to your GitHub account: GitHub responded 503. It tries again by itself.',
    );
  });

  it('says which layouts stay for their names', () => {
    const summary = summarize({
      ...BASE,
      status: 'signed-in',
      login: 'you',
      pending: 2,
      taken: 2,
    });
    expect(summary.kind).toBe('attention');
    expect(summary.text).toMatch(/^2 layouts stay in this browser only/);
    expect(summary.notable).toBe(true);
  });

  it('says documents changed here and in the account wait for a choice, and offers it', () => {
    const summary = summarize({
      ...BASE,
      status: 'signed-in',
      login: 'you',
      pending: 2,
      conflicts: 2,
    });
    expect(summary).toMatchObject({ kind: 'conflict', action: 'review', notable: true });
    expect(summary.text).toBe(
      '2 documents were changed in this browser and in your GitHub account. Nothing is replaced until you choose which version to keep.',
    );
    expect(summary.label).toBe(' · conflict');
  });

  it('says what is held back for another account, and offers to send it', () => {
    const summary = summarize({
      ...BASE,
      status: 'signed-in',
      login: 'you',
      pending: 1,
      held: 'someone-else',
    });
    expect(summary).toMatchObject({ kind: 'held', action: 'send-held', notable: true });
    expect(summary.text).toContain('@someone-else');
    expect(summary.text).toContain('@you');
  });

  it('says documents not sent that nothing is about to send are waiting, rather than sending', () => {
    const summary = summarize({ ...BASE, status: 'signed-in', login: 'you', pending: 2 });
    expect(summary).toMatchObject({ kind: 'waiting', action: 'retry-sync', notable: true });
    expect(summary.text).toBe(
      '2 documents saved in this browser have not been sent to your GitHub account yet.',
    );
  });

  it('says it when there is no connection, with what waits', () => {
    const signedIn = { ...BASE, status: 'signed-in', login: 'you', offline: true } as const;
    expect(summarize(signedIn)).toMatchObject({
      kind: 'offline',
      label: ' · offline',
      notable: true,
    });
    expect(summarize({ ...signedIn, pending: 1 }).text).toBe(
      'You are offline. 1 saved here waits to be sent. They are sent when you are back online.',
    );
  });

  it('does not say a send failed when nothing is waiting to be sent', () => {
    expect(
      summarize({ ...BASE, status: 'signed-in', login: 'you', phase: 'failed', error: 'x' }),
    ).toMatchObject({ kind: 'synced' });
  });

  it('is still syncing while documents other than the ones left for names are waiting', () => {
    expect(
      summarize({
        ...BASE,
        status: 'signed-in',
        login: 'you',
        pending: 3,
        taken: 1,
        scheduled: true,
      }),
    ).toMatchObject({ kind: 'syncing' });
  });
});

beforeEach(() => {
  useGitHubSession.setState({ status: 'signed-out', login: null, problem: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  useSync.setState({ phase: 'idle', error: null, last: null });
  useGitHubSession.setState({ status: 'unknown', login: null, problem: null });
});

describe('the note where the user works', () => {
  it('is not there while all is well', () => {
    render(<SyncNote />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('stays for as long as a save is in this browser only, and offers to sign in', async () => {
    unsynced.mark('layouts', 'magic-gust');
    render(<SyncNote />);
    const note = await screen.findByRole('status');
    expect(note).toHaveTextContent('Saved in this browser only. Sign in with GitHub to sync it.');
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeInTheDocument();

    act(() => unsynced.clear('layouts', 'magic-gust'));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('says the sign-in server did not answer, instead of leaving the page asking, and asks again', async () => {
    const user = userEvent.setup();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.setItem('layerbench:github-session', 'sealed-1');
    vi.stubGlobal('fetch', () => new Promise<Response>(() => {}));
    useGitHubSession.setState({ status: 'unknown' });
    render(<SyncNote />);

    const asking = initGitHubSession();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    await asking;
    expect(await screen.findByRole('status')).toHaveTextContent('GitHub sign-in did not answer');

    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          JSON.stringify({
            available: true,
            clientId: 'c',
            signedIn: true,
            login: 'you',
            token: 'ghu_one',
            expiresAt: Date.now() + 8 * 3600_000,
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(useGitHubSession.getState().status).toBe('signed-in');
  });

  it('says the sign-in ended, in a browser that was signed in', async () => {
    useGitHubSession.setState({ status: 'signed-out', problem: 'ended' });
    render(<SyncNote />);
    expect(await screen.findByRole('status')).toHaveTextContent('Your GitHub sign-in ended');
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeInTheDocument();
  });

  it('says why a save was not sent, and tries now when asked', async () => {
    unsynced.mark('layouts', 'x');
    useGitHubSession.setState({ status: 'signed-in', login: 'you' });
    useSync.setState({ phase: 'failed', error: 'GitHub responded 503' });
    render(<SyncNote />);
    expect(await screen.findByRole('status')).toHaveTextContent('GitHub responded 503');
    expect(screen.getByRole('button', { name: 'Try now' })).toBeInTheDocument();
  });
});

describe('the Storage button', () => {
  function renderStorage() {
    render(
      <StorageProvider adapter={new CompositeStorage(new MemoryStorage('l'), null)}>
        <StorageSettings />
      </StorageProvider>,
    );
  }

  it('says what is on it when all is well', () => {
    renderStorage();
    expect(screen.getByRole('button', { name: 'Storage: this browser only' })).toHaveTextContent(
      /^Storage$/,
    );
  });

  it('says a save is in this browser only, and the dialog says so too', async () => {
    const user = userEvent.setup();
    unsynced.mark('layouts', 'magic-gust');
    renderStorage();
    const button = await screen.findByRole('button', {
      name: 'Storage · unsynced: Saved in this browser only. Sign in with GitHub to sync it.',
    });
    expect(button).toHaveTextContent('Storage · unsynced');

    await user.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Storage' });
    expect(dialog).toHaveTextContent('Saved in this browser only. Sign in with GitHub to sync it.');
  });
});
