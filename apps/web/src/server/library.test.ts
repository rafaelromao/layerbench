import { generateKeyPairSync } from 'node:crypto';
import {
  BUNDLED_IDS,
  BUNDLED_LAYOUTS,
  keptInLibrary,
  type Layout,
  toCanonicalJson,
} from '@layerbench/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AuthEnv, handleAuth } from './github-auth.js';
import { type LibraryAnswer, OPEN_PROPOSALS } from './library.js';

const PAGE = 'https://app.example';
const AUTH = 'https://auth.example';
const API = 'https://api.github.com';
const REPO = `${API}/repos/rafaelromao/layerbench`;

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

/** A layout as LayerBench saves it, under an id, with an author. */
function doc(id: string, name: string, from = 'colemak'): Record<string, unknown> {
  const base = BUNDLED_LAYOUTS.find((l) => l.id === from) as Layout;
  return toCanonicalJson({ ...base, id, name, author: 'Ana' }) as unknown as Record<
    string,
    unknown
  >;
}

const decode = (content: unknown) =>
  new TextDecoder().decode(Uint8Array.from(atob(String(content)), (c) => c.charCodeAt(0)));

/**
 * The repository as GitHub keeps it, small: its branches' files, the pull requests open, and what
 * the signed-in user may do there.
 */
interface Repo {
  branches: Map<string, Map<string, string>>;
  pulls: {
    head: string;
    base: string;
    html_url: string;
    title: string;
    body: string;
    /** The repository a fork's pull request comes from. */
    fork?: string;
  }[];
  /** The user's permissions, as `GET /repos/{repo}` gives them to their token. */
  push: boolean;
}

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
  auth: string | null;
}

let repo: Repo;
let calls: Call[];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function github(call: Call): Response {
  const url = new URL(call.url);
  const path = url.pathname.replace('/repos/rafaelromao/layerbench', '');
  const { method, body } = call;
  if (url.pathname === '/user') {
    return call.auth === 'Bearer ghu_live' ? json(200, { login: 'you' }) : json(401, {});
  }
  if (call.url === REPO && method === 'GET') {
    return call.auth === 'Bearer ghu_live'
      ? json(200, { permissions: { admin: false, maintain: false, push: repo.push, pull: true } })
      : json(401, {});
  }
  if (path === '/installation') return json(200, { id: 99 });
  if (url.pathname === '/app/installations/99/access_tokens') {
    return json(201, { token: 'ghs_installation' });
  }
  if (call.auth !== 'Bearer ghs_installation') return json(401, {});

  if (path === '/pulls' && method === 'GET') {
    const head = url.searchParams.get('head')?.replace(/^rafaelromao:/, '');
    const base = url.searchParams.get('base');
    // Every one open, as GitHub lists them, when none is asked for by its branch: a page of them.
    if (head === undefined) {
      const page = Number(url.searchParams.get('page') ?? 1);
      const listed = repo.pulls.map((p) => ({
        ...p,
        head: { ref: p.head, repo: { full_name: p.fork ?? 'rafaelromao/layerbench' } },
      }));
      return json(200, listed.slice((page - 1) * 100, page * 100));
    }
    return json(
      200,
      repo.pulls.filter((p) => p.head === head && p.base === base),
    );
  }
  if (path === '/pulls' && method === 'POST') {
    const pull = {
      head: String(body?.head),
      base: String(body?.base),
      title: String(body?.title),
      body: String(body?.body),
      html_url: `https://github.com/rafaelromao/layerbench/pull/${repo.pulls.length + 100}`,
    };
    repo.pulls.push(pull);
    return json(201, pull);
  }
  const ref = /^\/git\/ref\/heads\/(.+)$/.exec(path);
  if (ref && method === 'GET') {
    return repo.branches.has(ref[1]) ? json(200, { object: { sha: ref[1] } }) : json(404, {});
  }
  if (path === '/git/refs' && method === 'POST') {
    const name = String(body?.ref).replace('refs/heads/', '');
    if (repo.branches.has(name)) return json(422, {});
    repo.branches.set(name, new Map(repo.branches.get(String(body?.sha))));
    return json(201, {});
  }
  const reset = /^\/git\/refs\/heads\/(.+)$/.exec(path);
  if (reset && method === 'PATCH') {
    repo.branches.set(reset[1], new Map(repo.branches.get(String(body?.sha))));
    return json(200, {});
  }
  const file = /^\/contents\/(.+)$/.exec(path);
  if (file) {
    const branch = method === 'GET' ? url.searchParams.get('ref') : String(body?.branch);
    const files = repo.branches.get(branch ?? '');
    if (!files) return json(404, {});
    const name = file[1];
    if (method === 'GET')
      return files.has(name) ? json(200, { sha: `sha-${name}` }) : json(404, {});
    if (method === 'PUT') {
      if (files.has(name) && body?.sha !== `sha-${name}`) return json(409, {});
      files.set(name, decode(body?.content));
      return json(files.size ? 201 : 200, { content: {} });
    }
    if (method === 'DELETE') {
      if (!files.has(name) || body?.sha !== `sha-${name}`) return json(409, {});
      files.delete(name);
      return json(200, { commit: {} });
    }
  }
  return json(404, {});
}

beforeEach(() => {
  calls = [];
  repo = {
    branches: new Map([
      ['main', new Map([['README.md', '# LayerBench\n']])],
      ['layerbench-data', new Map([['community/breeze.json', '{}\n']])],
    ]),
    pulls: [],
    push: false,
  };
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const raw = init?.body;
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      body: typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : null,
      auth: new Headers(init?.headers).get('Authorization'),
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

function post(path: string, body: unknown): Promise<Response> {
  return handleAuth(
    new Request(`${AUTH}/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: PAGE },
      body: JSON.stringify(body),
    }),
    ENV,
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

async function ask(route: 'propose' | 'maintain', body: Record<string, unknown>) {
  const session = await signIn();
  calls = [];
  const res = await post(route, { session, ...body });
  return { status: res.status, answer: (await res.json()) as LibraryAnswer };
}

/** What a branch holds at a path, as text, or the request on it read back. */
const fileOn = (branch: string, path: string) => repo.branches.get(branch)?.get(path);
const requestOn = (branch: string) => JSON.parse(fileOn(branch, '.library/request.json') ?? 'null');
const wrote = () => calls.some((c) => c.method !== 'GET' && c.url.startsWith(REPO));

describe('proposing a change to a bundled layout', () => {
  it('opens a pull request into main from a branch of its own, with the request for CI to apply', async () => {
    const layout = doc('colemak', 'Colemak');
    const { status, answer } = await ask('propose', {
      target: { kind: 'bundled', id: 'colemak' },
      layout,
    });
    expect(status).toBe(201);
    expect(answer).toEqual({ url: 'https://github.com/rafaelromao/layerbench/pull/100' });
    expect(requestOn('library/you/change/colemak')).toEqual({
      action: 'change',
      id: 'colemak',
      layout,
      by: 'you',
    });
    expect(repo.pulls[0]).toMatchObject({
      head: 'library/you/change/colemak',
      base: 'main',
      title: 'Library: change colemak',
    });
    expect(repo.pulls[0].body).toContain('@you');
  });

  it('commits the new request to the pull request while it is open, applied or not', async () => {
    await ask('propose', {
      target: { kind: 'bundled', id: 'colemak' },
      layout: doc('colemak', 'Colemak'),
    });
    const again = doc('colemak', 'Colemak 2');
    const { status, answer } = await ask('propose', {
      target: { kind: 'bundled', id: 'colemak' },
      layout: again,
    });
    expect([status, answer.reused]).toEqual([200, true]);
    expect(requestOn('library/you/change/colemak').layout).toEqual(again);
    // Once CI has applied it and taken it away, a new one goes on all the same.
    repo.branches.get('library/you/change/colemak')?.delete('.library/request.json');
    await ask('propose', {
      target: { kind: 'bundled', id: 'colemak' },
      layout: doc('colemak', 'Colemak 3'),
    });
    expect(requestOn('library/you/change/colemak').layout.name).toBe('Colemak 3');
    expect(repo.pulls).toHaveLength(1);
  });

  it('refuses a layout no bundled layout is, a layout under another id, and one signed out', async () => {
    const unknown = await ask('propose', {
      target: { kind: 'bundled', id: 'breeze' },
      layout: doc('breeze', 'Breeze'),
    });
    expect(unknown.status).toBe(422);
    const other = await ask('propose', {
      target: { kind: 'bundled', id: 'colemak' },
      layout: doc('graphite', 'Graphite'),
    });
    expect([other.status, other.answer.error]).toEqual([422, 'not accepted']);
    const res = await post('propose', {
      session: 'nonsense',
      target: { kind: 'bundled', id: 'colemak' },
      layout: doc('colemak', 'Colemak'),
    });
    expect(res.status).toBe(401);
    expect(wrote()).toBe(false);
  });
});

describe('how many changes one person proposes at once', () => {
  it('refuses one more than five open, and takes a new version of one of them', async () => {
    // Bundled layouts a request could never take away, nor those a delete takes on its branch.
    const ids = BUNDLED_IDS.filter((id) => keptInLibrary(id) === null).slice(0, OPEN_PROPOSALS + 1);
    // A fork's branches named as if they were someone's count for nobody.
    for (const id of ids) {
      repo.pulls.push({
        head: `library/you/change/${id}-fork`,
        base: 'main',
        html_url: 'https://github.com/rafaelromao/layerbench/pull/1',
        title: 'Not ours',
        body: '',
        fork: 'someone/layerbench',
      });
    }
    const forks = repo.pulls.length;
    const propose = (id: string) =>
      ask('propose', { target: { kind: 'bundled', id }, layout: doc(id, `${id} changed`) });
    for (const id of ids.slice(0, OPEN_PROPOSALS)) expect((await propose(id)).status).toBe(201);
    const over = await propose(ids[OPEN_PROPOSALS]);
    expect([over.status, over.answer.reason]).toEqual([
      429,
      'you have 5 changes proposed and open already; wait for one to be merged or closed',
    ]);
    expect(wrote()).toBe(false);
    expect((await propose(ids[0])).status).toBe(200);
    expect(repo.pulls).toHaveLength(forks + OPEN_PROPOSALS);
  });
});

describe('proposing a change to a community layout', () => {
  it('opens a pull request into layerbench-data that replaces its file', async () => {
    const layout = doc('breeze', 'Breeze');
    const { status } = await ask('propose', {
      target: { kind: 'community', id: 'breeze' },
      layout,
    });
    expect(status).toBe(201);
    expect(JSON.parse(fileOn('data/you/change/breeze', 'community/breeze.json') ?? '')).toEqual(
      layout,
    );
    expect(repo.pulls[0]).toMatchObject({
      head: 'data/you/change/breeze',
      base: 'layerbench-data',
      title: 'Community: change breeze',
    });
  });

  it('refuses a layout the community does not have', async () => {
    const { status } = await ask('propose', {
      target: { kind: 'community', id: 'gust' },
      layout: doc('gust', 'Gust'),
    });
    expect(status).toBe(404);
    expect(repo.pulls).toEqual([]);
  });
});

describe("a maintainer's change to the Library", () => {
  it('is refused to anyone GitHub does not let push, before anything is written', async () => {
    const { status, answer } = await ask('maintain', {
      action: 'delete',
      target: { kind: 'bundled', id: 'colemak' },
    });
    expect([status, answer.error]).toEqual([403, 'not a maintainer']);
    expect(wrote()).toBe(false);
    expect(calls.some((c) => c.url.endsWith('/access_tokens'))).toBe(false);
  });

  it('deletes a bundled layout by a request pull request, and a community one by deleting its file', async () => {
    repo.push = true;
    const bundled = await ask('maintain', {
      action: 'delete',
      target: { kind: 'bundled', id: 'colemak' },
    });
    expect(bundled.status).toBe(201);
    expect(requestOn('library/you/delete/colemak')).toEqual({
      action: 'delete',
      id: 'colemak',
      by: 'you',
    });
    const community = await ask('maintain', {
      action: 'delete',
      target: { kind: 'community', id: 'breeze' },
    });
    expect(community.status).toBe(201);
    expect(fileOn('data/you/delete/breeze', 'community/breeze.json')).toBeUndefined();
    expect(repo.pulls.map((p) => [p.base, p.title])).toEqual([
      ['main', 'Library: delete colemak'],
      ['layerbench-data', 'Community: delete breeze'],
    ]);
  });

  it('answers a delete asked again with its open pull request, committing nothing', async () => {
    repo.push = true;
    await ask('maintain', { action: 'delete', target: { kind: 'bundled', id: 'colemak' } });
    // CI applied the request and took it away; the same again it would refuse.
    repo.branches.get('library/you/delete/colemak')?.delete('.library/request.json');
    const again = await ask('maintain', {
      action: 'delete',
      target: { kind: 'bundled', id: 'colemak' },
    });
    expect([again.status, again.answer.reused, again.answer.unchanged]).toEqual([200, true, true]);
    expect(fileOn('library/you/delete/colemak', '.library/request.json')).toBeUndefined();
    expect(wrote()).toBe(false);
    expect(repo.pulls).toHaveLength(1);
  });

  it('promotes a custom or a community layout by a request pull request', async () => {
    repo.push = true;
    const custom = doc('gust', 'Gust');
    expect(
      (
        await ask('maintain', {
          action: 'promote',
          target: { kind: 'custom', id: 'gust' },
          layout: custom,
        })
      ).status,
    ).toBe(201);
    expect(requestOn('library/you/promote/gust')).toEqual({
      action: 'promote',
      id: 'gust',
      layout: custom,
      by: 'you',
    });
    const community = doc('breeze', 'Breeze');
    const moved = await ask('maintain', {
      action: 'promote',
      target: { kind: 'community', id: 'breeze' },
      layout: community,
    });
    expect(moved.status).toBe(201);
    expect(repo.pulls[1].body).toContain('community');
  });

  it('refuses to promote an id the Library has, or a custom one the community has', async () => {
    repo.push = true;
    const bundled = await ask('maintain', {
      action: 'promote',
      target: { kind: 'custom', id: 'colemak' },
      layout: doc('colemak', 'Colemak'),
    });
    expect(bundled.status).toBe(409);
    const taken = await ask('maintain', {
      action: 'promote',
      target: { kind: 'custom', id: 'breeze' },
      layout: doc('breeze', 'Breeze'),
    });
    expect(taken.status).toBe(409);
    expect(repo.pulls).toEqual([]);
  });

  it('refuses to delete a layout CI keeps, and anything else on the route but delete and promote', async () => {
    repo.push = true;
    const kept = await ask('maintain', {
      action: 'delete',
      target: { kind: 'bundled', id: 'qwerty' },
    });
    expect([kept.status, kept.answer.reason]).toEqual([
      422,
      'qwerty stays in the Library: the golden reports measure it',
    ]);
    const change = await ask('maintain', {
      action: 'change',
      target: { kind: 'bundled', id: 'colemak' },
      layout: doc('colemak', 'Colemak'),
    });
    expect(change.status).toBe(400);
    expect(wrote()).toBe(false);
    expect(repo.pulls).toEqual([]);
  });
});
