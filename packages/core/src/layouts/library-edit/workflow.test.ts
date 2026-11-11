import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The workflows cannot be run here, so what a proposal's pull request depends on is held to its
// text: the order of the steps, what is in each, the group a run is in, and the scripts they call.
const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const read = (path: string) => readFileSync(`${ROOT}${path}`, 'utf8');
const libraryEdit = read('.github/workflows/library-edit.yml');
const ci = read('.github/workflows/ci.yml');

/** The steps of a workflow as text, each from its dash: `uses`, `env` and `run` as written. */
const stepsOf = (workflow: string) => workflow.split(/\n {6}- /).slice(1);

/** The only step that has `text`, which fails the test when there is none or many. */
function stepWith(workflow: string, text: string): string {
  const found = stepsOf(workflow).filter((s) => s.includes(text));
  expect(found, `${found.length} steps have ${JSON.stringify(text)}, not one`).toHaveLength(1);
  return found[0];
}
const indexOfStep = (workflow: string, text: string) =>
  stepsOf(workflow).findIndex((s) => s.includes(text));

describe('the library-edit workflow', () => {
  it('titles the pull request before it applies the request, which deletes it', () => {
    const order = [
      'actions/create-github-app-token',
      'id: current',
      'pnpm library-retitle',
      'gh api -X PATCH',
      'run: pnpm library-edit',
    ].map((text) => indexOfStep(libraryEdit, text));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('never lets a title stand in the way of applying the request', () => {
    for (const text of ['id: current', 'pnpm library-retitle', 'gh api -X PATCH']) {
      expect(stepWith(libraryEdit, text), text).toContain('continue-on-error: true');
    }
  });

  it('keeps the App’s token out of the step that runs the repository’s code', () => {
    expect(stepWith(libraryEdit, 'pnpm library-retitle')).not.toContain('GH_TOKEN');
    expect(stepWith(libraryEdit, 'id: current')).toContain('GH_TOKEN');
    expect(stepWith(libraryEdit, 'gh api -X PATCH')).toContain('GH_TOKEN');
  });

  it('looks for the pull request of this repository’s branch, and reads and writes it by the REST API', () => {
    const current = stepWith(libraryEdit, 'id: current');
    expect(current).toMatch(/head=\$\{GITHUB_REPOSITORY_OWNER\}:\$\{GITHUB_REF_NAME\}/);
    expect(libraryEdit).not.toContain('gh pr ');
  });

  it('takes the title through a file and the environment, never into a command', () => {
    // `${{ … }}` is written into the script before it runs, so a title in one would be code.
    expect(libraryEdit).not.toMatch(/\$\{\{[^}]*title[^}]*\}\}/i);
    expect(libraryEdit).not.toMatch(/\$\{\{\s*github\.event\.pull_request/);
    expect(stepWith(libraryEdit, 'pnpm library-retitle')).toContain('PR_TITLE="$(cat ');
    expect(stepWith(libraryEdit, 'gh api -X PATCH')).toContain('-F "title=@');
  });

  it('puts the run its own push starts in a group of its own, so it cancels nothing', () => {
    expect(libraryEdit).toContain("endsWith(github.event.head_commit.message, ', applied')");
    // The message that push is made with ends so.
    expect(libraryEdit).toMatch(/commit -q -m "chore\(library\): \$\{WHAT\}, applied"/);
  });

  it('calls scripts the repository has', () => {
    const root = JSON.parse(read('package.json')).scripts as Record<string, string>;
    const core = JSON.parse(read('packages/core/package.json')).scripts as Record<string, string>;
    expect(root['library-retitle']).toBe('pnpm --filter @layerbench/core run library-retitle');
    expect(core['library-retitle']).toContain('retitle-write.test.ts');
  });
});

describe('the ci workflow', () => {
  const wait = stepWith(ci, 'gh run list --workflow library-edit.yml --commit "$SHA"');

  it('waits for the library-edit run of a request on the branch, and may read it', () => {
    expect(ci).toMatch(/permissions:\s*\n\s*contents: read\s*\n\s*actions: read/);
    expect(wait).toContain('[ -e .library ] || exit 0');
    expect(wait).toContain('sleep 90');
  });

  it('waits only for a pull request from a branch of this repository, and gives up on none', () => {
    expect(wait).toContain('[ "$EVENT" = pull_request ] && [ "$HEAD_REPO" = "$GH_REPO" ]');
    expect(wait).toContain('[ "$missing" -ge 20 ] && break');
  });

  it('ends in a failure: a request nothing replaced is never green', () => {
    // The last command of the step, past the wait, which an ordinary pull request never reaches.
    const last = wait.lastIndexOf('exit 1') + 'exit 1'.length;
    expect(
      wait
        .slice(last)
        .replace(/^\s*#.*$/gm, '')
        .trim(),
    ).toBe('');
    expect(last).toBeGreaterThan(wait.indexOf('sleep 90'));
  });

  it('builds the deployed app knowing its commit, which a pull request build has no use for', () => {
    // The app settles a merged proposal once its own commit has the merge: it reads this.
    const build = stepWith(ci, 'run: pnpm build');
    expect(build).toContain(
      "VITE_BUILD_COMMIT: ${{ github.event_name == 'push' && github.sha || '' }}",
    );
    // What is uploaded and deployed is the build of the push, in the same run.
    expect(indexOfStep(ci, 'run: pnpm build')).toBeLessThan(
      indexOfStep(ci, 'actions/upload-artifact'),
    );
  });
});
