import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AuthEnv, handleAuth, type SessionAnswer } from './github-auth.js';

const ORIGIN = 'https://lm.example';

const ENV: AuthEnv = {
  GITHUB_CLIENT_ID: 'Iv1.client',
  GITHUB_CLIENT_SECRET: 'client-secret',
  GITHUB_APP_SLUG: 'layoutmaster-app',
  SESSION_SECRET: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
};

interface Call {
  url: string;
  method: string;
  headers: Headers;
  form: URLSearchParams | null;
}

let calls: Call[];
let responder: (call: Call) => Response;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

/** GitHub's answer to a code or refresh token, with the lifetimes a GitHub App's tokens have. */
function grant(access: string, refresh: string): Response {
  return json(200, {
    access_token: access,
    expires_in: 28_800,
    refresh_token: refresh,
    refresh_token_expires_in: 15_897_600,
    token_type: 'bearer',
  });
}

function github(call: Call): Response {
  if (call.url.endsWith('/login/oauth/access_token')) {
    return call.form?.get('grant_type') === 'refresh_token'
      ? grant('ghu_renewed', 'ghr_renewed')
      : grant('ghu_first', 'ghr_first');
  }
  if (call.url.endsWith('/user')) return json(200, { login: 'you' });
  return json(404, {});
}

beforeEach(() => {
  calls = [];
  responder = github;
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const body = init?.body;
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      form: typeof body === 'string' && !body.startsWith('{') ? new URLSearchParams(body) : null,
    };
    calls.push(call);
    return responder(call);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function get(path: string, cookie = ''): Promise<Response> {
  return handleAuth(new Request(`${ORIGIN}${path}`, { headers: { Cookie: cookie } }), ENV);
}

function post(path: string, cookie = '', site = 'same-origin', env = ENV): Promise<Response> {
  return handleAuth(
    new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Sec-Fetch-Site': site },
    }),
    env,
  );
}

/** `name=value` of each cookie a response sets, the way the browser would send them back. */
function cookiesOf(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

/** Through GitHub and back: the cookie a signed-in browser holds. */
async function signIn(): Promise<string> {
  const login = await get('/api/auth/login');
  const state = new URL(login.headers.get('Location') as string).searchParams.get('state');
  const back = await get(`/api/auth/callback?code=the-code&state=${state}`, cookiesOf(login));
  return cookiesOf(back)
    .split('; ')
    .filter((c) => c.startsWith('__Host-lm-session='))
    .join('; ');
}

describe('signing in', () => {
  it('sends the browser to GitHub with a state and a PKCE challenge it remembers', async () => {
    const res = await get('/api/auth/login');
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get('Location') as string);
    expect(to.origin + to.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(to.searchParams.get('client_id')).toBe('Iv1.client');
    expect(to.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/callback`);
    expect(to.searchParams.get('code_challenge_method')).toBe('S256');
    expect(to.searchParams.get('state')).toMatch(/^[\w-]{43}$/);

    const [cookie] = res.headers.getSetCookie();
    expect(cookie).toMatch(/^__Host-lm-oauth=/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain(to.searchParams.get('state') as string);
  });

  it('exchanges the code with the secret and the verifier, and keeps the tokens out of sight', async () => {
    const login = await get('/api/auth/login');
    const to = new URL(login.headers.get('Location') as string);
    const back = await get(
      `/api/auth/callback?code=the-code&state=${to.searchParams.get('state')}`,
      cookiesOf(login),
    );

    expect(back.status).toBe(302);
    expect(back.headers.get('Location')).toBe(`${ORIGIN}/`);
    const exchange = calls.find((c) => c.url.endsWith('/login/oauth/access_token'));
    expect(exchange?.form?.get('client_secret')).toBe('client-secret');
    expect(exchange?.form?.get('code')).toBe('the-code');
    expect(exchange?.form?.get('code_verifier')).toMatch(/^[\w-]{43}$/);
    expect(calls.find((c) => c.url.endsWith('/user'))?.headers.get('User-Agent')).toBeTruthy();

    const session = back.headers.getSetCookie().find((c) => c.startsWith('__Host-lm-session='));
    expect(session).toContain('HttpOnly');
    expect(session).toContain('SameSite=Strict');
    expect(session).not.toContain('ghu_first');
    expect(session).not.toContain('ghr_first');
  });

  it('turns away a callback whose state is not the one it sent, without asking GitHub', async () => {
    const login = await get('/api/auth/login');
    const back = await get('/api/auth/callback?code=c&state=forged', cookiesOf(login));
    expect(back.headers.get('Location')).toBe(`${ORIGIN}/?signin=failed`);
    expect(calls).toEqual([]);
  });

  it('reports a code GitHub refuses, which it answers with 200 and an error', async () => {
    responder = (call) =>
      call.url.endsWith('/access_token')
        ? json(200, { error: 'bad_verification_code' })
        : github(call);
    const login = await get('/api/auth/login');
    const state = new URL(login.headers.get('Location') as string).searchParams.get('state');
    const back = await get(`/api/auth/callback?code=c&state=${state}`, cookiesOf(login));
    expect(back.headers.get('Location')).toBe(`${ORIGIN}/?signin=failed`);
    expect(back.headers.getSetCookie().some((c) => c.startsWith('__Host-lm-session=x'))).toBe(
      false,
    );
  });
});

describe('the session', () => {
  it('says who is signed in and hands over the access token', async () => {
    const cookie = await signIn();
    const res = await post('/api/auth/session', cookie);
    const body = (await res.json()) as SessionAnswer;
    expect(body).toMatchObject({
      available: true,
      signedIn: true,
      login: 'you',
      token: 'ghu_first',
      appSlug: 'layoutmaster-app',
      upstream: 'rafaelromao/layoutmaster',
    });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('answers signed out to a browser without a session, or with one it did not seal', async () => {
    expect(await (await post('/api/auth/session')).json()).toMatchObject({
      available: true,
      signedIn: false,
    });
    const forged = await post('/api/auth/session', '__Host-lm-session=bm90LWEtc2Vzc2lvbg');
    expect(await forged.json()).toMatchObject({ signedIn: false });
    expect(forged.headers.getSetCookie()[0]).toContain('Max-Age=0');
  });

  it('renews a token about to expire, and keeps the new refresh token', async () => {
    const cookie = await signIn();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 8 * 3600_000 - 60_000);

    const res = await post('/api/auth/session', cookie);
    expect(((await res.json()) as SessionAnswer).token).toBe('ghu_renewed');
    const refresh = calls.filter((c) => c.form?.get('grant_type') === 'refresh_token');
    expect(refresh).toHaveLength(1);
    expect(refresh[0].form?.get('refresh_token')).toBe('ghr_first');

    // The rotated cookie is what the next request holds; GitHub has already retired the old one.
    const next = await post('/api/auth/session', cookiesOf(res));
    expect(((await next.json()) as SessionAnswer).token).toBe('ghu_renewed');
    expect(calls.filter((c) => c.form?.get('grant_type') === 'refresh_token')).toHaveLength(1);
  });

  it('signs out when GitHub refuses the refresh token', async () => {
    const cookie = await signIn();
    responder = (call) =>
      call.url.endsWith('/access_token') ? json(200, { error: 'bad_refresh_token' }) : github(call);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 9 * 3600_000);

    const res = await post('/api/auth/session', cookie);
    expect(await res.json()).toMatchObject({ signedIn: false });
    expect(res.headers.getSetCookie()[0]).toContain('Max-Age=0');
  });

  it('turns away a request another site made', async () => {
    const res = await post('/api/auth/session', await signIn(), 'cross-site');
    expect(res.status).toBe(403);
  });

  it('says sign-in is unavailable where the app is not set up for it', async () => {
    const res = await post('/api/auth/session', '', 'same-origin', {});
    expect(await res.json()).toEqual({ available: false, signedIn: false });
  });
});

describe('signing out', () => {
  it('forgets the session and revokes the token', async () => {
    const cookie = await signIn();
    calls = [];
    const res = await post('/api/auth/logout', cookie);
    expect(res.status).toBe(204);
    expect(res.headers.getSetCookie()[0]).toMatch(/^__Host-lm-session=;.*Max-Age=0/);
    const revoke = calls.find((c) => c.method === 'DELETE');
    expect(revoke?.url).toBe('https://api.github.com/applications/Iv1.client/token');
    expect(revoke?.headers.get('Authorization')).toBe(`Basic ${btoa('Iv1.client:client-secret')}`);
  });
});

describe('the dev server on plain http', () => {
  it('drops the __Host- prefix and the Secure flag, which need https', async () => {
    const res = await handleAuth(new Request('http://localhost:5173/api/auth/login'), ENV);
    const [cookie] = res.headers.getSetCookie();
    expect(cookie).toMatch(/^lm-oauth=/);
    expect(cookie).not.toContain('Secure');
  });
});
