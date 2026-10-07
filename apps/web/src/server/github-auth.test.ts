import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AuthEnv, handleAuth, type SessionAnswer } from './github-auth.js';

/** The app's pages, on a site of their own. */
const PAGE = 'https://app.example';
/** Where the sign-in server answers. */
const AUTH = 'https://auth.example';
/** What a page's PKCE verifier looks like: 32 random bytes in base64url. */
const VERIFIER = 'v'.repeat(43);

const ENV: AuthEnv = {
  GITHUB_CLIENT_ID: 'Iv1.client',
  GITHUB_CLIENT_SECRET: 'client-secret',
  GITHUB_APP_SLUG: 'layerbench-app',
  SESSION_SECRET: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
  ALLOWED_ORIGINS: PAGE,
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

interface Options {
  origin?: string | null;
  type?: string;
  env?: AuthEnv;
  at?: string;
}

/** A page's request, the way a browser sends it: with its origin, and a JSON body. */
function post(path: string, body: unknown, options: Options = {}): Promise<Response> {
  const { origin = PAGE, type = 'application/json', env = ENV, at = AUTH } = options;
  const headers: Record<string, string> = { 'Content-Type': type };
  if (origin) headers.Origin = origin;
  return handleAuth(
    new Request(`${at}/api/auth/${path}`, {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    env,
  );
}

function preflight(origin: string): Promise<Response> {
  return handleAuth(
    new Request(`${AUTH}/api/auth/session`, {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
    }),
    ENV,
  );
}

async function answerOf(res: Response): Promise<SessionAnswer> {
  return (await res.json()) as SessionAnswer;
}

/** Through GitHub and back: the sealed session a signed-in page keeps. */
async function signIn(): Promise<string> {
  const res = await post('token', {
    code: 'the-code',
    verifier: VERIFIER,
    redirectUri: `${PAGE}/`,
  });
  return (await answerOf(res)).session as string;
}

describe('signing in', () => {
  it('trades the code with the secret and the verifier, and seals the tokens for the page', async () => {
    const res = await post('token', {
      code: 'the-code',
      verifier: VERIFIER,
      redirectUri: `${PAGE}/`,
    });

    expect(res.status).toBe(200);
    const body = await answerOf(res);
    expect(body).toMatchObject({
      available: true,
      signedIn: true,
      login: 'you',
      token: 'ghu_first',
      clientId: 'Iv1.client',
    });
    expect(body.session).toMatch(/^[\w-]+$/);
    expect(body.session).not.toContain('ghu_');
    expect(body.session).not.toContain('ghr_');

    const exchange = calls.find((c) => c.url.endsWith('/login/oauth/access_token'));
    expect(exchange?.form?.get('client_secret')).toBe('client-secret');
    expect(exchange?.form?.get('code')).toBe('the-code');
    expect(exchange?.form?.get('code_verifier')).toBe(VERIFIER);
    expect(exchange?.form?.get('redirect_uri')).toBe(`${PAGE}/`);
    expect(calls.find((c) => c.url.endsWith('/user'))?.headers.get('User-Agent')).toBeTruthy();

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PAGE);
    expect(res.headers.get('Vary')).toBe('Origin');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it('turns away a way back to another site, without asking GitHub', async () => {
    const res = await post('token', {
      code: 'the-code',
      verifier: VERIFIER,
      redirectUri: 'https://elsewhere.example/',
    });
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('turns away a verifier PKCE could not have made, without asking GitHub', async () => {
    const res = await post('token', {
      code: 'the-code',
      verifier: 'short',
      redirectUri: `${PAGE}/`,
    });
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('reports a code GitHub refuses, which it answers with 200 and an error', async () => {
    responder = (call) =>
      call.url.endsWith('/access_token')
        ? json(200, { error: 'bad_verification_code' })
        : github(call);
    const res = await post('token', { code: 'c', verifier: VERIFIER, redirectUri: `${PAGE}/` });
    const body = await answerOf(res);
    expect(body).toMatchObject({ available: true, signedIn: false, clientId: 'Iv1.client' });
    expect(body.session).toBeUndefined();
  });

  it('says GitHub could not be reached, in an answer the page can read', async () => {
    responder = () => {
      throw new TypeError('fetch failed');
    };
    const res = await post('token', { code: 'c', verifier: VERIFIER, redirectUri: `${PAGE}/` });
    expect(res.status).toBe(502);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PAGE);
  });
});

describe('who may ask', () => {
  it("answers the app's preflight, letting it send JSON", async () => {
    const res = await preflight(PAGE);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PAGE);
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('7200');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });

  it('turns away another site, at the preflight and after it, without asking GitHub', async () => {
    const before = await preflight('https://evil.example');
    expect(before.status).toBe(403);
    expect(before.headers.get('Access-Control-Allow-Origin')).toBeNull();

    const after = await post(
      'session',
      { session: await signIn() },
      { origin: 'https://evil.example' },
    );
    expect(after.status).toBe(403);
    expect(after.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(calls.filter((c) => c.form?.get('grant_type'))).toEqual([]);
  });

  it('turns away a request that names no origin, or carries anything but a JSON object', async () => {
    expect((await post('session', {}, { origin: null })).status).toBe(403);
    expect((await post('session', {}, { origin: 'null' })).status).toBe(403);

    const text = await post('session', '{}', { type: 'text/plain' });
    expect(text.status).toBe(415);
    expect(text.headers.get('Access-Control-Allow-Origin')).toBe(PAGE);

    expect((await post('session', '[]')).status).toBe(400);
    expect((await post('session', 'not json')).status).toBe(400);
    expect((await post('session', { session: 'x'.repeat(9000) })).status).toBe(400);
  });

  it("answers the dev server's pages, which share its origin", async () => {
    const dev = 'http://localhost:4011';
    const res = await post(
      'session',
      {},
      { origin: dev, at: dev, env: { ...ENV, ALLOWED_ORIGINS: undefined } },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(dev);
  });

  it('answers nothing it does not serve', async () => {
    expect((await post('login', {})).status).toBe(404);
    const get = await handleAuth(
      new Request(`${AUTH}/api/auth/session`, { headers: { Origin: PAGE } }),
      ENV,
    );
    expect(get.status).toBe(404);
  });
});

describe('the session', () => {
  it('says who is signed in and hands over the access token', async () => {
    const session = await signIn();
    const res = await post('session', { session });
    const body = await answerOf(res);
    expect(body).toMatchObject({
      available: true,
      signedIn: true,
      login: 'you',
      token: 'ghu_first',
      clientId: 'Iv1.client',
      appSlug: 'layerbench-app',
      upstream: 'rafaelromao/layerbench',
    });
    // Nothing changed, so there is no new session to keep.
    expect(body.session).toBeUndefined();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('answers signed out to a page without a session, or with one it did not seal', async () => {
    expect(await answerOf(await post('session', {}))).toEqual({
      available: true,
      signedIn: false,
      clientId: 'Iv1.client',
      appSlug: 'layerbench-app',
      upstream: 'rafaelromao/layerbench',
    });
    const forged = await post('session', { session: 'bm90LWEtc2Vzc2lvbg' });
    expect(await answerOf(forged)).toMatchObject({ signedIn: false });
  });

  it('renews a token about to expire, and hands back the session to keep', async () => {
    const session = await signIn();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 8 * 3600_000 - 60_000);

    const body = await answerOf(await post('session', { session }));
    expect(body.token).toBe('ghu_renewed');
    expect(body.session).toBeTruthy();
    expect(body.session).not.toBe(session);
    const refresh = calls.filter((c) => c.form?.get('grant_type') === 'refresh_token');
    expect(refresh).toHaveLength(1);
    expect(refresh[0].form?.get('refresh_token')).toBe('ghr_first');

    // The renewed session is the one the page holds next; GitHub has already retired the old one.
    const next = await answerOf(await post('session', { session: body.session }));
    expect(next.token).toBe('ghu_renewed');
    expect(calls.filter((c) => c.form?.get('grant_type') === 'refresh_token')).toHaveLength(1);
  });

  it('signs out when GitHub refuses the refresh token', async () => {
    const session = await signIn();
    responder = (call) =>
      call.url.endsWith('/access_token') ? json(200, { error: 'bad_refresh_token' }) : github(call);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 9 * 3600_000);

    expect(await answerOf(await post('session', { session }))).toMatchObject({ signedIn: false });
  });

  it('keeps the session when GitHub cannot be reached to renew it', async () => {
    const session = await signIn();
    responder = () => {
      throw new TypeError('fetch failed');
    };
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 9 * 3600_000);

    const res = await post('session', { session });
    expect(res.status).toBe(502);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PAGE);
  });

  it('forgets a session after half a year, even one whose token never expires', async () => {
    responder = (call) =>
      call.url.endsWith('/access_token')
        ? json(200, { access_token: 'ghu_forever', token_type: 'bearer' })
        : github(call);
    const session = await signIn();
    expect(await answerOf(await post('session', { session }))).toMatchObject({
      signedIn: true,
      token: 'ghu_forever',
      expiresAt: null,
    });

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 181 * 24 * 3600_000);
    expect(await answerOf(await post('session', { session }))).toMatchObject({ signedIn: false });
  });

  it('renews at once a token GitHub turned down, however long it had left', async () => {
    const session = await signIn();
    const body = await answerOf(await post('session', { session, renew: true }));
    expect(body).toMatchObject({ signedIn: true, token: 'ghu_renewed' });
    expect(body.session).toBeTruthy();
    expect(body.session).not.toBe(session);
    const refresh = calls.filter((c) => c.form?.get('grant_type') === 'refresh_token');
    expect(refresh).toHaveLength(1);
    expect(refresh[0].form?.get('refresh_token')).toBe('ghr_first');
  });

  it('signs out when GitHub refuses to renew a token it turned down', async () => {
    const session = await signIn();
    responder = (call) =>
      call.url.endsWith('/access_token') ? json(200, { error: 'bad_refresh_token' }) : github(call);
    expect(await answerOf(await post('session', { session, renew: true }))).toMatchObject({
      signedIn: false,
    });
  });

  it('signs out when GitHub turned down a token that cannot be renewed', async () => {
    responder = (call) =>
      call.url.endsWith('/access_token')
        ? json(200, { access_token: 'ghu_forever', token_type: 'bearer' })
        : github(call);
    const session = await signIn();
    calls = [];
    expect(await answerOf(await post('session', { session, renew: true }))).toMatchObject({
      signedIn: false,
    });
    expect(calls).toEqual([]);
  });

  it('says sign-in is unavailable where it is not set up', async () => {
    const res = await post('session', {}, { env: { ALLOWED_ORIGINS: PAGE } });
    expect(await answerOf(res)).toEqual({ available: false, signedIn: false });
  });
});

describe('signing out', () => {
  it('revokes the token', async () => {
    const session = await signIn();
    calls = [];
    const res = await post('logout', { session });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PAGE);
    const revoke = calls.find((c) => c.method === 'DELETE');
    expect(revoke?.url).toBe('https://api.github.com/applications/Iv1.client/token');
    expect(revoke?.headers.get('Authorization')).toBe(`Basic ${btoa('Iv1.client:client-secret')}`);
  });
});
