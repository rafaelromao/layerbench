import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const CI = readFileSync(`${ROOT}.github/workflows/ci.yml`, 'utf8');
const expression = (value: string) => `\${{ ${value} }}`;

/** One job of the `ci` workflow, from its name to the next job's. */
function job(name: string): string {
  const start = CI.indexOf(`\n  ${name}:\n`);
  if (start < 0) return '';
  const next = CI.slice(start + 1).search(/\n {2}[a-z][\w-]*:\n/);
  return next < 0 ? CI.slice(start) : CI.slice(start, start + 1 + next);
}

describe('the end-to-end checks in CI', () => {
  const e2e = job('e2e');

  it('run on the pull request Release Please keeps open, and on no other', () => {
    // Its branch is `release-please--branches--main…`; the GitHub App opens it, so its checks run.
    expect(e2e).toContain(
      "if: github.event_name == 'pull_request' && startsWith(github.head_ref, 'release-please--')",
    );
  });

  it('run both suites, the dev server one and the production build one, on Chromium', () => {
    expect(e2e).toContain(
      'pnpm --filter @layerbench/web exec playwright install --with-deps chromium',
    );
    expect(e2e).toMatch(/run: pnpm --filter @layerbench\/web e2e$/m);
    expect(e2e).toMatch(/run: pnpm --filter @layerbench\/web e2e:chunks$/m);
  });

  it('run the production build one after a failure of the other too, so one run names both', () => {
    expect(e2e).toContain(
      `if: ${expression("!cancelled() && (success() || steps.e2e.outcome == 'failure')")}`,
    );
  });

  it('keep what a failure of each leaves, its traces, for a week', () => {
    expect(e2e).toContain("if: failure() && steps.e2e.outcome == 'failure'");
    expect(e2e).toContain("if: failure() && steps.chunks.outcome == 'failure'");
    expect(e2e.match(/path: apps\/web\/test-results$/gm)).toHaveLength(2);
    expect(e2e.match(/retention-days: 7$/gm)).toHaveLength(2);
  });

  it('leave room for the longest check, a quarter of an hour on its own', () => {
    expect(e2e).toContain('timeout-minutes: 60');
  });

  it('write nothing with the job token, as the rest of the workflow', () => {
    expect(e2e).toContain('persist-credentials: false');
    expect(e2e).not.toContain('secrets.');
  });
});
