/**
 * The steps every pull request the sign-in server opens is made of, as the GitHub App, in the one
 * repository it is installed on: find the one open from a branch, start that branch from another,
 * put and delete files on it, open the pull request. Submit, a proposed change and a maintainer's
 * change to the Library each put these together their own way.
 */

/** The repository the App is installed on. */
export const LIBRARY_REPO = 'rafaelromao/layerbench';

const API = 'https://api.github.com';
const USER_AGENT = 'LayerBench';

export interface Answer {
  status: number;
  data: Record<string, unknown> | Record<string, unknown>[] | null;
}

/** A call to the repository's part of GitHub's API, as the App. */
export type GitHub = (method: string, path: string, body?: unknown) => Promise<Answer>;

export function client(token: string): GitHub {
  return async (method, path, body) => {
    const res = await fetch(`${API}/repos/${LIBRARY_REPO}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': USER_AGENT,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as Answer['data'];
    return { status: res.status, data };
  };
}

/** Raised when GitHub answers a step with something unexpected; the page is told only that. */
export class GitHubRefused extends Error {}

export function expect(answer: Answer, ...ok: number[]): Record<string, unknown> {
  if (!ok.includes(answer.status) || !answer.data || Array.isArray(answer.data)) {
    throw new GitHubRefused(`GitHub answered ${answer.status}`);
  }
  return answer.data;
}

/** Text from a layout, safe inside a code span: one line, no backticks, not too long. */
export function codeSpan(text: string): string {
  const plain = text
    .replace(/[`\s]+/g, ' ')
    .trim()
    .slice(0, 80);
  return `\`${plain || '?'}\``;
}

export function base64Utf8(text: string): string {
  let binary = '';
  for (const b of new TextEncoder().encode(text)) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** The pull request open from `branch` into `base`, if there is one: its address. */
export async function openPull(gh: GitHub, base: string, branch: string): Promise<string | null> {
  const owner = LIBRARY_REPO.split('/')[0];
  const open = await gh(
    'GET',
    `/pulls?state=open&base=${base}&head=${encodeURIComponent(`${owner}:${branch}`)}`,
  );
  if (open.status !== 200 || !Array.isArray(open.data)) {
    throw new GitHubRefused(`GitHub answered ${open.status}`);
  }
  const url = open.data[0]?.html_url;
  return typeof url === 'string' ? url : null;
}

/** Whether `path` is on `ref`; anything but yes or no is GitHub refusing. */
export async function exists(gh: GitHub, path: string, ref: string): Promise<boolean> {
  const found = await gh('GET', `/contents/${path}?ref=${encodeURIComponent(ref)}`);
  if (found.status === 200) return true;
  if (found.status === 404) return false;
  throw new GitHubRefused(`GitHub answered ${found.status}`);
}

/** `branch`, made from `base` as it is now; one left from a closed pull request starts over. */
export async function startBranch(gh: GitHub, base: string, branch: string): Promise<void> {
  const head = expect(await gh('GET', `/git/ref/heads/${base}`), 200);
  const sha = (head.object as { sha?: unknown } | undefined)?.sha;
  if (typeof sha !== 'string') throw new GitHubRefused('no base commit');
  const created = await gh('POST', '/git/refs', { ref: `refs/heads/${branch}`, sha });
  if (created.status === 422) {
    expect(await gh('PATCH', `/git/refs/heads/${branch}`, { sha, force: true }), 200);
  } else expect(created, 201);
}

/** A file's text to put, or `null` to delete it. */
export type FileChange = [path: string, text: string | null];

/** Each change committed to `branch`: put over what is there, or deleted if it is there. */
export async function commitFiles(
  gh: GitHub,
  branch: string,
  changes: readonly FileChange[],
  message: string,
): Promise<void> {
  for (const [path, text] of changes) {
    const current = await gh('GET', `/contents/${path}?ref=${encodeURIComponent(branch)}`);
    if (current.status !== 200 && current.status !== 404) {
      throw new GitHubRefused(`GitHub answered ${current.status}`);
    }
    const found =
      current.status === 200 && current.data && !Array.isArray(current.data)
        ? current.data.sha
        : undefined;
    const sha = typeof found === 'string' ? { sha: found } : {};
    if (text === null) {
      if (!sha.sha) continue;
      expect(await gh('DELETE', `/contents/${path}`, { message, branch, ...sha }), 200);
    } else {
      expect(
        await gh('PUT', `/contents/${path}`, {
          message,
          content: base64Utf8(text),
          branch,
          ...sha,
        }),
        200,
        201,
      );
    }
  }
}

/**
 * The changes, on a pull request from `branch` into `base`: committed to the one open, or to the
 * branch started over from `base`, with a new pull request. Its address, and whether it was open.
 */
export async function openOrUpdate(
  gh: GitHub,
  pull: {
    base: string;
    branch: string;
    changes: readonly FileChange[];
    message: string;
    title: string;
    body: string;
  },
): Promise<{ url: string; reused: boolean }> {
  const { base, branch, changes, message } = pull;
  const open = await openPull(gh, base, branch);
  if (open) {
    await commitFiles(gh, branch, changes, message);
    return { url: open, reused: true };
  }
  await startBranch(gh, base, branch);
  await commitFiles(gh, branch, changes, message);
  return { url: await createPull(gh, pull), reused: false };
}

/** The pull request from `branch` into `base`: its address. */
export async function createPull(
  gh: GitHub,
  pull: { base: string; branch: string; title: string; body: string },
): Promise<string> {
  const made = expect(
    await gh('POST', '/pulls', {
      title: pull.title,
      head: pull.branch,
      base: pull.base,
      body: pull.body,
    }),
    201,
  );
  if (typeof made.html_url !== 'string') throw new GitHubRefused('no pull request');
  return made.html_url;
}
