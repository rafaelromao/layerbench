import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SCRIPT = `${ROOT}.github/scripts/compose-release-notes.mjs`;
const RELEASE_GATE = `${ROOT}.github/scripts/should-run-release-please.mjs`;
const RELEASE_LABELS = `${ROOT}.github/scripts/release-note-labels.mjs`;
const WORKFLOW = readFileSync(`${ROOT}.github/workflows/release-please.yml`, 'utf8');
const RELEASE_CONFIG = readFileSync(`${ROOT}.github/release.yml`, 'utf8');
const overview = readFileSync(`${ROOT}docs/releases/0.3.0.md`, 'utf8').trim();
const expression = (value: string) => `\${{ ${value} }}`;

const compose = (releaseNotes: string) =>
  execFileSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, RELEASE_NOTES: releaseNotes },
  });

const shouldRunReleasePlease = (commitMessages: string[]) =>
  execFileSync(process.execPath, [RELEASE_GATE], {
    cwd: ROOT,
    encoding: 'utf8',
    input: `${commitMessages.join('\n')}\n`,
  });

const labelPullRequests = (since: string, pullRequests: unknown) =>
  execFileSync(process.execPath, [RELEASE_LABELS, '--since', since], {
    cwd: ROOT,
    encoding: 'utf8',
    input: JSON.stringify(pullRequests),
  });

describe('the first public release notes', () => {
  it('puts the overview and start links before the generated notes unchanged', () => {
    const generated =
      '## What’s Changed\n\n* A generated change ([#123](https://example.test/123))';
    const result = compose(generated);

    expect(overview).toMatch(/simulate/i);
    expect(overview).toMatch(/import/i);
    expect(overview).toMatch(/edit/i);
    expect(overview).toMatch(/compar/i);
    expect(overview).toMatch(/rule/i);
    expect(overview).toMatch(/language/i);
    expect(overview).toMatch(/not a firmware builder/i);
    expect(overview).toMatch(/unsupported behaviors[\s\S]*?not simulated/i);
    expect(overview).toContain('[app](https://layerbench.github.io/)');
    expect(overview).toContain('[landing page](https://rafaelromao.github.io/layerbench/)');
    expect(overview).toContain('[guide](https://layerbench.github.io/guide)');
    expect(result).toBe(`${overview}\n\n${generated}`);
  });

  it('does not duplicate the overview when reconciling an existing release body', () => {
    const generated =
      '## What’s Changed\n\n* A generated change ([#123](https://example.test/123))';
    const composed = compose(generated);

    expect(compose(composed)).toBe(composed);
  });

  it('deduplicates GitHub-generated pull requests while preserving the release sections', () => {
    const since = '2026-11-10T00:00:00Z';
    const pullRequests = [
      {
        number: 151,
        title: 'feat(sync): list missing account documents',
        body: '',
        mergedAt: '2026-11-11T19:14:01Z',
        labels: [{ name: 'release-note: hidden' }],
      },
      {
        number: 151,
        title: 'feat(sync): list missing account documents',
        body: '',
        mergedAt: '2026-11-11T19:14:01Z',
        labels: [{ name: 'release-note: hidden' }],
      },
      {
        number: 150,
        title: 'docs(guide): explain release process',
        body: '',
        mergedAt: '2026-11-11T18:00:00Z',
        labels: [],
      },
      {
        number: 148,
        title: 'fix(analysis): correct a result',
        mergedAt: '2026-11-11T17:00:00Z',
        labels: [],
      },
      {
        number: 147,
        title: 'perf(web): reduce work',
        mergedAt: '2026-11-11T16:00:00Z',
        labels: [],
      },
      {
        number: 146,
        title: 'revert: undo a feature',
        mergedAt: '2026-11-11T15:00:00Z',
        labels: [],
      },
      {
        number: 145,
        title: 'docs(guide)!: remove an old contract',
        mergedAt: '2026-11-11T14:00:00Z',
        labels: [],
      },
      {
        number: 149,
        title: 'chore(main): release 0.3.0',
        body: '',
        mergedAt: '2026-11-09T18:00:00Z',
        labels: [],
      },
    ];

    expect(JSON.parse(labelPullRequests(since, pullRequests))).toEqual([
      {
        number: 151,
        label: 'release-note: feature',
        removeLabels: ['release-note: hidden'],
      },
      { number: 150, label: 'release-note: hidden', removeLabels: [] },
      { number: 148, label: 'release-note: fix', removeLabels: [] },
      { number: 147, label: 'release-note: performance', removeLabels: [] },
      { number: 146, label: 'release-note: revert', removeLabels: [] },
      { number: 145, label: 'release-note: breaking', removeLabels: [] },
    ]);
    expect(RELEASE_CONFIG).toContain('release-note: hidden');
    expect(RELEASE_CONFIG).toContain('title: Breaking Changes');
    expect(RELEASE_CONFIG).toContain('title: Features');
    expect(RELEASE_CONFIG).toContain('title: Bug Fixes');
    expect(RELEASE_CONFIG).toContain('title: Performance Improvements');
    expect(RELEASE_CONFIG).toContain('title: Reverts');
    expect(WORKFLOW).toContain('gh label create "release-note: other"');
    for (const label of [
      'release-note: breaking',
      'release-note: feature',
      'release-note: fix',
      'release-note: performance',
      'release-note: revert',
      'release-note: other',
      'release-note: hidden',
    ]) {
      expect(RELEASE_CONFIG).toContain(label);
    }
  });

  it('keeps historical non-conventional changes in the generated release notes', () => {
    const since = '2026-11-10T00:00:00Z';
    const pullRequests = [
      {
        number: 144,
        title: 'Repeat key: two taps on two fingers beat one finger tapping a key twice',
        mergedAt: '2026-11-11T15:11:11Z',
        labels: [],
      },
      {
        number: 153,
        title: 'Upgrade Enthium to v15',
        mergedAt: '2026-11-11T19:59:38Z',
        labels: [],
      },
    ];

    expect(JSON.parse(labelPullRequests(since, pullRequests))).toEqual([
      { number: 144, label: 'release-note: other', removeLabels: [] },
      { number: 153, label: 'release-note: other', removeLabels: [] },
    ]);
    const otherChangesCategory = RELEASE_CONFIG.split('title: Other Changes')[1] ?? '';
    expect(otherChangesCategory).toContain('release-note: other');
    expect(otherChangesCategory).toContain('release-note: hidden');
  });

  it('publishes a merged release but ignores later housekeeping when preparing the next PR', () => {
    expect(
      shouldRunReleasePlease([
        'feat(web): add a capability',
        'chore(main): release 0.3.0',
        'docs(guide): explain a capability',
      ]),
    ).toBe('true');
    expect(shouldRunReleasePlease(['docs(guide): explain a capability'])).toBe('false');
    expect(
      shouldRunReleasePlease([
        'docs(guide): explain a capability',
        'feat(web): add a later capability',
      ]),
    ).toBe('true');
  });

  it('runs Release Please for a release-worthy title or its release PR', () => {
    for (const title of [
      'feat(web): add a capability',
      'fix(analysis): correct a result',
      'perf(web): reduce work',
      'revert: feat(web): add a capability',
      'docs(guide)!: remove an old contract',
      'chore(main): release 0.3.0',
    ]) {
      expect(shouldRunReleasePlease([title]), title).toBe('true');
    }

    for (const title of [
      'docs(guide): explain a capability',
      'test(core): cover a case',
      'ci(ci): update a workflow',
      'chore(deps): update tooling',
    ]) {
      expect(shouldRunReleasePlease([title]), title).toBe('false');
    }
  });

  it('updates only v0.3.0 releases and can recover through manual dispatch', () => {
    expect(WORKFLOW).toContain('id: publish');
    expect(WORKFLOW).toContain('id: release-pr');
    expect(WORKFLOW).toContain("steps.publish.outputs.release_created == 'true'");
    expect(WORKFLOW).toContain("steps.publish.outputs.tag_name == 'v0.3.0'");
    expect(WORKFLOW).toContain("github.event_name == 'workflow_dispatch'");
    expect(WORKFLOW).toContain('should-run-release-please.mjs');
    expect(WORKFLOW).toContain('release-note-labels.mjs');
    expect(WORKFLOW).toContain(`steps.gate.outputs.should_release == 'true'`);
    expect(WORKFLOW).toContain(
      'git log --format=%s "$base_tag..HEAD" | node .github/scripts/should-run-release-please.mjs',
    );
    expect(WORKFLOW).toContain('issues: write');
    expect(WORKFLOW).toContain('pull-requests: write');
    expect(WORKFLOW).toContain('fetch-depth: 0');
    expect(WORKFLOW).toContain(`group: release-please-${expression('github.event_name')}`);
    expect(WORKFLOW).toContain(`if: ${expression("github.event_name == 'push'")}`);
    expect(WORKFLOW).toContain(`if: ${expression("steps.gate.outputs.should_release == 'true'")}`);
    const publishStepStart = WORKFLOW.lastIndexOf('      - uses:', WORKFLOW.indexOf('id: publish'));
    const publishStepEnd = WORKFLOW.indexOf('\n      - ', publishStepStart);
    const publishStep = WORKFLOW.slice(publishStepStart, publishStepEnd);
    expect(publishStep).toContain(
      `if: ${expression("steps.gate.outputs.should_release == 'true'")}`,
    );
    expect(publishStep).toContain('skip-github-pull-request: true');
    expect(publishStep).not.toContain('workflow_dispatch');
    const releasePrStepStart = WORKFLOW.lastIndexOf(
      '      - uses:',
      WORKFLOW.indexOf('id: release-pr'),
    );
    const nextStepStart = WORKFLOW.indexOf('\n      - ', releasePrStepStart);
    const releasePrStepEnd = nextStepStart < 0 ? WORKFLOW.length : nextStepStart;
    const releasePrStep = WORKFLOW.slice(releasePrStepStart, releasePrStepEnd);
    expect(releasePrStep).toContain(
      `if: ${expression("steps.pull-request-gate.outputs.should_release == 'true'")}`,
    );
    expect(releasePrStep).toContain('skip-github-release: true');
    expect(releasePrStep).not.toContain('workflow_dispatch');
    const postReleaseGateStart = WORKFLOW.indexOf('id: pull-request-gate');
    const postReleaseGateEnd = WORKFLOW.indexOf('      - uses:', postReleaseGateStart);
    const postReleaseGate = WORKFLOW.slice(postReleaseGateStart, postReleaseGateEnd);
    expect(postReleaseGate).toContain(`if: ${expression("github.event_name == 'push'")}`);
    expect(postReleaseGate).toContain('git log --format=%s "$base_tag..HEAD"');
    expect(WORKFLOW.indexOf('id: publish')).toBeLessThan(
      WORKFLOW.indexOf('git fetch --tags origin'),
    );
    expect(WORKFLOW.indexOf('git fetch --tags origin')).toBeLessThan(postReleaseGateStart);
    expect(postReleaseGateStart).toBeLessThan(WORKFLOW.indexOf('id: release-pr'));
    const labelStepStart = WORKFLOW.indexOf('- name: Label merged pull requests');
    const labelStepEnd = WORKFLOW.indexOf('id: publish', labelStepStart);
    const labelStep = WORKFLOW.slice(labelStepStart, labelStepEnd);
    expect(labelStep).toContain(`if: ${expression("steps.gate.outputs.should_release == 'true'")}`);
    expect(labelStep).not.toContain('workflow_dispatch');
    expect(labelStep).toContain(`GH_TOKEN: ${expression('github.token')}`);
    expect(labelStep).toContain('args=(pr edit "$number" --add-label "$label")');
    expect(labelStep).toContain(`gh "\${args[@]}"`);
    expect(WORKFLOW.indexOf('Label merged pull requests')).toBeLessThan(
      WORKFLOW.indexOf('id: release'),
    );
    expect(WORKFLOW).toContain(`EVENT_NAME: ${expression('github.event_name')}`);
    expect(WORKFLOW).toContain(`RELEASE_BODY: ${expression('steps.publish.outputs.body')}`);
    expect(WORKFLOW).toContain(`GH_TOKEN: ${expression('steps.app.outputs.token')}`);
    expect(WORKFLOW).toMatch(
      /if \[ "\$EVENT_NAME" = "workflow_dispatch" \]; then\s+release_notes="\$\(gh release view v0\.3\.0 --json body --jq \.body\)"\s+else\s+release_notes="\$RELEASE_BODY"\s+fi/,
    );
    expect(WORKFLOW).toContain('gh release edit v0.3.0');
    expect(WORKFLOW).toContain('compose-release-notes.mjs');
  });
});
