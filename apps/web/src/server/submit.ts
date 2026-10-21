// By path rather than by package: Vite bundles the dev server's config with what it imports by
// path, but leaves a package to Node, which cannot follow core's `.js` imports to its `.ts` files.
import { compileLayout } from '../../../../packages/core/src/layout/compile.js';
import { BUNDLED_IDS } from '../../../../packages/core/src/layouts/bundled-ids.js';
import { documentLayout } from '../../../../packages/core/src/layouts/documents.js';
import { isDocumentId } from '../../../../packages/core/src/storage/ids.js';
import {
  client,
  codeSpan,
  commitFiles,
  createPull,
  exists,
  GitHubRefused,
  LIBRARY_REPO,
  openPull,
  startBranch,
} from './pull-request.js';

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
export const SUBMIT_REPO = LIBRARY_REPO;
export const SUBMIT_BASE = 'layerbench-data';
/** A layout as LayerBench saves it; the largest bundled one is about 10 KB. */
export const MAX_LAYOUT_BYTES = 64 * 1024;

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
  if (BUNDLED_IDS.includes(id)) {
    return { ok: false, reason: `a bundled layout already has the id "${id}"` };
  }
  try {
    const layout = documentLayout(id, doc);
    compileLayout(layout);
    return { ok: true, id, name: layout.name, author: layout.author ?? '' };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
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
  const text = `${JSON.stringify(doc, null, 2)}\n`;
  const by = `Submitted by @${login} with LayerBench.`;

  try {
    const existing = await openPull(gh, SUBMIT_BASE, branch);
    if (existing) {
      await commitFiles(gh, branch, [[path, text]], `Community: update ${id}\n\n${by}`);
      return { status: 200, answer: { url: existing, reused: true } };
    }

    // A layout of this id accepted already is not replaced by a new one.
    if (await exists(gh, path, SUBMIT_BASE)) {
      return {
        status: 409,
        answer: { error: 'taken', reason: `a community layout already has the id "${id}"` },
      };
    }

    // Left from a submission whose pull request was closed, the branch starts over.
    await startBranch(gh, SUBMIT_BASE, branch);
    await commitFiles(gh, branch, [[path, text]], `Community: add ${id}\n\n${by}`);
    const url = await createPull(gh, {
      base: SUBMIT_BASE,
      branch,
      title: `Community: add ${id}`,
      body: [
        `Adds \`${path}\`: ${codeSpan(checked.name)} by ${codeSpan(checked.author)}, submitted by @${login} with LayerBench.`,
        '',
        'Merging it accepts the layout into the Library; the index workflow then lists it.',
      ].join('\n'),
    });
    return { status: 201, answer: { url } };
  } catch (e) {
    if (e instanceof GitHubRefused) {
      return { status: 502, answer: { error: 'GitHub refused the submission' } };
    }
    return { status: 502, answer: { error: 'GitHub could not be reached' } };
  }
}
