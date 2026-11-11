import { isDocumentId } from '../storage/ids.js';
import { MAX_TITLE_LENGTH, type PullType, pullTitleProblems } from './pr-title.js';

/**
 * The titles of the pull requests the sign-in server opens as the GitHub App, and the commits it
 * makes on their branches. No dialog takes a title: the server writes it, from the action and the
 * layout's id, so every title follows the convention (`pr-title.ts`) and a person who retitles one
 * on GitHub meets the same check as anyone. A merge into `main` puts the title in its history, and
 * Release Please reads it there, so what the Library adds is a feature and what it changes or takes
 * out is a fix.
 *
 *   promote, add  feat(library|community): promote <id>
 *   change        fix(library|community): change <id>
 *   delete        fix(library|community): delete <id>
 */
export type LibraryArea = 'library' | 'community';
export type LibraryPullAction = 'add' | 'change' | 'delete' | 'promote' | 'update';

const TYPE_OF: Readonly<Record<LibraryPullAction, PullType>> = {
  add: 'feat',
  promote: 'feat',
  change: 'fix',
  delete: 'fix',
  // Only a commit: submitting a layout again updates the pull request it already has.
  update: 'fix',
};

/**
 * The title of the pull request for `action` on the layout `id`, and the message of the commit
 * that carries it on the branch. The commit is `chore`, so it is never a release's input: the
 * pull request's title is, once, whether the merge is a squash or a merge commit. An id too long
 * for a title is shortened there; the pull request's body and branch name have all of it.
 */
export function libraryPull(
  area: LibraryArea,
  action: LibraryPullAction,
  id: string,
): { title: string; commit: string } {
  const lead = `(${area}): ${action} `;
  // The commit's type is the longer, and its subject is held to the same length.
  const room = MAX_TITLE_LENGTH - lead.length - 'chore'.length;
  const shown = id.length > room ? `${id.slice(0, room - 1)}…` : id;
  const title = `${TYPE_OF[action]}${lead}${shown}`;
  const commit = `chore${lead}${shown}`;
  const problems = [...pullTitleProblems(title), ...pullTitleProblems(commit)];
  if (problems.length > 0) throw new Error(`not a conventional title: ${problems.join('; ')}`);
  return { title, commit };
}

/**
 * The title a Library request's pull request should have, or null when it has one that follows the
 * convention already, a person's own title included. The sign-in server writes the title when it
 * opens the pull request, but it is a deployed program of its own, and one deployed before the
 * convention goes on writing the old titles until it is deployed again: `library-edit` retitles
 * the pull request with this, from the request on its branch, so that no proposal waits on a
 * deploy. An action or an id a request cannot have is null too: it is refused when it is applied,
 * and so is a title that was not read (a pull request has none empty): nothing is made of what is
 * not known, which could be a person's own.
 */
export function libraryRetitle(
  request: { action?: unknown; id?: unknown },
  current: string,
): string | null {
  if (current.trim() === '' || pullTitleProblems(current).length === 0) return null;
  const { action, id } = request;
  if (action !== 'change' && action !== 'delete' && action !== 'promote') return null;
  if (typeof id !== 'string' || !isDocumentId(id)) return null;
  return libraryPull('library', action, id).title;
}
