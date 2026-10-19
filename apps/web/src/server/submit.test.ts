import { createVerify, generateKeyPairSync } from 'node:crypto';
import { BUNDLED_LAYOUTS, toCanonicalJson } from '@layerbench/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appJwt } from './github-app.js';
import { type AuthEnv, handleAuth } from './github-auth.js';
import { MAX_LAYOUT_BYTES, type SubmitAnswer } from './submit.js';

const PAGE = 'https://app.example';
const AUTH = 'https://auth.example';
const REPO = 'https://api.github.com/repos/rafaelromao/layerbench';

const keys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
});

const ENV: AuthEnv = {
  GITHUB_CLIENT_ID: 'Iv1.client',
  GITHUB_CLIENT_SECRET: 'client-secret',
  SESSION_SECRET: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
  ALLOWED_ORIGINS: PAGE,
  GITHUB_APP_ID: '12345',
  GITHUB_APP_PRIVATE_KEY: keys.privateKey,
};

/** A custom layout ready to submit: as LayerBench saves it, with an author and no link. */
function layout(changes: Record<string, unknown> = {}): Record<string, unknown> {
  const base = BUNDLED_LAYOUTS.find((l) => l.id === 'qwerty') ?? BUNDLED_LAYOUTS[0];
  return toCanonicalJson({
    ...base,
    id: 'my-layout',
    name: 'My `layout` @someone',
    author: 'Ana',
    description: 'Mine.',
    ...changes,
  }) as unknown as Record<string, unknown>;
}

interface Call {
  url: string;
  method: string;
  headers: Headers;
  body: Record<string, unknown> | null;
}

/** GitHub as Submit finds it: who the token is, what is open, what the branch holds. */
interface World {
  login: string;
  openPulls: { html_url: string }[];
  onBase: boolean;
  onBranch: boolean;
  branchExists: boolean;
  installed: boolean;
  /** What GitHub answers the request for an installation token, when not a token. */
  tokenStatus?: number;
  /** A step GitHub refuses, by method and path end. */
  refuse?: string;
}

let calls: Call[];
let world: World;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function github(call: Call): Response {
  const { url, method } = call;
  const path = url.replace(/\?.*$/, '');
  if (world.refuse && `${method} ${path.replace(REPO, '')}` === world.refuse) return json(500, {});
  if (path.endsWith('/user')) {
    return call.headers.get('Authorization') === 'Bearer ghu_live'
      ? json(200, { login: world.login })
      : json(401, {});
  }
  if (path === `${REPO}/installation`) {
    return world.installed ? json(200, { id: 99 }) : json(404, {});
  }
  if (path.endsWith('/app/installations/99/access_tokens') && method === 'POST') {
    if (world.tokenStatus) return json(world.tokenStatus, {});
    return json(201, { token: 'ghs_installation' });
  }
  if (!call.headers.get('Authorization')?.endsWith('ghs_installation')) return json(401, {});
  if (path === `${REPO}/pulls` && method === 'GET') return json(200, world.openPulls);
  if (path === `${REPO}/pulls` && method === 'POST') {
    return json(201, { html_url: 'https://github.com/rafaelromao/layerbench/pull/77' });
  }
  if (path === `${REPO}/contents/community/my-layout.json`) {
    if (method === 'PUT') return json(world.onBranch ? 200 : 201, { content: {} });
    const onBase = url.includes('ref=layerbench-data');
    return (onBase ? world.onBase : world.onBranch)
      ? json(200, { sha: 'file-sha' })
      : json(404, {});
  }
  if (path === `${REPO}/git/ref/heads/layerbench-data`) {
    return json(200, { object: { sha: 'base-sha' } });
  }
  if (path === `${REPO}/git/refs` && method === 'POST') {
    return world.branchExists ? json(422, {}) : json(201, {});
  }
  if (path === `${REPO}/git/refs/heads/submit/you/my-layout` && method === 'PATCH') {
    return json(200, {});
  }
  return json(404, {});
}

beforeEach(() => {
  calls = [];
  world = {
    login: 'you',
    openPulls: [],
    onBase: false,
    onBranch: false,
    branchExists: false,
    installed: true,
  };
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const raw = init?.body;
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : null,
    };
    calls.push(call);
    if (call.url.endsWith('/login/oauth/access_token')) {
      return json(200, {
        access_token: 'ghu_live',
        expires_in: 28_800,
        refresh_token: 'ghr_first',
        refresh_token_expires_in: 15_897_600,
      });
    }
    return github(call);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function post(path: string, body: unknown, env: AuthEnv = ENV): Promise<Response> {
  return handleAuth(
    new Request(`${AUTH}/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: PAGE },
      body: JSON.stringify(body),
    }),
    env,
  );
}

async function signIn(): Promise<string> {
  const res = await post('token', {
    code: 'the-code',
    verifier: 'v'.repeat(43),
    redirectUri: `${PAGE}/`,
  });
  return ((await res.json()) as { session: string }).session;
}

async function submitAs(session: string, doc: unknown = layout(), env: AuthEnv = ENV) {
  calls = [];
  const res = await post('submit', { session, layout: doc }, env);
  return { res, answer: (await res.json()) as SubmitAnswer };
}

const decode = (content: unknown) =>
  JSON.parse(
    new TextDecoder().decode(Uint8Array.from(atob(String(content)), (c) => c.charCodeAt(0))),
  );

describe('submitting a layout', () => {
  it('opens a pull request into layerbench-data that adds exactly that layout', async () => {
    const { res, answer } = await submitAs(await signIn());
    expect(res.status).toBe(201);
    expect(answer).toEqual({ url: 'https://github.com/rafaelromao/layerbench/pull/77' });

    const branch = calls.find((c) => c.url === `${REPO}/git/refs`);
    expect(branch?.body).toEqual({ ref: 'refs/heads/submit/you/my-layout', sha: 'base-sha' });

    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.url).toBe(`${REPO}/contents/community/my-layout.json`);
    expect(put?.body?.branch).toBe('submit/you/my-layout');
    expect(put?.body?.sha).toBeUndefined();
    expect(decode(put?.body?.content)).toEqual(layout());
    expect(put?.body?.message).toContain('Submitted by @you');

    const pull = calls.find((c) => c.method === 'POST' && c.url === `${REPO}/pulls`);
    expect(pull?.body).toMatchObject({ head: 'submit/you/my-layout', base: 'layerbench-data' });
    const text = String(pull?.body?.body);
    expect(text).toContain('submitted by @you');
    // The layout's own text, in code spans, mentions no one and cannot close the span.
    expect(text).toContain('`My layout @someone` by `Ana`');
  });

  it('acts as the App, with a JWT its key signed, and the installation token', async () => {
    await submitAs(await signIn());
    const installation = calls.find((c) => c.url === `${REPO}/installation`);
    const jwt = installation?.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const [header, claims, signature] = jwt.split('.');
    const verify = createVerify('RSA-SHA256');
    verify.update(`${header}.${claims}`);
    expect(verify.verify(keys.publicKey, Buffer.from(signature ?? '', 'base64url'))).toBe(true);
    expect(JSON.parse(Buffer.from(claims ?? '', 'base64url').toString())).toMatchObject({
      iss: '12345',
    });
    const writes = calls.filter((c) => c.method !== 'GET' && c.url.startsWith(REPO));
    for (const write of writes) {
      expect(write.headers.get('Authorization')).toBe('Bearer ghs_installation');
    }
  });

  it('updates the open pull request of the same submitter and layout instead of opening another', async () => {
    const session = await signIn();
    world.openPulls = [{ html_url: 'https://github.com/rafaelromao/layerbench/pull/5' }];
    world.onBranch = true;
    const { res, answer } = await submitAs(session);
    expect(res.status).toBe(200);
    expect(answer).toEqual({
      url: 'https://github.com/rafaelromao/layerbench/pull/5',
      reused: true,
    });
    const lookup = calls.find((c) => c.method === 'GET' && c.url.startsWith(`${REPO}/pulls`));
    expect(new URL(lookup?.url ?? '').searchParams.get('head')).toBe(
      'rafaelromao:submit/you/my-layout',
    );
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.body).toMatchObject({ branch: 'submit/you/my-layout', sha: 'file-sha' });
    expect(calls.some((c) => c.method === 'POST' && c.url.startsWith(REPO))).toBe(false);
  });

  it('starts over a branch left from a closed submission', async () => {
    const session = await signIn();
    world.branchExists = true;
    const { res } = await submitAs(session);
    expect(res.status).toBe(201);
    const reset = calls.find((c) => c.method === 'PATCH');
    expect(reset?.body).toEqual({ sha: 'base-sha', force: true });
  });

  it('refuses an id a community layout already has', async () => {
    const session = await signIn();
    world.onBase = true;
    const { res, answer } = await submitAs(session);
    expect(res.status).toBe(409);
    expect(answer.reason).toContain('already has the id "my-layout"');
    expect(calls.some((c) => c.method !== 'GET' && c.url.startsWith(REPO))).toBe(false);
  });

  it("refuses a bundled layout's id, without asking GitHub", async () => {
    const session = await signIn();
    const { res, answer } = await submitAs(session, layout({ id: 'qwerty' }));
    expect(res.status).toBe(422);
    expect(answer.reason).toBe('a bundled layout already has the id "qwerty"');
    expect(calls).toEqual([]);
  });

  it('refuses a layout without an author, or with a link that is no http(s) URL, without asking GitHub', async () => {
    const session = await signIn();
    const cases: [Record<string, unknown>, RegExp][] = [
      [layout({ author: '' }), /no author/],
      [layout({ link: 'example.com/mine' }), /not a layout.*http/],
    ];
    for (const [doc, reason] of cases) {
      const { res, answer } = await submitAs(session, doc);
      expect(res.status).toBe(422);
      expect(answer.reason).toMatch(reason);
      expect(calls).toEqual([]);
    }
  });

  it('refuses what is not a layout as LayerBench saves it, or is too large', async () => {
    const session = await signIn();
    const { name, ...rest } = layout();
    const cases: unknown[] = [
      null,
      [],
      { ...layout(), id: '../escape' },
      { name, ...rest },
      { ...layout(), name: 'x'.repeat(MAX_LAYOUT_BYTES) },
      layout({ geometry: { preset: 'no-such-board' } }),
    ];
    for (const doc of cases) {
      const { res } = await submitAs(session, doc);
      expect([400, 422]).toContain(res.status);
      expect(calls).toEqual([]);
    }
  });

  it('asks a page without a good session to sign in', async () => {
    const { res, answer } = await submitAs('not-a-session');
    expect(res.status).toBe(401);
    expect(answer.error).toBe('signed out');
  });

  it('refuses a session whose token GitHub no longer honours', async () => {
    const session = await signIn();
    world.login = 'someone-else';
    const { res } = await submitAs(session);
    expect(res.status).toBe(401);
    expect(calls.some((c) => c.url.startsWith(REPO))).toBe(false);
  });

  it('says Submit is not set up without the App, or where it is not installed', async () => {
    const session = await signIn();
    const { GITHUB_APP_PRIVATE_KEY: _, ...noKey } = ENV;
    expect((await submitAs(session, layout(), noKey)).res.status).toBe(503);
    const { SESSION_SECRET: __, ...noSignIn } = ENV;
    expect((await submitAs(session, layout(), noSignIn)).res.status).toBe(503);
    expect(
      (await submitAs(session, layout(), { ...ENV, GITHUB_APP_PRIVATE_KEY: 'not a key' })).res
        .status,
    ).toBe(503);
    world.installed = false;
    expect((await submitAs(session)).res.status).toBe(503);
  });

  it('asks for a token for this repository alone, and tells a GitHub failure from no set-up', async () => {
    const session = await signIn();
    await submitAs(session);
    const asked = calls.find((c) => c.url.endsWith('/access_tokens'));
    expect(asked?.body).toEqual({
      repositories: ['layerbench'],
      permissions: { contents: 'write', pull_requests: 'write' },
    });
    world.tokenStatus = 403;
    expect((await submitAs(session)).res.status).toBe(503);
    world.tokenStatus = 500;
    expect((await submitAs(session)).answer).toEqual({ error: 'GitHub could not be reached' });
  });

  it('says GitHub refused, never what it answered, when a step fails', async () => {
    const session = await signIn();
    for (const refuse of ['POST /pulls', 'PUT /contents/community/my-layout.json', 'GET /pulls']) {
      world.refuse = refuse;
      const { res, answer } = await submitAs(session);
      expect(res.status).toBe(502);
      expect(answer).toEqual({ error: 'GitHub refused the submission' });
    }
    world.refuse = 'GET /contents/community/my-layout.json';
    expect((await submitAs(session)).res.status).toBe(502);
  });

  it('says GitHub could not be reached when it cannot', async () => {
    const session = await signIn();
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('network down');
    });
    const { res, answer } = await submitAs(session);
    expect(res.status).toBe(502);
    expect(answer.error).toBe('GitHub could not be reached');
  });
});

describe("the App's key", () => {
  it('signs with a PKCS#8 key as well, and with line breaks written as \\n', async () => {
    const pkcs8 = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    }).privateKey;
    expect(await appJwt({ appId: '1', privateKey: pkcs8 })).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(await appJwt({ appId: '1', privateKey: keys.privateKey.replace(/\n/g, '\\n') })).toMatch(
      /^[\w-]+\.[\w-]+\.[\w-]+$/,
    );
  });

  it('refuses a key that is not one', async () => {
    expect(await appJwt({ appId: '1', privateKey: 'nonsense' })).toBeNull();
    const broken = '-----BEGIN PRIVATE KEY-----\n!!!\n-----END PRIVATE KEY-----';
    expect(await appJwt({ appId: '1', privateKey: broken })).toBeNull();
    const wrong = '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----';
    expect(await appJwt({ appId: '1', privateKey: wrong })).toBeNull();
  });
});
