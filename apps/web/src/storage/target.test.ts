import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DATA_BRANCH, findStorageTarget } from './target.js';

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

let calls: Call[];
/** Answers by method and URL without the API's address; anything unlisted is a 404. */
let routes: Record<string, unknown>;

const API = 'https://api.github.com';
const UPSTREAM = 'rafaelromao/layoutmaster';
const access = { token: async () => 'secret-token' };

function repo(full_name: string, fork = true) {
  const [owner, name] = full_name.split('/');
  return { full_name, name, fork, owner: { login: owner } };
}

/** The user's installation of the app, with the repositories it was given. */
function installedOn(...repos: ReturnType<typeof repo>[]) {
  return {
    'GET /user/installations?per_page=100&page=1': { installations: [{ id: 7 }] },
    'GET /user/installations/7/repositories?per_page=100&page=1': { repositories: repos },
  };
}

/** A data branch that exists already, so no branch is created. */
function branchExists(full_name: string) {
  return { [`GET /repos/${full_name}/branches/${DATA_BRANCH}`]: { name: DATA_BRANCH } };
}

beforeEach(() => {
  calls = [];
  routes = {};
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null;
    calls.push({ url: input, method, body });
    const key = `${method} ${input.slice(API.length)}`;
    const answer = routes[key];
    if (answer instanceof Response) return answer;
    return answer === undefined
      ? new Response('{}', { status: 404 })
      : new Response(JSON.stringify(answer), { status: method === 'POST' ? 201 : 200 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('where a signed-in user’s documents go', () => {
  it('uses the upstream itself for its owner', async () => {
    routes = { ...installedOn(repo(UPSTREAM, false)), ...branchExists(UPSTREAM) };
    expect(await findStorageTarget(access, 'rafaelromao', UPSTREAM)).toEqual({
      kind: 'repo',
      repo: UPSTREAM,
      branch: DATA_BRANCH,
      path: 'data',
      upstream: true,
    });
  });

  it('uses a fork of the upstream that the user owns', async () => {
    routes = {
      ...installedOn(repo('you/dotfiles', false), repo('you/layoutmaster')),
      'GET /repos/you/layoutmaster': { fork: true, source: { full_name: UPSTREAM } },
      ...branchExists('you/layoutmaster'),
    };
    const target = await findStorageTarget(access, 'you', UPSTREAM);
    expect(target).toMatchObject({ kind: 'repo', repo: 'you/layoutmaster', upstream: false });
  });

  it('finds a fork that was renamed, and not a fork of something else', async () => {
    routes = {
      ...installedOn(repo('you/other-fork'), repo('you/my-layouts')),
      'GET /repos/you/other-fork': { fork: true, source: { full_name: 'someone/else' } },
      'GET /repos/you/my-layouts': { fork: true, source: { full_name: UPSTREAM } },
      ...branchExists('you/my-layouts'),
    };
    expect(await findStorageTarget(access, 'you', UPSTREAM)).toMatchObject({
      repo: 'you/my-layouts',
    });
  });

  it('makes the data branch from the default branch the first time', async () => {
    routes = {
      ...installedOn(repo('you/layoutmaster')),
      'GET /repos/you/layoutmaster': {
        fork: true,
        source: { full_name: UPSTREAM },
        default_branch: 'main',
      },
      'GET /repos/you/layoutmaster/git/ref/heads/main': { object: { sha: 'abc123' } },
      'POST /repos/you/layoutmaster/git/refs': { ref: `refs/heads/${DATA_BRANCH}` },
    };
    await findStorageTarget(access, 'you', UPSTREAM);
    const create = calls.find((c) => c.method === 'POST');
    expect(create?.body).toEqual({ ref: `refs/heads/${DATA_BRANCH}`, sha: 'abc123' });
  });

  it('leaves a data branch that exists alone', async () => {
    routes = {
      ...installedOn(repo('you/layoutmaster')),
      'GET /repos/you/layoutmaster': { fork: true, source: { full_name: UPSTREAM } },
      ...branchExists('you/layoutmaster'),
    };
    await findStorageTarget(access, 'you', UPSTREAM);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('falls back to gists when the app is installed nowhere', async () => {
    routes = { 'GET /user/installations?per_page=100&page=1': { installations: [] } };
    expect(await findStorageTarget(access, 'you', UPSTREAM)).toEqual({ kind: 'gist' });
  });

  it('points out a fork the app was not given', async () => {
    routes = {
      'GET /user/installations?per_page=100&page=1': { installations: [] },
      'GET /repos/you/layoutmaster': { fork: true, source: { full_name: UPSTREAM } },
    };
    expect(await findStorageTarget(access, 'you', UPSTREAM)).toEqual({
      kind: 'gist',
      forkWithoutAccess: 'you/layoutmaster',
    });
  });

  it('fails rather than guessing when GitHub cannot be asked', async () => {
    routes = {
      'GET /user/installations?per_page=100&page=1': new Response('{}', { status: 502 }),
    };
    await expect(findStorageTarget(access, 'you', UPSTREAM)).rejects.toThrow(
      'GitHub responded 502',
    );
  });
});
