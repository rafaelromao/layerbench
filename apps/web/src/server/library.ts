// By path rather than by package, as in `submit.ts`: the dev server's config bundles what it
// imports by path.
import { compileLayout } from '../../../../packages/core/src/layout/compile.js';
import { BUNDLED_IDS } from '../../../../packages/core/src/layouts/bundled-ids.js';
import { documentLayout } from '../../../../packages/core/src/layouts/documents.js';
import {
  LIBRARY_REQUEST,
  type LibraryRequest,
  requestText,
} from '../../../../packages/core/src/layouts/library-edit/request.js';
import { isDocumentId } from '../../../../packages/core/src/storage/ids.js';
import {
  codeSpan,
  exists,
  type FileChange,
  type GitHub,
  GitHubRefused,
  openOrUpdate,
} from './pull-request.js';
import { MAX_LAYOUT_BYTES, SUBMIT_BASE, type SubmitAnswer, type SubmitResult } from './submit.js';

/**
 * Changes to the Library, as pull requests the App opens: a change anyone signed in proposes to a
 * bundled or community layout, and a maintainer's delete or promote. A bundled layout is code and
 * documents on main, so its pull request carries a request (`.library/request.json`) that CI
 * applies on the branch; a community layout is one file on `layerbench-data`, so its pull request
 * changes that file. Merging is the maintainer's acceptance. Everything sent is untrusted: checked
 * as the app checks it before GitHub is asked anything, and none of its text reaches a pull request
 * but inside code spans.
 */

export type LibraryAnswer = SubmitAnswer;

/** Where a layout is: in the Library, in the community, or kept by whoever sends it. */
export interface Target {
  kind: 'bundled' | 'community' | 'custom';
  id: string;
}

const MAIN = 'main';

/** A target as sent, of one of the kinds asked for; or null. */
export function targetOf(value: unknown, kinds: readonly Target['kind'][]): Target | null {
  if (!value || typeof value !== 'object') return null;
  const { kind, id } = value as Record<string, unknown>;
  if (typeof id !== 'string' || !isDocumentId(id)) return null;
  return kinds.includes(kind as Target['kind']) ? { kind: kind as Target['kind'], id } : null;
}

/** A layout sent for `id`: exactly as LayerBench saves it, under that id; or why not. */
export function checkLayout(
  doc: unknown,
  id: string,
): { ok: true; name: string; author: string } | { ok: false; reason: string } {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, reason: 'no layout was sent' };
  }
  if (new TextEncoder().encode(JSON.stringify(doc)).length > MAX_LAYOUT_BYTES) {
    return { ok: false, reason: `the layout is larger than ${MAX_LAYOUT_BYTES / 1024} KB` };
  }
  try {
    const layout = documentLayout(id, doc);
    compileLayout(layout);
    return { ok: true, name: layout.name, author: layout.author ?? '' };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

const refused = (status: number, error: string, reason: string): SubmitResult => ({
  status,
  answer: { error, reason },
});

const notBundled = (id: string) =>
  refused(422, 'not accepted', `no bundled layout has the id "${id}"`);

/** A pull request into main that carries a request for CI to apply. */
async function requestPull(
  gh: GitHub,
  request: LibraryRequest,
  login: string,
  title: string,
  what: string,
): Promise<SubmitResult> {
  const branch = `library/${login}/${request.action}/${request.id}`;
  const changes: FileChange[] = [[LIBRARY_REQUEST, requestText(request)]];
  const { url, reused } = await openOrUpdate(gh, {
    base: MAIN,
    branch,
    changes,
    message: `${title}\n\nAsked by @${login} with LayerBench.`,
    title,
    body: [
      `${what}, asked by @${login} with LayerBench.`,
      '',
      `The \`library-edit\` workflow applies \`${LIBRARY_REQUEST}\` on this branch, measures the languages and goldens again and pushes the result, and CI then checks it. Merging it changes the Library with the next deploy.`,
    ].join('\n'),
  });
  return reused ? { status: 200, answer: { url, reused } } : { status: 201, answer: { url } };
}

/** A pull request into `layerbench-data` that puts or deletes one community file. */
async function dataPull(
  gh: GitHub,
  change: FileChange,
  login: string,
  action: string,
  id: string,
  what: string,
): Promise<SubmitResult> {
  const title = `Community: ${action} ${id}`;
  const { url, reused } = await openOrUpdate(gh, {
    base: SUBMIT_BASE,
    branch: `data/${login}/${action}/${id}`,
    changes: [change],
    message: `${title}\n\nAsked by @${login} with LayerBench.`,
    title,
    body: [
      `${what}, asked by @${login} with LayerBench.`,
      '',
      'Merging it changes the Library; the index workflow then lists the layouts again.',
    ].join('\n'),
  });
  return reused ? { status: 200, answer: { url, reused } } : { status: 201, answer: { url } };
}

const communityFile = (id: string) => `community/${id}.json`;
const text = (doc: unknown) => `${JSON.stringify(doc, null, 2)}\n`;

/** Wraps a GitHub conversation: what GitHub refused or could not be reached for is all it says. */
async function talking(go: () => Promise<SubmitResult>): Promise<SubmitResult> {
  try {
    return await go();
  } catch (e) {
    return e instanceof GitHubRefused
      ? { status: 502, answer: { error: 'GitHub refused the change' } }
      : { status: 502, answer: { error: 'GitHub could not be reached' } };
  }
}

/** A change anyone signed in proposes to a bundled or community layout, already checked. */
export function propose(
  gh: GitHub,
  target: Target,
  doc: unknown,
  checked: { name: string; author: string },
  login: string,
): Promise<SubmitResult> {
  const { id } = target;
  return talking(async () => {
    if (target.kind === 'bundled') {
      if (!BUNDLED_IDS.includes(id)) return notBundled(id);
      return requestPull(
        gh,
        { action: 'change', id, layout: doc, by: login },
        login,
        `Library: change ${id}`,
        `Changes the bundled layout \`${id}\` to ${codeSpan(checked.name)} by ${codeSpan(checked.author)}`,
      );
    }
    if (!(await exists(gh, communityFile(id), SUBMIT_BASE))) {
      return refused(404, 'not found', `no community layout has the id "${id}"`);
    }
    return dataPull(
      gh,
      [communityFile(id), text(doc)],
      login,
      'change',
      id,
      `Changes \`${communityFile(id)}\` to ${codeSpan(checked.name)} by ${codeSpan(checked.author)}`,
    );
  });
}

/** A maintainer's delete of a bundled or community layout. */
export function remove(gh: GitHub, target: Target, login: string): Promise<SubmitResult> {
  const { id } = target;
  return talking(async () => {
    if (target.kind === 'bundled') {
      if (!BUNDLED_IDS.includes(id)) return notBundled(id);
      return requestPull(
        gh,
        { action: 'delete', id, by: login },
        login,
        `Library: delete ${id}`,
        `Deletes the bundled layout \`${id}\``,
      );
    }
    if (!(await exists(gh, communityFile(id), SUBMIT_BASE))) {
      return refused(404, 'not found', `no community layout has the id "${id}"`);
    }
    return dataPull(
      gh,
      [communityFile(id), null],
      login,
      'delete',
      id,
      `Deletes \`${communityFile(id)}\``,
    );
  });
}

/** A maintainer's promotion of a custom or community layout into the Library, already checked. */
export function promote(
  gh: GitHub,
  target: Target,
  doc: unknown,
  checked: { name: string; author: string },
  login: string,
): Promise<SubmitResult> {
  const { id } = target;
  return talking(async () => {
    if (BUNDLED_IDS.includes(id)) {
      return refused(409, 'taken', `a bundled layout already has the id "${id}"`);
    }
    const inCommunity = await exists(gh, communityFile(id), SUBMIT_BASE);
    if (target.kind === 'custom' && inCommunity) {
      return refused(409, 'taken', `a community layout already has the id "${id}"`);
    }
    if (target.kind === 'community' && !inCommunity) {
      return refused(404, 'not found', `no community layout has the id "${id}"`);
    }
    const moved =
      target.kind === 'community'
        ? ` from the community; once deployed, CI deletes \`${communityFile(id)}\`, so the Library lists it once`
        : '';
    return requestPull(
      gh,
      { action: 'promote', id, layout: doc, by: login },
      login,
      `Library: promote ${id}`,
      `Promotes ${codeSpan(checked.name)} by ${codeSpan(checked.author)} into the Library as \`${id}\`${moved}`,
    );
  });
}
