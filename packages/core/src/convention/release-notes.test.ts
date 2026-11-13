import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SCRIPT = `${ROOT}.github/scripts/compose-release-notes.mjs`;
const WORKFLOW = readFileSync(`${ROOT}.github/workflows/release-please.yml`, 'utf8');
const overview = readFileSync(`${ROOT}docs/releases/0.3.0.md`, 'utf8').trim();
const expression = (value: string) => `\${{ ${value} }}`;

const compose = (releaseNotes: string) =>
  execFileSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, RELEASE_NOTES: releaseNotes },
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

  it('updates only v0.3.0 releases and can recover through manual dispatch', () => {
    expect(WORKFLOW).toContain('id: release');
    expect(WORKFLOW).toContain("steps.release.outputs.release_created == 'true'");
    expect(WORKFLOW).toContain("steps.release.outputs.tag_name == 'v0.3.0'");
    expect(WORKFLOW).toContain("github.event_name == 'workflow_dispatch'");
    expect(WORKFLOW).toContain(`EVENT_NAME: ${expression('github.event_name')}`);
    expect(WORKFLOW).toContain(`RELEASE_BODY: ${expression('steps.release.outputs.body')}`);
    expect(WORKFLOW).toContain(`GH_TOKEN: ${expression('steps.app.outputs.token')}`);
    expect(WORKFLOW).toMatch(
      /if \[ "\$EVENT_NAME" = "workflow_dispatch" \]; then\s+release_notes="\$\(gh release view v0\.3\.0 --json body --jq \.body\)"\s+else\s+release_notes="\$RELEASE_BODY"\s+fi/,
    );
    expect(WORKFLOW).toContain('gh release edit v0.3.0');
    expect(WORKFLOW).toContain('compose-release-notes.mjs');
  });
});
