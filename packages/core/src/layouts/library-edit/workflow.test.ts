import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The workflows cannot be run here, so what a proposal's pull request depends on is held to its
// text: the order of the steps, the group a run is in, and what the scripts they call are named.
const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const read = (path: string) => readFileSync(`${ROOT}${path}`, 'utf8');
const libraryEdit = read('.github/workflows/library-edit.yml');
const ci = read('.github/workflows/ci.yml');

/** The position of `text` in the workflow, which fails the test when it is not there. */
function at(workflow: string, text: string): number {
  const i = workflow.indexOf(text);
  expect(i, `the workflow has no ${JSON.stringify(text)}`).toBeGreaterThanOrEqual(0);
  return i;
}

describe('the library-edit workflow', () => {
  it('titles the pull request before it applies the request, which deletes it, with the App’s token', () => {
    const token = at(libraryEdit, 'actions/create-github-app-token');
    const retitle = at(libraryEdit, 'pnpm library-retitle');
    const apply = at(libraryEdit, 'run: pnpm library-edit');
    expect(token).toBeLessThan(retitle);
    expect(retitle).toBeLessThan(apply);
    expect(libraryEdit).toContain('gh pr edit "$number" --title');
  });

  it('takes the title through the environment, never into a command', () => {
    // `${{ … }}` is written into the script before it runs, so a title in one would be code.
    expect(libraryEdit).not.toMatch(/\$\{\{[^}]*title[^}]*\}\}/i);
    expect(libraryEdit).not.toMatch(/\$\{\{\s*github\.event\.pull_request/);
    expect(libraryEdit).toContain('PR_TITLE=$(gh pr view');
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
  it('waits for the library-edit run of a request on the branch, and may read it', () => {
    expect(ci).toContain('gh run list --workflow library-edit.yml --commit "$SHA"');
    expect(ci).toMatch(/permissions:\s*\n\s*contents: read\s*\n\s*actions: read/);
    // It fails in the end when nothing replaced the run: a request is never merged unapplied.
    expect(at(ci, 'exit 1')).toBeGreaterThan(at(ci, 'gh run list'));
  });
});
