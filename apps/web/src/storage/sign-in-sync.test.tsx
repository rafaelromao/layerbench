import type { StorageAdapter } from '@layerbench/core';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initGitHubSession, useGitHubSession } from '../auth/github-session.js';
import { useToasts } from '../state/toasts.js';
import { useSync } from './auto-sync.js';
import { unsynced } from './unsynced.js';
import { StorageProvider, useStorage } from './use-storage.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const SIGNED_IN = {
  available: true,
  clientId: 'Iv1.client',
  signedIn: true,
  login: 'you',
  token: 'ghu_one',
  expiresAt: Date.now() + 8 * 3600_000,
};

/**
 * The sign-in server and GitHub's gists, as one small fake: gists are created, listed, read and
 * edited as the real API does, and nobody is signed in until `signIn()`.
 */
function fakeGitHub() {
  const gists = new Map<string, Record<string, string>>();
  const state = { signedIn: false, down: false };
  const gist = (id: string) => ({
    id,
    files: Object.fromEntries(
      Object.entries(gists.get(id) ?? {}).map(([name, content]) => [name, { content }]),
    ),
  });
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.endsWith('/api/auth/session')) {
      return json(
        state.signedIn ? SIGNED_IN : { available: true, clientId: 'Iv1.client', signedIn: false },
      );
    }
    if (state.down) return json({ message: 'Service Unavailable' }, 503);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    const files = (body?.files ?? {}) as Record<string, { content: string } | null>;
    if (url.startsWith('https://api.github.com/gists?')) {
      return json([...gists.keys()].map(gist));
    }
    if (url === 'https://api.github.com/gists' && method === 'POST') {
      const id = `gist-${gists.size + 1}`;
      gists.set(
        id,
        Object.fromEntries(Object.entries(files).map(([n, f]) => [n, f?.content ?? ''])),
      );
      return json(gist(id), 201);
    }
    const id = url.split('/gists/')[1];
    if (!gists.has(id)) return json({ message: 'Not Found' }, 404);
    if (method === 'PATCH') {
      const current = gists.get(id) ?? {};
      for (const [name, file] of Object.entries(files)) {
        if (file) current[name] = file.content;
        else delete current[name];
      }
      return json(gist(id));
    }
    return json(gist(id));
  });
  return {
    gists,
    signIn: () => {
      state.signedIn = true;
    },
    down: (on: boolean) => {
      state.down = on;
    },
    has: (file: string) => [...gists.values()].some((files) => file in files),
  };
}

/** The storage the app saves to now, as the views see it. */
function mount() {
  const current: { storage: StorageAdapter | null } = { storage: null };
  function Probe() {
    current.storage = useStorage();
    return null;
  }
  render(
    <StorageProvider>
      <Probe />
    </StorageProvider>,
  );
  return current;
}

beforeEach(() => {
  useToasts.setState({ toasts: [] });
  useGitHubSession.setState({ status: 'signed-out', login: null, problem: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useSync.setState({ phase: 'idle', error: null, last: null });
  useGitHubSession.setState({ status: 'unknown', login: null, problem: null });
});

describe('a sign-in server that did not answer, as the app is wired', () => {
  it('is asked again when the browser is back online', async () => {
    const github = fakeGitHub();
    github.signIn();
    useGitHubSession.setState({ status: 'signed-out', login: null, problem: 'unreachable' });
    mount();

    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(useGitHubSession.getState().status).toBe('signed-in'));
    expect(useGitHubSession.getState().problem).toBeNull();
  });

  it('is asked again when the tab is shown again', async () => {
    const github = fakeGitHub();
    github.signIn();
    useGitHubSession.setState({ status: 'signed-out', login: null, problem: 'unreachable' });
    mount();

    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(useGitHubSession.getState().status).toBe('signed-in'));
  });

  it('is left alone when it was never in doubt', async () => {
    const github = fakeGitHub();
    github.signIn();
    mount();
    window.dispatchEvent(new Event('online'));
    await new Promise((r) => setTimeout(r, 50));
    expect(useGitHubSession.getState().status).toBe('signed-out');
  });
});

describe('a layout saved in this browser, as the app is wired', () => {
  it('stays in this browser, marked, while nobody is signed in', async () => {
    const github = fakeGitHub();
    const app = mount();
    await app.storage?.put('layouts', 'magic-gust', { name: 'Magic Gust' });
    expect(unsynced.has('layouts', 'magic-gust')).toBe(true);
    expect(github.gists.size).toBe(0);
  });

  it('is sent to the gists when the user signs in, with nothing pressed', async () => {
    const github = fakeGitHub();
    const app = mount();
    await app.storage?.put('layouts', 'magic-gust', { name: 'Magic Gust' });
    expect(github.has('layouts.magic-gust.json')).toBe(false);

    github.signIn();
    await act(() => initGitHubSession());

    await waitFor(() => expect(github.has('layouts.magic-gust.json')).toBe(true));
    await waitFor(() => expect(unsynced.count()).toBe(0));
    expect(useToasts.getState().toasts.map((t) => t.text)).toContain(
      'Sent 1 document saved in this browser to your GitHub account',
    );
    // The user finds it where the gist adapter lists it too.
    expect((await app.storage?.list('layouts'))?.map((e) => e.id)).toEqual(['magic-gust']);
  });

  it('is sent by the save itself once signed in', async () => {
    const github = fakeGitHub();
    github.signIn();
    const app = mount();
    await act(() => initGitHubSession());
    await waitFor(() => expect(useGitHubSession.getState().status).toBe('signed-in'));

    await app.storage?.put('layouts', 'strict-save', { name: 'Strict' });
    expect(github.has('layouts.strict-save.json')).toBe(true);
    expect(unsynced.count()).toBe(0);
  });

  it('is kept and marked when the gists cannot be written, and sent when they can', async () => {
    const github = fakeGitHub();
    github.signIn();
    const app = mount();
    await act(() => initGitHubSession());
    await waitFor(() => expect(useGitHubSession.getState().status).toBe('signed-in'));

    github.down(true);
    await expect(
      app.storage?.put('layouts', 'strict-down', { name: 'Strict down' }),
    ).rejects.toThrow('503');
    expect(unsynced.has('layouts', 'strict-down')).toBe(true);
    expect((await app.storage?.get('layouts', 'strict-down'))?.doc).toEqual({
      name: 'Strict down',
    });

    github.down(false);
    await waitFor(() => expect(github.has('layouts.strict-down.json')).toBe(true), {
      timeout: 8_000,
    });
    await waitFor(() => expect(unsynced.count()).toBe(0));
  });
});
