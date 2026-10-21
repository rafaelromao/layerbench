import { describe, expect, it } from 'vitest';
import { movedCommunityFiles } from './cleanup.js';

describe('the community files a promotion moved into the Library', () => {
  it('are those of layouts bundled now, and only layouts', () => {
    const listing = [
      'community/index.json',
      'community/breeze.json',
      'community/gust.json',
      'community/README.md',
      'community/nested/gust.json',
    ];
    expect(movedCommunityFiles(listing, ['qwerty', 'gust'])).toEqual(['community/gust.json']);
  });

  it('are none when nothing was promoted', () => {
    expect(
      movedCommunityFiles(['community/index.json', 'community/breeze.json'], ['qwerty']),
    ).toEqual([]);
  });
});
