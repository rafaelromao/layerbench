/**
 * The title of a pull request into `main`: a Conventional Commits header
 * (https://www.conventionalcommits.org/en/v1.0.0/), `type(scope)!: description`, with a type and a
 * scope from the lists here. A merge puts the title in `main`'s history, and Release Please reads
 * the next version and the changelog from it (`release-please-config.json`), so the rule is
 * checked on every pull request (`.github/workflows/pr-title.yml`) and held by the titles the
 * sign-in server writes (`library-title.ts`). The same rule is in `CONTRIBUTING.md`.
 */

/**
 * The types Release Please's reader finds in a merge commit, where the title is the body's second
 * paragraph: it splits the message at a blank line followed by one of these. Another type would be
 * valid Conventional Commits and go unread.
 */
export const PULL_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
] as const;
export type PullType = (typeof PULL_TYPES)[number];

/**
 * What a change touches, one word. A scope is optional; when given it is one of these, so the
 * changelog groups the same part of the code under the same word. A new part of the code gets its
 * word here, in the same pull request.
 */
export const PULL_SCOPES = [
  'analysis',
  'layouts',
  'library',
  'community',
  'editor',
  'rules',
  'sync',
  'corpora',
  'web',
  'worker',
  'guide',
  'ci',
  'deps',
] as const;
export type PullScope = (typeof PULL_SCOPES)[number];

/** A title is a commit's subject, which Git tools and the changelog show on one line. */
export const MAX_TITLE_LENGTH = 100;

/**
 * Release Please's own pull request. It finds the one it merged by this exact title, so it is
 * accepted as it is and never edited (`release-please-config.json` keeps the default pattern).
 */
const RELEASE_TITLE =
  /^chore\(main\): release(?: @?[\w./-]+)? v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

// Read loosely, so each part that is wrong is named rather than the whole title refused.
const HEADER =
  /^(?<type>[^\s:(!]*)(?:\((?<scope>[^)]*)\))?(?<breaking>!)?:(?<space> ?)(?<rest>.*)$/;

const list = (words: readonly string[]) => words.map((w) => `\`${w}\``).join(', ');

/** What a title reads like, for an error to end with. */
export const CONVENTION_HINT =
  'A title reads `type(scope): description`, or `type(scope)!: description` for a breaking change; ' +
  `the type is one of ${list(PULL_TYPES)}, and the scope, which is optional, one of ${list(PULL_SCOPES)}. ` +
  'The rule is in CONTRIBUTING.md.';

/** What is wrong with `title`, one line each; none when it follows the convention. */
export function pullTitleProblems(title: string): string[] {
  if (RELEASE_TITLE.test(title)) return [];
  if (/[\r\n]/.test(title)) return ['the title is more than one line'];
  const problems: string[] = [];
  if (title !== title.trim()) problems.push('the title has spaces before or after it');
  if (title.length > MAX_TITLE_LENGTH) {
    problems.push(`the title is ${title.length} characters long; at most ${MAX_TITLE_LENGTH}`);
  }
  const found = HEADER.exec(title.trim())?.groups;
  if (!found) {
    problems.push(
      'the title does not start with `type(scope): `, a type, an optional scope, a colon',
    );
    return problems;
  }
  const { type = '', scope, space, rest = '' } = found;
  if (!(PULL_TYPES as readonly string[]).includes(type)) {
    problems.push(
      type === ''
        ? `there is no type before the colon; use one of ${list(PULL_TYPES)}`
        : `\`${type}\` is not a type; use one of ${list(PULL_TYPES)}, in lowercase`,
    );
  }
  if (scope !== undefined) {
    if (scope === '') problems.push('the scope is empty; leave the parentheses out');
    else if (!(PULL_SCOPES as readonly string[]).includes(scope)) {
      problems.push(`\`${scope}\` is not a scope; use one of ${list(PULL_SCOPES)}, or none`);
    }
  }
  if (space === '' && rest !== '') problems.push('the colon is followed by a space');
  if (rest.trim() === '') problems.push('the description after the colon is missing');
  else if (rest.startsWith(' ')) problems.push('the colon is followed by one space, not more');
  return problems;
}
