import { describe, expect, it } from 'vitest';
import { MAX_TITLE_LENGTH, PULL_SCOPES, PULL_TYPES, pullTitleProblems } from './pr-title.js';

describe('pullTitleProblems', () => {
  it.each([
    'feat: a Languages filter',
    'fix(library): change enthium',
    'feat(layouts)!: drop the default layers',
    'docs(guide): say how a title is checked',
    'chore(deps): bump vitest',
    'revert: feat(editor): macro steps',
    'ci(ci): run the title check on edits',
    // Release Please's own pull request, by the default pattern and its tag's prefix.
    'chore(main): release 0.3.0',
    'chore(main): release v1.0.0-rc.1',
    'chore(main): release layerbench 0.3.0',
  ])('accepts %s', (title) => {
    expect(pullTitleProblems(title)).toEqual([]);
  });

  it('accepts every type and every scope', () => {
    for (const type of PULL_TYPES) expect(pullTitleProblems(`${type}: x`)).toEqual([]);
    for (const scope of PULL_SCOPES) expect(pullTitleProblems(`fix(${scope}): x`)).toEqual([]);
  });

  it.each([
    ['Upgrade Enthium to v15', /does not start with `type\(scope\): `/],
    ['Library: change colemak', /`Library` is not a type/],
    ['Feat: a filter', /`Feat` is not a type.*lowercase/],
    ['feature: a filter', /`feature` is not a type/],
    ['feat(Library): a filter', /`Library` is not a scope/],
    ['feat(parser): a filter', /`parser` is not a scope/],
    ['feat(): a filter', /scope is empty/],
    ['feat:a filter', /followed by a space/],
    ['feat:  a filter', /one space, not more/],
    ['feat: ', /description .* missing/],
    ['feat:', /description .* missing/],
    [': a filter', /no type before the colon/],
    [' feat: a filter', /spaces before or after/],
    ['feat: a filter ', /spaces before or after/],
    ['feat: a\nfilter', /more than one line/],
    [`feat: ${'x'.repeat(MAX_TITLE_LENGTH)}`, /characters long; at most 100/],
    ['Merge pull request #1 from a/b', /does not start with/],
    ['chore(main): release soon', /does not start with|not a scope/],
  ])('refuses %j, and says why', (title, why) => {
    const problems = pullTitleProblems(title);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' | ')).toMatch(why);
  });

  it('names every part that is wrong, not only the first', () => {
    // A type that is not one, a scope that is not one, and nothing after the colon.
    const problems = pullTitleProblems('Library(Parser):');
    expect(problems).toHaveLength(3);
  });

  it('takes the breaking mark before the colon only', () => {
    expect(pullTitleProblems('feat!: x')).toEqual([]);
    expect(pullTitleProblems('feat(web)!: x')).toEqual([]);
    expect(pullTitleProblems('feat!(web): x')).not.toEqual([]);
  });

  it('keeps every type one that Release Please reads from a merge commit', () => {
    // Release Please splits a merge commit's message at a blank line before one of these; a type
    // outside this list would pass here and never reach the changelog.
    expect([...PULL_TYPES].sort()).toEqual(
      [
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
      ].sort(),
    );
  });
});
