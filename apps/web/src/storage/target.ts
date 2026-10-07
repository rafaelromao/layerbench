import { API, type GitHubAccess, gitHubFetch } from './github-api.js';

/** Saves to a copy of layerbench are commits on this branch, so its main branch stays as it is. */
export const DATA_BRANCH = 'layerbench-data';

/** Where a signed-in user's documents go. */
export type StorageTarget =
  | { kind: 'repo'; repo: string; branch: string; upstream: boolean }
  | {
      kind: 'gist';
      /** A fork that exists but that the app has not been given, so the dialog can say so. */
      forkWithoutAccess?: string;
    };

/** Pages of installations or repositories read at most; a hundred each. */
const MAX_PAGES = 10;

interface Repo {
  full_name: string;
  name: string;
  fork: boolean;
  owner: { login: string };
}

function isRepo(value: unknown): value is Repo {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.full_name === 'string' &&
    typeof o.name === 'string' &&
    typeof o.fork === 'boolean' &&
    !!o.owner &&
    typeof (o.owner as Record<string, unknown>).login === 'string'
  );
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const repoUrl = (fullName: string) =>
  `${API}/repos/${fullName.split('/').map(encodeURIComponent).join('/')}`;

async function getJson(access: GitHubAccess, url: string): Promise<unknown> {
  const res = await gitHubFetch(access, url);
  if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
  return res.json();
}

/** Every item of a paginated list that wraps its items in an object, such as `{installations}`. */
async function paged(access: GitHubAccess, url: string, key: string): Promise<unknown[]> {
  const items: unknown[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = (await getJson(access, `${url}?per_page=100&page=${page}`)) as Record<
      string,
      unknown
    >;
    const batch = Array.isArray(body?.[key]) ? (body[key] as unknown[]) : [];
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return items;
}

/** Whether the repository was forked, however indirectly, from `upstream`. */
async function forkOf(access: GitHubAccess, fullName: string, upstream: string): Promise<boolean> {
  const repo = (await getJson(access, repoUrl(fullName))) as {
    fork?: unknown;
    source?: { full_name?: unknown };
  };
  return (
    repo.fork === true &&
    typeof repo.source?.full_name === 'string' &&
    same(repo.source.full_name, upstream)
  );
}

/** The data branch, made from the default branch the first time, so what is on it comes along. */
export async function ensureDataBranch(access: GitHubAccess, repo: string): Promise<void> {
  const base = repoUrl(repo);
  const branch = await gitHubFetch(access, `${base}/branches/${encodeURIComponent(DATA_BRANCH)}`);
  if (branch.ok) return;
  if (branch.status !== 404) throw new Error(`GitHub responded ${branch.status}`);

  const { default_branch } = (await getJson(access, base)) as { default_branch?: unknown };
  if (typeof default_branch !== 'string') throw new Error('GitHub named no default branch');
  const ref = (await getJson(
    access,
    `${base}/git/ref/heads/${default_branch.split('/').map(encodeURIComponent).join('/')}`,
  )) as { object?: { sha?: unknown } };
  if (typeof ref.object?.sha !== 'string') throw new Error('GitHub named no commit for the branch');

  const created = await gitHubFetch(access, `${base}/git/refs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: `refs/heads/${DATA_BRANCH}`, sha: ref.object.sha }),
  });
  // Another tab may have made it a moment ago.
  if (!created.ok && created.status !== 422) throw new Error(`GitHub responded ${created.status}`);
}

/**
 * Where to keep a signed-in user's documents: their own copy of layerbench when the app may write
 * to it — the upstream itself for its owner, otherwise a fork they own — and secret gists when not.
 *
 * Only repositories the app is installed on are writable with the user's token, so they are looked
 * for among the installations' repositories rather than among everything the user can see.
 */
export async function findStorageTarget(
  access: GitHubAccess,
  login: string,
  upstream: string,
): Promise<StorageTarget> {
  const repos: Repo[] = [];
  const installations = await paged(access, `${API}/user/installations`, 'installations');
  for (const installation of installations) {
    const id = (installation as { id?: unknown })?.id;
    if (typeof id !== 'number') continue;
    const items = await paged(
      access,
      `${API}/user/installations/${id}/repositories`,
      'repositories',
    );
    repos.push(...items.filter(isRepo));
  }

  const upstreamName = upstream.split('/')[1] ?? '';
  let chosen: { repo: string; upstream: boolean } | null = null;

  const own = repos.find((r) => same(r.full_name, upstream));
  if (own) chosen = { repo: own.full_name, upstream: true };

  if (!chosen) {
    const candidates = repos
      .filter((r) => r.fork && same(r.owner.login, login))
      // A fork keeps the upstream's name unless it was renamed, so that one is asked about first.
      .sort((a, b) => Number(same(b.name, upstreamName)) - Number(same(a.name, upstreamName)));
    for (const candidate of candidates) {
      if (await forkOf(access, candidate.full_name, upstream)) {
        chosen = { repo: candidate.full_name, upstream: false };
        break;
      }
    }
  }

  if (chosen) {
    await ensureDataBranch(access, chosen.repo);
    return { kind: 'repo', branch: DATA_BRANCH, ...chosen };
  }

  // A public fork the app cannot write to is still visible, which is worth telling the user.
  const guess = `${login}/${upstreamName}`;
  const visible = await forkOf(access, guess, upstream).catch(() => false);
  return visible ? { kind: 'gist', forkWithoutAccess: guess } : { kind: 'gist' };
}
