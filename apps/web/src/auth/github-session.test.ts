import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToasts } from '../state/toasts.js';
import {
  authorizeUrl,
  getToken,
  gitHubAccess,
  initGitHubSession,
  maintainLibrary,
  proposeChange,
  retrySignIn,
  returnFromGitHub,
  signOut,
  submitLayout,
  useGitHubSession,
} from './github-session.js';

/** The work a lock is asked for, which the API takes with or without options before it. */
type Work = () => Promise<unknown>;
const lockWork = (a: object | Work, b?: Work): Work =>
  typeof a === 'function' ? (a as Work) : (b as Work);

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
    problem: null,
    clientId: '',
    maintainer: false,
  });
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

  it('learns who is signed in', async () => {
    await initGitHubSession();
    expect(useGitHubSession.getState()).toMatchObject({
      status: 'signed-in',
      login: 'you',
      clientId: 'Iv1.client',
      maintainer: false,
    });
  });

  it('learns whether they maintain the Library, as the server says', async () => {
    answer = () => reply({ ...SIGNED_IN, maintainer: true });
    await initGitHubSession();
    expect(useGitHubSession.getState().maintainer).toBe(true);
  });

  it('forgets a remembered fork, and asks GitHub nothing about forks', async () => {
    const remembered = 'layerbench:storage-target:you';
    localStorage.setItem(
      remembered,
      JSON.stringify({ kind: 'repo', repo: 'you/layerbench', branch: 'layerbench-data' }),
    );
    await initGitHubSession();
    expect(useGitHubSession.getState().status).toBe('signed-in');
    expect(localStorage.getItem(remembered)).toBeNull();
    expect(calls.every((c) => c.url.startsWith('/api/auth/'))).toBe(true);
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
    const request = vi.fn((_name: string, a: object | Work, b?: Work) => lockWork(a, b)());
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    await initGitHubSession();
    // Waiting for the lock is limited by a signal that aborts, so a tab that never lets go does not
    // hold this one up for ever.
    expect(request).toHaveBeenCalledWith(
      'layerbench:github-session',
      { signal: expect.any(AbortSignal) },
      expect.any(Function),
    );
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
    const request = (_name: string, a: object | Work, b?: Work) => {
      // The tab that held the lock renewed the session and stored the new one.
      localStorage.setItem(SESSION, 'sealed-new');
      return lockWork(a, b)();
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

describe('a check that does not end', () => {
  const never = () => new Promise<Response>(() => {});

  it('gives up on a server that does not answer, and says so when a session was kept', async () => {
    vi.useFakeTimers();
    localStorage.setItem(SESSION, 'sealed-1');
    vi.stubGlobal('fetch', never);
    const done = initGitHubSession();
    expect(useGitHubSession.getState().status).toBe('unknown');

    await vi.advanceTimersByTimeAsync(10_000);
    await done;
    expect(useGitHubSession.getState()).toMatchObject({
      status: 'signed-out',
      problem: 'unreachable',
    });
    // Not known to be over, so not forgotten.
    expect(localStorage.getItem(SESSION)).toBe('sealed-1');
  });

  it('says nothing of a server it cannot reach to a browser that never signed in', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', never);
    const done = initGitHubSession();
    await vi.advanceTimersByTimeAsync(10_000);
    await done;
    expect(useGitHubSession.getState()).toMatchObject({ status: 'signed-out', problem: null });
  });

  it('gives up on a tab that never lets go of the lock', async () => {
    vi.useFakeTimers();
    localStorage.setItem(SESSION, 'sealed-1');
    const request = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    const done = initGitHubSession();
    await vi.advanceTimersByTimeAsync(10_000);
    await done;
    expect(useGitHubSession.getState()).toMatchObject({
      status: 'signed-out',
      problem: 'unreachable',
    });
  });

  it('still takes an answer that comes after the limit', async () => {
    vi.useFakeTimers();
    localStorage.setItem(SESSION, 'sealed-1');
    let answerLate: (r: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      () =>
        new Promise<Response>((resolve) => {
          answerLate = resolve;
        }),
    );
    const done = initGitHubSession();
    await vi.advanceTimersByTimeAsync(10_000);
    await done;
    expect(useGitHubSession.getState().status).toBe('signed-out');

    answerLate(reply(SIGNED_IN));
    await vi.waitFor(() => expect(useGitHubSession.getState().status).toBe('signed-in'));
    expect(useGitHubSession.getState().problem).toBeNull();
  });

  it('is asked again on request, and answers', async () => {
    vi.useFakeTimers();
    localStorage.setItem(SESSION, 'sealed-1');
    vi.stubGlobal('fetch', never);
    const first = initGitHubSession();
    await vi.advanceTimersByTimeAsync(10_000);
    await first;
    expect(useGitHubSession.getState().problem).toBe('unreachable');

    vi.stubGlobal('fetch', async () => reply(SIGNED_IN));
    const again = retrySignIn();
    // Asking again is asking: the page does not claim to know in the meantime.
    expect(useGitHubSession.getState()).toMatchObject({ status: 'unknown', problem: null });
    await again;
    expect(useGitHubSession.getState()).toMatchObject({ status: 'signed-in', problem: null });
  });

  it('stops waiting for a token the sign-in server is slow to give, and says why', async () => {
    vi.useFakeTimers();
    answer = () => reply(SIGNED_OUT);
    await initGitHubSession();
    localStorage.setItem(SESSION, 'sealed-1');
    vi.stubGlobal('fetch', never);
    const asked = expect(getToken()).rejects.toThrow('the sign-in server did not answer in time');
    await vi.advanceTimersByTimeAsync(10_000);
    await asked;
  });

  it('does not cancel a request the server may already have spent the session on', async () => {
    vi.useFakeTimers();
    localStorage.setItem(SESSION, 'sealed-1');
    let signal: AbortSignal | null | undefined;
    vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
      signal = init?.signal;
      return never();
    });
    const asking = initGitHubSession();
    await vi.advanceTimersByTimeAsync(30_000);
    await asking;
    // The server spends the refresh token it is sent and answers with the next session: an answer
    // thrown away would leave the browser holding one that is retired, and signed out.
    expect(signal ?? null).toBeNull();
  });

  it('keeps the session an answer that comes late carries', async () => {
    vi.useFakeTimers();
    localStorage.setItem(SESSION, 'sealed-1');
    let answerLate: (r: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      () =>
        new Promise<Response>((resolve) => {
          answerLate = resolve;
        }),
    );
    const asking = initGitHubSession();
    await vi.advanceTimersByTimeAsync(10_000);
    await asking;

    answerLate(reply({ ...SIGNED_IN, session: 'sealed-next' }));
    await vi.waitFor(() => expect(localStorage.getItem(SESSION)).toBe('sealed-next'));
    expect(useGitHubSession.getState().status).toBe('signed-in');
  });

  it('names a lock that was waited for in vain', async () => {
    answer = () => reply(SIGNED_OUT);
    await initGitHubSession();
    const request = async () => {
      throw new DOMException('signal timed out', 'TimeoutError');
    };
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    await expect(getToken()).rejects.toThrow('another tab of LayerBench is holding up the sign-in');
  });

  it('signs out even when another tab holds the lock', async () => {
    localStorage.setItem(SESSION, 'sealed-1');
    await initGitHubSession();
    const request = async () => {
      throw new DOMException('signal timed out', 'TimeoutError');
    };
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    await signOut();
    expect(localStorage.getItem(SESSION)).toBeNull();
    expect(useGitHubSession.getState()).toMatchObject({ status: 'signed-out', problem: null });
  });
});

describe('an answer that is not a no', () => {
  it('is not taken for there being no sign-in when the server is down or too busy', async () => {
    for (const status of [500, 503, 504, 429]) {
      useGitHubSession.setState({ status: 'unknown', problem: null });
      localStorage.setItem(SESSION, 'sealed-1');
      answer = () => reply({ error: 'down' }, status);
      await initGitHubSession();
      expect(useGitHubSession.getState()).toMatchObject({
        status: 'signed-out',
        problem: 'unreachable',
      });
      expect(localStorage.getItem(SESSION)).toBe('sealed-1');
    }
  });

  it('is not taken for there being no sign-in when a browser that had a session is answered by a page', async () => {
    localStorage.setItem(SESSION, 'sealed-1');
    answer = () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } });
    await initGitHubSession();
    expect(useGitHubSession.getState()).toMatchObject({
      status: 'signed-out',
      problem: 'unreachable',
    });
    expect(localStorage.getItem(SESSION)).toBe('sealed-1');
  });
});

describe('signing out while an answer is out', () => {
  it('throws the answer away, rather than signing the user in again', async () => {
    localStorage.setItem(SESSION, 'sealed-1');
    let answerLate: (r: Response) => void = () => {};
    vi.stubGlobal('fetch', (url: string) =>
      url.endsWith('/logout')
        ? Promise.resolve(new Response(null, { status: 204 }))
        : new Promise<Response>((resolve) => {
            answerLate = resolve;
          }),
    );
    const asking = initGitHubSession();
    await vi.waitFor(() => expect(localStorage.getItem(SESSION)).toBe('sealed-1'));
    await signOut();
    expect(localStorage.getItem(SESSION)).toBeNull();

    // The server answers a renewal the user has since ended.
    answerLate(reply({ ...SIGNED_IN, session: 'sealed-next' }));
    await asking;
    expect(localStorage.getItem(SESSION)).toBeNull();
    expect(useGitHubSession.getState().status).not.toBe('signed-in');
    expect(useGitHubSession.getState().problem).toBeNull();
  });
});

describe('a session that ends', () => {
  it('is said to have ended when this browser had one and the server turns it down', async () => {
    localStorage.setItem(SESSION, 'sealed-1');
    answer = () => reply(SIGNED_OUT);
    await initGitHubSession();
    expect(useGitHubSession.getState()).toMatchObject({ status: 'signed-out', problem: 'ended' });
  });

  it('is told again on the next visit, until the user signs in or out', async () => {
    localStorage.setItem(SESSION, 'sealed-1');
    answer = () => reply(SIGNED_OUT);
    await initGitHubSession();
    expect(useGitHubSession.getState().problem).toBe('ended');

    // The visit after: no session is kept any more, and still it is said.
    useGitHubSession.setState({ status: 'unknown', problem: null });
    await initGitHubSession();
    expect(useGitHubSession.getState()).toMatchObject({ status: 'signed-out', problem: 'ended' });

    await signOut();
    useGitHubSession.setState({ status: 'unknown', problem: null });
    await initGitHubSession();
    expect(useGitHubSession.getState().problem).toBeNull();
  });

  it('is nothing to report in a browser that had none', async () => {
    answer = () => reply(SIGNED_OUT);
    await initGitHubSession();
    expect(useGitHubSession.getState()).toMatchObject({ status: 'signed-out', problem: null });
  });

  it('is said to have ended when GitHub turns the token down and the session cannot be renewed', async () => {
    localStorage.setItem(SESSION, 'sealed-1');
    answer = (call) => reply(call.body?.renew ? SIGNED_OUT : SIGNED_IN);
    await initGitHubSession();
    expect(useGitHubSession.getState().problem).toBeNull();
    gitHubAccess.onUnauthorized?.('ghu_one');
    await vi.waitFor(() =>
      expect(useGitHubSession.getState()).toMatchObject({ status: 'signed-out', problem: 'ended' }),
    );
  });

  it('is nothing to report once the user signs out themselves, or signs in again', async () => {
    localStorage.setItem(SESSION, 'sealed-1');
    answer = () => reply(SIGNED_OUT);
    await initGitHubSession();
    expect(useGitHubSession.getState().problem).toBe('ended');

    answer = () => reply(SIGNED_IN);
    await retrySignIn();
    expect(useGitHubSession.getState()).toMatchObject({ status: 'signed-in', problem: null });
    await signOut();
    expect(useGitHubSession.getState().problem).toBeNull();
  });
});

describe('a token GitHub turns down', () => {
  /** Signed in with `ghu_one` from `sealed-1`; asked to renew, the server gives `ghu_two`. */
  async function signedIn(
    renewed: unknown = { ...SIGNED_IN, token: 'ghu_two', session: 'sealed-2' },
  ) {
    localStorage.setItem(SESSION, 'sealed-1');
    answer = (call) =>
      reply(!call.body?.session ? SIGNED_OUT : call.body.renew ? renewed : SIGNED_IN);
    await initGitHubSession();
    expect(await getToken()).toBe('ghu_one');
    calls = [];
  }

  it('is renewed at once rather than handed back until it expires', async () => {
    await signedIn();
    gitHubAccess.onUnauthorized?.('ghu_one');
    await vi.waitFor(() => expect(localStorage.getItem(SESSION)).toBe('sealed-2'));
    expect(await getToken()).toBe('ghu_two');
    expect(calls.map((c) => c.body)).toEqual([
      { session: 'sealed-1' },
      { session: 'sealed-1', renew: true },
    ]);
  });

  it('ends the session when it cannot be renewed', async () => {
    await signedIn(SIGNED_OUT);
    gitHubAccess.onUnauthorized?.('ghu_one');
    await vi.waitFor(() => expect(useGitHubSession.getState().status).toBe('signed-out'));
    expect(localStorage.getItem(SESSION)).toBeNull();
    await expect(getToken()).rejects.toThrow('signed out');
  });

  it('takes the token another tab has renewed meanwhile, without renewing it again', async () => {
    await signedIn();
    localStorage.setItem(SESSION, 'sealed-2');
    answer = (call) =>
      reply(call.body?.session === 'sealed-2' ? { ...SIGNED_IN, token: 'ghu_two' } : SIGNED_IN);
    gitHubAccess.onUnauthorized?.('ghu_one');
    await vi.waitFor(async () => expect(await getToken()).toBe('ghu_two'));
    expect(calls.some((c) => c.body?.renew)).toBe(false);
  });

  it('is renewed once, however many requests GitHub turned down with it', async () => {
    // Tabs and requests take turns, as the browser's lock makes them.
    let queue: Promise<unknown> = Promise.resolve();
    const request = (_name: string, a: object | Work, b?: Work) => {
      const turn = queue.then(lockWork(a, b));
      queue = turn.catch(() => {});
      return turn;
    };
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    await signedIn();
    gitHubAccess.onUnauthorized?.('ghu_one');
    gitHubAccess.onUnauthorized?.('ghu_one');
    await vi.waitFor(() => expect(localStorage.getItem(SESSION)).toBe('sealed-2'));
    await getToken();
    expect(calls.filter((c) => c.body?.renew)).toHaveLength(1);
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

describe('changing the Library', () => {
  const PULL = 'https://github.com/rafaelromao/layerbench/pull/8';

  async function signedIn(): Promise<void> {
    localStorage.setItem(SESSION, 'sealed');
    await initGitHubSession();
  }

  it('proposes a change to a layout, and hands back the pull request', async () => {
    await signedIn();
    answer = (call) =>
      call.url.endsWith('/propose') ? reply({ url: PULL }, 201) : reply(SIGNED_IN);
    const target = { kind: 'bundled', id: 'colemak' } as const;
    expect(await proposeChange(target, { id: 'colemak' })).toEqual({
      kind: 'sent',
      url: PULL,
      reused: false,
    });
    expect(calls.find((c) => c.url === '/api/auth/propose')?.body).toEqual({
      session: 'sealed',
      target,
      layout: { id: 'colemak' },
    });
  });

  it("sends a maintainer's delete or promote, and says why one was refused", async () => {
    await signedIn();
    answer = (call) =>
      call.url.endsWith('/maintain') ? reply({ error: 'not a maintainer' }, 403) : reply(SIGNED_IN);
    expect(await maintainLibrary('delete', { kind: 'community', id: 'breeze' })).toEqual({
      kind: 'failed',
      error: 'not a maintainer',
    });
    expect(calls.find((c) => c.url === '/api/auth/maintain')?.body).toEqual({
      session: 'sealed',
      action: 'delete',
      target: { kind: 'community', id: 'breeze' },
    });
    answer = (call) =>
      call.url.endsWith('/maintain') ? reply({ url: PULL }, 201) : reply(SIGNED_IN);
    expect(
      await maintainLibrary('promote', { kind: 'custom', id: 'gust' }, { id: 'gust' }),
    ).toEqual({
      kind: 'sent',
      url: PULL,
      reused: false,
    });
  });
});

describe('submitting a layout', () => {
  const PULL = 'https://github.com/rafaelromao/layerbench/pull/7';

  async function signedIn(): Promise<void> {
    localStorage.setItem(SESSION, 'sealed');
    await initGitHubSession();
  }

  it('sends the layout with the session, and hands back the pull request', async () => {
    await signedIn();
    answer = (call) =>
      call.url.endsWith('/submit') ? reply({ url: PULL }, 201) : reply(SIGNED_IN);
    expect(await submitLayout({ id: 'mine' })).toEqual({ kind: 'sent', url: PULL, reused: false });
    const sent = calls.find((c) => c.url === '/api/auth/submit');
    expect(sent?.body).toEqual({ session: 'sealed', layout: { id: 'mine' } });
  });

  it('says when it updated the pull request already open', async () => {
    await signedIn();
    answer = () => reply({ url: PULL, reused: true });
    expect(await submitLayout({})).toEqual({ kind: 'sent', url: PULL, reused: true });
  });

  it('says why the server refused it', async () => {
    await signedIn();
    answer = (call) =>
      call.url.endsWith('/submit')
        ? reply({ error: 'taken', reason: 'a community layout already has the id "mine"' }, 409)
        : reply(SIGNED_IN);
    expect(await submitLayout({})).toEqual({
      kind: 'refused',
      reason: 'a community layout already has the id "mine"',
    });
  });

  it('asks to sign in when nobody is, or the server says the session is over', async () => {
    answer = () => reply(SIGNED_OUT);
    await initGitHubSession();
    expect(await submitLayout({})).toEqual({ kind: 'signed-out' });

    await signedIn();
    answer = (call) =>
      call.url.endsWith('/submit') ? reply({ error: 'signed out' }, 401) : reply(SIGNED_IN);
    expect(await submitLayout({})).toEqual({ kind: 'signed-out' });
  });

  it('says what failed when it could not be sent, or GitHub would not take it', async () => {
    await signedIn();
    answer = (call) =>
      call.url.endsWith('/submit')
        ? reply({ error: 'GitHub refused the submission' }, 502)
        : reply(SIGNED_IN);
    expect(await submitLayout({})).toEqual({
      kind: 'failed',
      error: 'GitHub refused the submission',
    });

    answer = (call) =>
      call.url.endsWith('/submit') ? new Response('nope', { status: 500 }) : reply(SIGNED_IN);
    expect(await submitLayout({})).toEqual({
      kind: 'failed',
      error: 'the sign-in server answered 500',
    });

    // A link anywhere but GitHub is not shown as the pull request.
    answer = (call) =>
      call.url.endsWith('/submit')
        ? reply({ url: 'https://elsewhere.example/x' })
        : reply(SIGNED_IN);
    expect((await submitLayout({})).kind).toBe('failed');

    vi.stubGlobal('fetch', async (input: string) => {
      if (String(input).endsWith('/submit')) throw new TypeError('offline');
      return reply(SIGNED_IN);
    });
    expect(await submitLayout({})).toEqual({
      kind: 'failed',
      error: 'the sign-in server could not be reached',
    });
  });

  it('asks to sign in when this browser keeps no session', async () => {
    await signedIn();
    localStorage.removeItem(SESSION);
    expect(await submitLayout({})).toEqual({ kind: 'signed-out' });
  });
});
