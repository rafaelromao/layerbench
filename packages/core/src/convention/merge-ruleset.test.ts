import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// A merge into main is a squash that takes the pull request's title, once its title has passed the
// check. The repository's ruleset for main holds both; `.github/rulesets/main.json` is what it is
// made from, as CONTRIBUTING.md (Merging) says, and these keep the file what that section asks.
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const read = (path: string) => readFileSync(`${ROOT}${path}`, 'utf8');

interface Rule {
  type: string;
  parameters?: Record<string, unknown>;
}
const ruleset = JSON.parse(read('.github/rulesets/main.json')) as Record<string, unknown> & {
  rules: Rule[];
};
const rule = (type: string) => ruleset.rules.find((r) => r.type === type)?.parameters;

describe("main's ruleset", () => {
  it('holds every change to main, with no one exempt, and is a body the API takes', () => {
    expect(ruleset.name).toBe('main');
    expect(ruleset.target).toBe('branch');
    expect(ruleset.enforcement).toBe('active');
    expect(ruleset.conditions).toEqual({
      ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] },
    });
    expect(ruleset.bypass_actors).toEqual([]);
    // What GitHub's export adds and a request to create or replace a ruleset does not take.
    for (const key of ['id', 'source', 'source_type', 'node_id']) {
      expect(ruleset, `${key} is the export's, not the request's`).not.toHaveProperty(key);
    }
    expect(ruleset.rules.map(({ type }) => type)).toEqual([
      'pull_request',
      'required_status_checks',
    ]);
  });

  it('merges a pull request by a squash only, which needs no approval', () => {
    // The owner is the only maintainer, and GitHub never counts an author's approval of their own
    // pull request: an approval asked for would stop every merge.
    expect(rule('pull_request')).toEqual({
      allowed_merge_methods: ['squash'],
      required_approving_review_count: 0,
      dismiss_stale_reviews_on_push: false,
      require_code_owner_review: false,
      require_extra_approval_for_unattributed_changes: false,
      require_last_push_approval: false,
      required_review_thread_resolution: false,
      required_reviewers: [],
    });
  });

  it("needs the title check to pass, by the name of pr-title's job", () => {
    // 15368 is GitHub Actions: a check of that name from another app does not count. Not strict:
    // the title needs no catching up with main.
    expect(rule('required_status_checks')).toEqual({
      required_status_checks: [{ context: 'title', integration_id: 15368 }],
      strict_required_status_checks_policy: false,
      do_not_enforce_on_create: false,
    });
    // A check run is named by its job: a job renamed would leave the ruleset waiting for a check
    // that never comes, and no pull request could merge.
    expect(read('.github/workflows/pr-title.yml')).toMatch(/^jobs:\n {2}title:$/m);
  });
});

describe('CONTRIBUTING.md on merging', () => {
  const doc = read('CONTRIBUTING.md').replace(/\s+/g, ' ');

  it('says the ruleset holds the check and the squash, and how it is made from its file', () => {
    expect(doc).toContain('`.github/rulesets/main.json`');
    expect(doc).toContain('requires `pr-title / title`');
    expect(doc).toContain('only once `pr-title / title` has passed');
    expect(read('AGENTS.md')).toContain("`main`'s ruleset (`.github/rulesets/main.json`)");
    expect(doc).not.toMatch(/nothing requires the check/i);
    expect(doc).toContain(
      `id=$(gh api repos/{owner}/{repo}/rulesets --jq '.[] | select(.name == "main") | .id') if [ -n "$id" ]; then gh api -X PUT "repos/{owner}/{repo}/rulesets/$id" --input .github/rulesets/main.json else gh api -X POST repos/{owner}/{repo}/rulesets --input .github/rulesets/main.json fi`,
    );
  });

  it("says a squash takes just the pull request's title, and how that is set", () => {
    expect(doc).toContain(
      'gh api -X PATCH repos/{owner}/{repo} -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=BLANK',
    );
    expect(doc).toContain('Release Please reads a body too');
    expect(doc).toContain('a line of the description that reads as `fix: …`');
    expect(doc).toContain('a `BREAKING CHANGE:` footer');
    expect(doc).toContain('Merge commits and rebase merges stay on for the repository');
    expect(doc).toContain('pull requests into `layerbench-data`');
    expect(doc).not.toMatch(/choose the one that uses/);
  });
});
