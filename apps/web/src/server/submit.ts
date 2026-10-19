// By path rather than by package: Vite bundles the dev server's config with what it imports by
// path, but leaves a package to Node, which cannot follow core's `.js` imports to its `.ts` files.
import { compileLayout } from '../../../../packages/core/src/layout/compile.js';
import { documentLayout } from '../../../../packages/core/src/layouts/documents.js';
import { isDocumentId } from '../../../../packages/core/src/storage/ids.js';

/**
 * Submit: a signed-in user's custom layout, proposed as a community layout by a pull request into
 * the `layerbench-data` branch that adds it as `community/<id>.json`. The App opens it, with its
 * installation's token (`github-app.ts`), on a branch named for the submitter and the layout; the
 * maintainer's merge is the acceptance, and the branch's index workflow then lists it.
 *
 * Everything in the layout is untrusted: it is checked as the app checks a community file before
 * GitHub is asked anything, kept to a size, and none of its text reaches the pull request except
 * inside code spans, where a mention notifies no one.
 */

/** The repository the App is installed on, and the branch community layouts live on. */
export const SUBMIT_REPO = 'rafaelromao/layerbench';
export const SUBMIT_BASE = 'layerbench-data';
/** A layout as LayerBench saves it; the largest bundled one is about 10 KB. */
export const MAX_LAYOUT_BYTES = 64 * 1024;

const API = 'https://api.github.com';
const USER_AGENT = 'LayerBench';

/** What `submit` answers. */
export interface SubmitAnswer {
  /** The pull request. */
  url?: string;
  /** The submitter's open pull request for this layout was updated rather than a new one opened. */
  reused?: boolean;
  error?: string;
  /** Why the layout was refused, for the page to show. */
  reason?: string;
}

export interface SubmitResult {
  status: number;
  answer: SubmitAnswer;
}

/** The layout a submission carries, checked; or why it is refused. */
export function checkSubmission(
  doc: unknown,
): { ok: true; id: string; name: string; author: string } | { ok: false; reason: string } {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, reason: 'no layout was sent' };
  }
  if (new TextEncoder().encode(JSON.stringify(doc)).length > MAX_LAYOUT_BYTES) {
    return { ok: false, reason: `the layout is larger than ${MAX_LAYOUT_BYTES / 1024} KB` };
  }
  const id = (doc as { id?: unknown }).id;
  if (typeof id !== 'string' || !isDocumentId(id)) {
    return { ok: false, reason: 'the layout has no usable id' };
  }
  try {
    const layout = documentLayout(id, doc);
    compileLayout(layout);
    return { ok: true, id, name: layout.name, author: layout.author ?? '' };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** Text from the layout, safe inside a code span: one line, no backticks, not too long. */
function codeSpan(text: string): string {
  const plain = text
    .replace(/[`\s]+/g, ' ')
    .trim()
    .slice(0, 80);
  return `\`${plain || '?'}\``;
}

function base64Utf8(text: string): string {
  let binary = '';
  for (const b of new TextEncoder().encode(text)) binary += String.fromCharCode(b);
  return btoa(binary);
}

interface Answer {
  status: number;
  data: Record<string, unknown> | Record<string, unknown>[] | null;
}

function client(token: string) {
  return async (method: string, path: string, body?: unknown): Promise<Answer> => {
    const res = await fetch(`${API}/repos/${SUBMIT_REPO}${path}`, {
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
class GitHubRefused extends Error {}

function expect(answer: Answer, ...ok: number[]): Record<string, unknown> {
  if (!ok.includes(answer.status) || !answer.data || Array.isArray(answer.data)) {
    throw new GitHubRefused(`GitHub answered ${answer.status}`);
  }
  return answer.data;
}

/**
 * Open (or update) the submission of a layout `checkSubmission` passed, as `login`, with the App's
 * installation token. One pull request per submitter and layout: while one is open, submitting the
 * layout again commits the new version to it.
 */
export async function submit(
  doc: Record<string, unknown>,
  checked: { id: string; name: string; author: string },
  login: string,
  token: string,
): Promise<SubmitResult> {
  const gh = client(token);
  const { id } = checked;
  const path = `community/${id}.json`;
  const branch = `submit/${login}/${id}`;
  const content = base64Utf8(`${JSON.stringify(doc, null, 2)}\n`);
  const message = `Community: add ${id}\n\nSubmitted by @${login} with LayerBench.`;

  try {
    const open = await gh(
      'GET',
      `/pulls?state=open&base=${SUBMIT_BASE}&head=${encodeURIComponent(`${SUBMIT_REPO.split('/')[0]}:${branch}`)}`,
    );
    if (open.status !== 200 || !Array.isArray(open.data)) {
      throw new GitHubRefused(`GitHub answered ${open.status}`);
    }
    const existing = open.data[0];
    if (existing && typeof existing.html_url === 'string') {
      const current = await gh('GET', `/contents/${path}?ref=${encodeURIComponent(branch)}`);
      const sha =
        current.status === 200 && current.data && !Array.isArray(current.data)
          ? current.data.sha
          : undefined;
      expect(
        await gh('PUT', `/contents/${path}`, {
          message: `Community: update ${id}\n\nSubmitted by @${login} with LayerBench.`,
          content,
          branch,
          ...(typeof sha === 'string' ? { sha } : {}),
        }),
        200,
        201,
      );
      return { status: 200, answer: { url: existing.html_url, reused: true } };
    }

    // A layout of this id accepted already is not replaced by a new one.
    const taken = await gh('GET', `/contents/${path}?ref=${SUBMIT_BASE}`);
    if (taken.status === 200) {
      return {
        status: 409,
        answer: { error: 'taken', reason: `a community layout already has the id "${id}"` },
      };
    }
    if (taken.status !== 404) throw new GitHubRefused(`GitHub answered ${taken.status}`);

    const base = expect(await gh('GET', `/git/ref/heads/${SUBMIT_BASE}`), 200);
    const sha = (base.object as { sha?: unknown } | undefined)?.sha;
    if (typeof sha !== 'string') throw new GitHubRefused('no base commit');
    const created = await gh('POST', '/git/refs', { ref: `refs/heads/${branch}`, sha });
    if (created.status === 422) {
      // Left from a submission whose pull request was closed: started over from the branch as it is.
      expect(await gh('PATCH', `/git/refs/heads/${branch}`, { sha, force: true }), 200);
    } else expect(created, 201);

    expect(await gh('PUT', `/contents/${path}`, { message, content, branch }), 201);

    const pull = expect(
      await gh('POST', '/pulls', {
        title: `Community: add ${id}`,
        head: branch,
        base: SUBMIT_BASE,
        body: [
          `Adds \`${path}\`: ${codeSpan(checked.name)} by ${codeSpan(checked.author)}, submitted by @${login} with LayerBench.`,
          '',
          'Merging it accepts the layout into the Library; the index workflow then lists it.',
        ].join('\n'),
      }),
      201,
    );
    if (typeof pull.html_url !== 'string') throw new GitHubRefused('no pull request');
    return { status: 201, answer: { url: pull.html_url } };
  } catch (e) {
    if (e instanceof GitHubRefused) {
      return { status: 502, answer: { error: 'GitHub refused the submission' } };
    }
    return { status: 502, answer: { error: 'GitHub could not be reached' } };
  }
}
