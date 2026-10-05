import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToasts } from '../state/toasts.js';
import { findStorageTarget } from '../storage/target.js';
import {
  detectTarget,
  getToken,
  initGitHubSession,
  restoreAfterSignIn,
  signOut,
  useGitHubSession,
} from './github-session.js';

vi.mock('../storage/target.js', () => ({ findStorageTarget: vi.fn() }));

let calls: { url: string; method: string }[];
let answer: () => Response;

function session(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SIGNED_IN = {
  available: true,
  signedIn: true,
  login: 'you',
  token: 'ghu_one',
  expiresAt: Date.now() + 8 * 3600_000,
  appSlug: 'layoutmaster-app',
  upstream: 'rafaelromao/layoutmaster',
};

beforeEach(() => {
  calls = [];
  answer = () => session(SIGNED_IN);
  localStorage.clear();
  sessionStorage.clear();
  useGitHubSession.setState({
    status: 'unknown',
    login: null,
    appSlug: '',
    upstream: '',
    target: null,
    targetStatus: 'idle',
  });
  vi.mocked(findStorageTarget).mockResolvedValue({ kind: 'gist' });
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET' });
    return String(input).endsWith('/logout') ? new Response(null, { status: 204 }) : answer();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the GitHub session in the page', () => {
  it('knows there is no sign-in on a host that answers with the app instead', async () => {
    answer = () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } });
    await initGitHubSession();
    expect(useGitHubSession.getState().status).toBe('unavailable');
    await expect(getToken()).rejects.toThrow('signed out');
  });

  it('learns who is signed in, then where their documents go', async () => {
    await initGitHubSession();
    await vi.waitFor(() => expect(useGitHubSession.getState().target).toEqual({ kind: 'gist' }));
    expect(useGitHubSession.getState()).toMatchObject({
      status: 'signed-in',
      login: 'you',
      appSlug: 'layoutmaster-app',
    });
    expect(findStorageTarget).toHaveBeenCalledWith(
      expect.anything(),
      'you',
      'rafaelromao/layoutmaster',
    );
  });

  it('keeps the token in memory and asks for it again only near its expiry', async () => {
    await initGitHubSession();
    expect(await getToken()).toBe('ghu_one');
    expect(calls.filter((c) => c.url === '/api/auth/session')).toHaveLength(1);

    answer = () =>
      session({ ...SIGNED_IN, token: 'ghu_two', expiresAt: Date.now() + 9 * 3600_000 });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 8 * 3600_000 - 30_000);
    expect(await getToken()).toBe('ghu_two');
    expect(calls.filter((c) => c.url === '/api/auth/session')).toHaveLength(2);
    expect(JSON.stringify(useGitHubSession.getState())).not.toContain('ghu_');
  });

  it('renews one tab at a time, since a refresh token works once', async () => {
    const request = vi.fn((_name: string, work: () => Promise<unknown>) => work());
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    await initGitHubSession();
    expect(request).toHaveBeenCalledWith('layoutmaster:github-session', expect.any(Function));
  });

  it('keeps sending documents where they went when GitHub cannot be asked', async () => {
    await initGitHubSession();
    await vi.waitFor(() => expect(useGitHubSession.getState().target).toEqual({ kind: 'gist' }));
    vi.mocked(findStorageTarget).mockRejectedValue(new Error('GitHub responded 502'));
    await detectTarget();
    expect(useGitHubSession.getState()).toMatchObject({
      target: { kind: 'gist' },
      targetStatus: 'error',
    });
  });

  it('signs out without touching what the browser keeps', async () => {
    await initGitHubSession();
    await signOut();
    expect(calls.at(-1)).toEqual({ url: '/api/auth/logout', method: 'POST' });
    expect(useGitHubSession.getState()).toMatchObject({ status: 'signed-out', login: null });
  });
});

describe('coming back from GitHub', () => {
  it('returns to the page the user signed in from', () => {
    history.replaceState(null, '', '/');
    sessionStorage.setItem('layoutmaster:after-sign-in', '/analyze?layout=inline:abc');
    restoreAfterSignIn();
    expect(location.pathname + location.search).toBe('/analyze?layout=inline:abc');
    expect(sessionStorage.getItem('layoutmaster:after-sign-in')).toBeNull();
  });

  it('goes nowhere but a path on this site', () => {
    history.replaceState(null, '', '/');
    sessionStorage.setItem('layoutmaster:after-sign-in', '//elsewhere.example/x');
    restoreAfterSignIn();
    expect(location.href).toBe(`${location.origin}/`);
  });

  it('says so when signing in did not complete', () => {
    history.replaceState(null, '', '/?signin=failed');
    restoreAfterSignIn();
    expect(location.search).toBe('');
    expect(useToasts.getState().toasts.at(-1)?.text).toBe(
      'Signing in with GitHub did not complete',
    );
  });
});
