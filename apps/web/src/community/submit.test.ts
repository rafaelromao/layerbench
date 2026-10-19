import { BUNDLED_LAYOUTS, type Layout } from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import { submissionProblems } from './submit.js';

const QWERTY = BUNDLED_LAYOUTS.find((l) => l.id === 'qwerty') as Layout;

/** A custom layout ready to submit: an id of its own, an author, and a linked source. */
function mine(changes: Partial<Layout> = {}): Layout {
  return {
    ...QWERTY,
    id: 'mine',
    name: 'Mine',
    author: 'Ana',
    description: 'From https://example.com/mine',
    ...changes,
  };
}

const NONE = { dirty: false, bundledIds: ['qwerty'], communityIds: ['theirs'] };

describe('what Submit checks before sending', () => {
  it('finds nothing missing in a complete, saved custom layout', () => {
    expect(submissionProblems(mine(), NONE)).toEqual([]);
  });

  it('says what is missing: an author, a link, saved changes', () => {
    const problems = submissionProblems(mine({ author: '', description: 'Mine.' }), {
      ...NONE,
      dirty: true,
    });
    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain('Save your changes');
    expect(problems[1]).toContain('author');
    expect(problems[2]).toContain('link');
  });

  it('wants an id no bundled or community layout has', () => {
    expect(submissionProblems(mine({ id: 'qwerty' }), NONE)).toEqual([
      'Rename it and save: a bundled layout already has the id "qwerty".',
    ]);
    expect(submissionProblems(mine({ id: 'theirs' }), NONE)).toEqual([
      'Rename it and save: a community layout already has the id "theirs".',
    ]);
    expect(submissionProblems(mine({ id: '../x' }), NONE)[0]).toContain('Save it');
  });

  it('wants a layout that compiles', () => {
    const [problem] = submissionProblems(
      mine({ geometry: { preset: 'no-such-board' } } as Partial<Layout>),
      NONE,
    );
    expect(problem).toMatch(/^Fix it so it compiles: /);
  });

  it('wants a layout no larger than the server takes', () => {
    const [problem] = submissionProblems(
      mine({ description: `https://example.com ${'x'.repeat(70_000)}` }),
      NONE,
    );
    expect(problem).toContain('Make it smaller');
  });
});
