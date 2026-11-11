import { describe, expect, it } from 'vitest';
import {
  type LibraryArea,
  type LibraryPullAction,
  libraryPull,
  libraryRetitle,
} from './library-title.js';
import { MAX_TITLE_LENGTH, pullTitleProblems } from './pr-title.js';

const AREAS: LibraryArea[] = ['library', 'community'];
const ACTIONS: LibraryPullAction[] = ['add', 'change', 'delete', 'promote', 'update'];

describe('libraryPull', () => {
  it('writes each case as the convention reads it', () => {
    expect(libraryPull('library', 'change', 'enthium')).toEqual({
      title: 'fix(library): change enthium',
      commit: 'chore(library): change enthium',
    });
    expect(libraryPull('library', 'delete', 'bird').title).toBe('fix(library): delete bird');
    expect(libraryPull('library', 'promote', 'my-layout').title).toBe(
      'feat(library): promote my-layout',
    );
    expect(libraryPull('community', 'add', 'breeze').title).toBe('feat(community): add breeze');
    expect(libraryPull('community', 'change', 'breeze').title).toBe(
      'fix(community): change breeze',
    );
    expect(libraryPull('community', 'delete', 'breeze').title).toBe(
      'fix(community): delete breeze',
    );
  });

  it('makes a title and a commit the convention accepts, for every case', () => {
    for (const area of AREAS) {
      for (const action of ACTIONS) {
        const { title, commit } = libraryPull(area, action, 'a_b-C-2');
        expect(pullTitleProblems(title)).toEqual([]);
        expect(pullTitleProblems(commit)).toEqual([]);
      }
    }
  });

  it('adds are features and changes are fixes; the commit on the branch is never either', () => {
    // Release Please reads the pull request's title once, and its branch's commits not at all
    // (chore is hidden): a merge commit's history has both, so a commit that were feat or fix
    // would count the change twice.
    for (const area of AREAS) {
      expect(libraryPull(area, 'add', 'x').title).toMatch(/^feat\(/);
      expect(libraryPull(area, 'promote', 'x').title).toMatch(/^feat\(/);
      expect(libraryPull(area, 'change', 'x').title).toMatch(/^fix\(/);
      expect(libraryPull(area, 'delete', 'x').title).toMatch(/^fix\(/);
      for (const action of ACTIONS) {
        expect(libraryPull(area, action, 'x').commit).toMatch(/^chore\(/);
      }
    }
  });

  it('shortens an id too long for a title, so the title and the commit are the length allowed', () => {
    const { title, commit } = libraryPull('community', 'change', 'a'.repeat(300));
    expect(commit).toHaveLength(MAX_TITLE_LENGTH);
    expect(title.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    expect(title.endsWith('…')).toBe(true);
    expect(pullTitleProblems(title)).toEqual([]);
    expect(pullTitleProblems(commit)).toEqual([]);
  });

  it('refuses an id that would break the title', () => {
    expect(() => libraryPull('library', 'change', 'a\nb')).toThrow(/not a conventional title/);
  });
});

describe('libraryRetitle', () => {
  it('gives a title the sign-in server of before the convention left as it was, from the request', () => {
    // What a Worker deployed before the convention opened #150 with.
    expect(libraryRetitle({ action: 'change', id: 'enthium' }, 'Library: change enthium')).toBe(
      'fix(library): change enthium',
    );
    expect(
      libraryRetitle({ action: 'promote', id: 'my-layout' }, 'Library: promote my-layout'),
    ).toBe('feat(library): promote my-layout');
    expect(libraryRetitle({ action: 'delete', id: 'bird' }, 'Library: delete bird')).toBe(
      'fix(library): delete bird',
    );
  });

  it('leaves a title that follows the convention, a person’s own too', () => {
    expect(
      libraryRetitle({ action: 'change', id: 'enthium' }, 'fix(library): change enthium'),
    ).toBe(null);
    expect(
      libraryRetitle({ action: 'change', id: 'enthium' }, 'feat(layouts): upgrade Enthium to v15'),
    ).toBe(null);
  });

  it('is null for a request that cannot be applied: nothing is made of it', () => {
    expect(libraryRetitle({ action: 'drop', id: 'enthium' }, 'Library: drop enthium')).toBe(null);
    expect(libraryRetitle({ action: 'change', id: '../x' }, 'Library: change ../x')).toBe(null);
    expect(libraryRetitle({ action: 'change' }, 'Library: change')).toBe(null);
    expect(libraryRetitle({}, '')).toBe(null);
  });

  it('leaves a title that was not read: it could be a person’s own', () => {
    expect(libraryRetitle({ action: 'change', id: 'enthium' }, '')).toBe(null);
    expect(libraryRetitle({ action: 'change', id: 'enthium' }, '  \n')).toBe(null);
  });

  it('is a title the convention accepts, for every action a request has', () => {
    for (const action of ['change', 'delete', 'promote']) {
      const title = libraryRetitle({ action, id: 'a_b-C-2' }, 'Library: something');
      expect(pullTitleProblems(title as string)).toEqual([]);
    }
  });
});
