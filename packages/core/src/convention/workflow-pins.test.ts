import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const WORKFLOWS = `${ROOT}.github/workflows`;
// Kept in lockstep with `.github/workflows/community-index.yml` on `layerbench-data`.
const COMMUNITY_WORKFLOW = `${ROOT}packages/core/fixtures/community-index.workflow.yml`;
const EXPECTED_WORKFLOWS = [
  'ci.yml',
  'corpora.yml',
  'layouts.yml',
  'library-edit.yml',
  'pages.yml',
  'pr-title.yml',
  'release-please.yml',
];

function actionsIn(workflow: string) {
  return [...workflow.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)(?:\s+#\s*(.*))?\s*$/gm)].map(
    ([line, reference, comment]) => ({ line, reference, comment: comment ?? '' }),
  );
}

describe('the workflow action pins', () => {
  it('covers every main workflow and the community branch starting workflow', () => {
    const actual = readdirSync(WORKFLOWS)
      .filter((name) => /\.ya?ml$/.test(name))
      .sort();

    expect(actual).toEqual(EXPECTED_WORKFLOWS);
    expect(readFileSync(COMMUNITY_WORKFLOW, 'utf8')).toContain('name: community index');
    for (const path of [
      ...EXPECTED_WORKFLOWS.map((name) => `${WORKFLOWS}/${name}`),
      COMMUNITY_WORKFLOW,
    ]) {
      expect(actionsIn(readFileSync(path, 'utf8')).length, path).toBeGreaterThan(0);
    }
  });

  it('pins every action to a full commit and names its version beside the use', () => {
    const files = [...EXPECTED_WORKFLOWS.map((name) => `${WORKFLOWS}/${name}`), COMMUNITY_WORKFLOW];
    const pins = files.flatMap((path) => actionsIn(readFileSync(path, 'utf8')));

    expect(pins.length).toBeGreaterThan(0);
    for (const { line, reference, comment } of pins) {
      expect(reference, line).toMatch(/^[^@]+@[a-f0-9]{40}$/);
      expect(comment, line).toMatch(/\bv\d+(?:\.\d+){1,2}\b/);
    }
  });

  it('uses one version and commit for each GitHub-owned action', () => {
    const files = [...EXPECTED_WORKFLOWS.map((name) => `${WORKFLOWS}/${name}`), COMMUNITY_WORKFLOW];
    const pins = files.flatMap((path) => actionsIn(readFileSync(path, 'utf8')));
    const githubActions = new Map<string, Set<string>>();

    for (const { reference, comment } of pins) {
      const action = reference.split('@')[0];
      if (!action.startsWith('actions/')) continue;
      const versions = githubActions.get(action) ?? new Set<string>();
      versions.add(`${reference} ${comment.match(/\bv\d+(?:\.\d+){1,2}\b/)?.[0]}`);
      githubActions.set(action, versions);
    }

    for (const [action, versions] of githubActions) {
      expect([...versions], action).toHaveLength(1);
    }
  });
});
