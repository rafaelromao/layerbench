import { describe, expect, it } from 'vitest';
import { CONVENTION_HINT, pullTitleProblems } from './pr-title.js';

const TITLE = process.env.PR_TITLE;

/**
 * Not a test: the check on a pull request's title (`.github/workflows/pr-title.yml`), run on the
 * title the pull request has now. `PR_TITLE` is the title, passed in the environment and never
 * written into a command, so a title cannot be one.
 *
 *   PR_TITLE='fix(library): change enthium' pnpm pr-title
 */
describe.skipIf(TITLE === undefined)('the pull request title (PR_TITLE=<title>)', () => {
  it('follows the convention', () => {
    const problems = pullTitleProblems(TITLE as string);
    expect(
      problems,
      [
        `The pull request's title is not a conventional one: ${JSON.stringify(TITLE)}`,
        ...problems.map((p) => `  - ${p}`),
        CONVENTION_HINT,
        'Edit the title on GitHub: this check runs again when it changes.',
      ].join('\n'),
    ).toEqual([]);
  });
});
