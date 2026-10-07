import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToasts } from '../state/toasts.js';
import { findStorageTarget } from '../storage/target.js';
import {
  authorizeUrl,
  detectTarget,
  getToken,
  initGitHubSession,
  returnFromGitHub,
  signOut,
  useGitHubSession,
} from './github-session.js';

vi.mock('../storage/target.js', () => ({ findStorageTarget: vi.fn() }));

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

let calls: Call[];
let answer: (call: Call) => Response;

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const CONFIG = {
  available: true,
  clientId: 'Iv1.client',
  appSlug: 'layerbench-app',
  upstream: 'rafaelromao/layerbench',
};
const SIGNED_IN = {
  ...CONFIG,
  signedIn: true,
  login: 'you',
  token: 'ghu_one',
  expiresAt: Date.now() + 8 * 3600_000,
};
const SIGNED_OUT = { ...CONFIG, signedIn: false };

const SESSION = 'layerbench:github-session';
const SIGN_IN = 'layerbench:sign-in';
const VERIFIER = 'v'.repeat(43);
const FAILED = 'Signing in with GitHub did not complete';

function lastToast(): string | undefined {
  return useToasts.getState().toasts.at(-1)?.text;
}

/** A trip to GitHub this tab started, the way `authorizeUrl` leaves it. */
function pending(returnTo: string, at = Date.now()): void {
  sessionStorage.setItem(SIGN_IN, JSON.stringify({ state: 's', verifier: VERIFIER, returnTo, at }));
}

beforeEach(() => {
  calls = [];
  answer = () => reply(SIGNED_IN);
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '/');
  useToasts.setState({ toasts: [] });
  useGitHubSession.setState({
    status: 'unknown',
    login: null,
    clientId: '',
    appSlug: '',
    upstream: '',
    target: null,
    targetStatus: 'idle',
  });
  vi.mocked(findStorageTarget).mockResolvedValue({ kind: 'gist' });
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    const call = { url: String(input), method: init?.method ?? 'GET', body };
    calls.push(call);
    return call.url.endsWith('/logout') ? new Response(null, { status: 204 }) : answer(call);
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
      clientId: 'Iv1.client',
      appSlug: 'layerbench-app',
    });
    expect(findStorageTarget).toHaveBeenCalledWith(
      expect.anything(),
      'you',
      'rafaelromao/layerbench',
    );
  });

  it('keeps the token in memory and asks for it again only near its expiry', async () => {
    await initGitHubSession();
    expect(await getToken()).toBe('ghu_one');
    expect(calls.filter((c) => c.url === '/api/auth/session')).toHaveLength(1);

    answer = () => reply({ ...SIGNED_IN, token: 'ghu_two', expiresAt: Date.now() + 9 * 3600_000 });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 8 * 3600_000 - 30_000);
    expect(await getToken()).toBe('ghu_two');
    expect(calls.filter((c) => c.url === '/api/auth/session')).toHaveLength(2);
    expect(JSON.stringify(useGitHubSession.getState())).not.toContain('ghu_');
    expect(JSON.stringify({ ...localStorage })).not.toContain('ghu_');
  });

  it('renews one tab at a time, since a refresh token works once', async () => {
    const request = vi.fn((_name: string, work: () => Promise<unknown>) => work());
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    await initGitHubSession();
    expect(request).toHaveBeenCalledWith('layerbench:github-session', expect.any(Function));
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
});

describe('the session this browser keeps', () => {
  it('sends the session it keeps, and keeps the one the server renews', async () => {
    localStorage.setItem(SESSION, 'sealed-1');
    answer = () => reply({ ...SIGNED_IN, session: 'sealed-2' });
    await initGitHubSession();
    expect(calls[0]).toMatchObject({ url: '/api/auth/session', body: { session: 'sealed-1' } });
    expect(localStorage.getItem(SESSION)).toBe('sealed-2');
  });

  it('reads the session only once it holds the lock, after the tab before it is done', async () => {
    localStorage.setItem(SESSION, 'sealed-old');
    const request = (_name: string, work: () => Promise<unknown>) => {
      // The tab that held the lock renewed the session and stored the new one.
      localStorage.setItem(SESSION, 'sealed-new');
      return work();
    };
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    await initGitHubSession();
    expect(calls[0].body).toEqual({ session: 'sealed-new' });
  });

  it('forgets a session the server turns down', async () => {
    localStorage.setItem(SESSION, 'sealed-1');
    answer = () => reply(SIGNED_OUT);
    await initGitHubSession();
    expect(localStorage.getItem(SESSION)).toBeNull();
    expect(useGitHubSession.getState()).toMatchObject({
      status: 'signed-out',
      clientId: 'Iv1.client',
    });
  });

  it('tries the session another tab stored meanwhile before forgetting anything', async () => {
    localStorage.setItem(SESSION, 'sealed-1');
    answer = (call) => {
      if (call.body?.session !== 'sealed-1') return reply(SIGNED_IN);
      // Retired by the other tab's renewal, which stored its successor.
      localStorage.setItem(SESSION, 'sealed-2');
      return reply(SIGNED_OUT);
    };
    await initGitHubSession();
    expect(calls.map((c) => c.body?.session)).toEqual(['sealed-1', 'sealed-2']);
    expect(localStorage.getItem(SESSION)).toBe('sealed-2');
    expect(useGitHubSession.getState().status).toBe('signed-in');
  });

  it('leaves the session alone when the server or GitHub cannot be reached', async () => {
    localStorage.setItem(SESSION, 'sealed-1');
    answer = () => reply({ error: 'GitHub could not be reached' }, 502);
    await initGitHubSession();
    expect(localStorage.getItem(SESSION)).toBe('sealed-1');

    answer = () => {
      throw new TypeError('Failed to fetch');
    };
    await initGitHubSession();
    expect(localStorage.getItem(SESSION)).toBe('sealed-1');
    expect(useGitHubSession.getState().status).toBe('signed-out');
  });

  it('signs out without touching what the browser keeps, and stays ready to sign in', async () => {
    localStorage.setItem(SESSION, 'sealed-1');
    await initGitHubSession();
    await signOut();
    expect(calls.at(-1)).toEqual({
      url: '/api/auth/logout',
      method: 'POST',
      body: { session: 'sealed-1' },
    });
    expect(localStorage.getItem(SESSION)).toBeNull();
    expect(useGitHubSession.getState()).toMatchObject({
      status: 'signed-out',
      login: null,
      clientId: 'Iv1.client',
    });
  });

  it('signs out even when the server does not answer', async () => {
    localStorage.setItem(SESSION, 'sealed-1');
    await initGitHubSession();
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    await signOut();
    expect(localStorage.getItem(SESSION)).toBeNull();
    expect(useGitHubSession.getState().status).toBe('signed-out');
  });
});

describe('the trip to GitHub', () => {
  it('goes to GitHub with a state, a PKCE challenge and the way back', async () => {
    history.replaceState(null, '', '/analyze?layout=inline:abc');
    const url = new URL((await authorizeUrl('Iv1.client')) as string);
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('Iv1.client');
    expect(url.searchParams.get('redirect_uri')).toBe(`${location.origin}/`);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');

    const kept = JSON.parse(sessionStorage.getItem(SIGN_IN) as string);
    expect(kept.returnTo).toBe('/analyze?layout=inline:abc');
    expect(url.searchParams.get('state')).toBe(kept.state);
    expect(kept.state).toMatch(/^[\w-]{43}$/);
    expect(kept.verifier).toMatch(/^[\w-]{43}$/);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(kept.verifier));
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(url.searchParams.get('code_challenge')).toBe(challenge);
  });

  it('comes back to the page signed in from, then trades the code once', async () => {
    pending('/compare?a=1');
    history.replaceState(null, '', '/?code=the-code&state=s');

    const back = returnFromGitHub();
    expect(location.pathname + location.search).toBe('/compare?a=1');
    expect(back).toEqual({ code: 'the-code', verifier: VERIFIER });
    expect(sessionStorage.getItem(SIGN_IN)).toBeNull();
    expect(calls).toEqual([]);

    answer = (call) =>
      call.url.endsWith('/token')
        ? reply({ ...SIGNED_IN, session: 'sealed-1' })
        : reply(SIGNED_OUT);
    await initGitHubSession(back);
    expect(calls).toEqual([
      {
        url: '/api/auth/token',
        method: 'POST',
        body: { code: 'the-code', verifier: VERIFIER, redirectUri: `${location.origin}/` },
      },
    ]);
    expect(localStorage.getItem(SESSION)).toBe('sealed-1');
    expect(useGitHubSession.getState()).toMatchObject({ status: 'signed-in', login: 'you' });
  });

  it('says so, on a clean address, when GitHub sends back an error', () => {
    pending('/library');
    history.replaceState(
      null,
      '',
      '/?error=access_denied&error_description=The+user+denied&error_uri=x&state=s',
    );
    expect(returnFromGitHub()).toBeNull();
    expect(location.pathname + location.search).toBe('/library');
    expect(lastToast()).toBe(FAILED);
    expect(calls).toEqual([]);
  });

  it('turns away a state it did not send', () => {
    pending('/library');
    history.replaceState(null, '', '/?code=the-code&state=forged');
    expect(returnFromGitHub()).toBeNull();
    expect(location.search).toBe('');
    expect(lastToast()).toBe(FAILED);
  });

  it('abandons a trip to GitHub that took too long', () => {
    pending('/library', Date.now() - 11 * 60_000);
    history.replaceState(null, '', '/?code=the-code&state=s');
    expect(returnFromGitHub()).toBeNull();
    expect(location.pathname + location.search).toBe('/');
    expect(lastToast()).toBe(FAILED);
  });

  it('says so when GitHub refuses the code', async () => {
    pending('/library');
    history.replaceState(null, '', '/?code=the-code&state=s');
    answer = () => reply(SIGNED_OUT);
    await initGitHubSession(returnFromGitHub());
    expect(lastToast()).toBe(FAILED);
    expect(calls.map((c) => c.url)).toEqual(['/api/auth/token', '/api/auth/session']);
    expect(useGitHubSession.getState()).toMatchObject({
      status: 'signed-out',
      clientId: 'Iv1.client',
    });
    expect(localStorage.getItem(SESSION)).toBeNull();
  });

  it('goes nowhere but a path on this site', () => {
    for (const elsewhere of [
      '//elsewhere.example/x',
      '/\\elsewhere.example/x',
      'https://x.example/',
    ]) {
      pending(elsewhere);
      history.replaceState(null, '', '/?code=the-code&state=s');
      returnFromGitHub();
      expect(location.href).toBe(`${location.origin}/`);
    }
  });

  it('leaves an ordinary address alone, even with a sign-in pending', () => {
    pending('/library');
    for (const address of ['/analyze?layout=magic-romak', '/', '/library?state=s']) {
      history.replaceState(null, '', address);
      expect(returnFromGitHub()).toBeNull();
      expect(location.pathname + location.search).toBe(address);
    }
    expect(sessionStorage.getItem(SIGN_IN)).not.toBeNull();
    expect(useToasts.getState().toasts).toEqual([]);
  });
});
