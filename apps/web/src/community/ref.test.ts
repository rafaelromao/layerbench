import { describe, expect, it } from 'vitest';
import { communityId, communityRef } from './ref.js';

describe('the reference to a community layout', () => {
  it('names a community layout by its id, and reads the id back', () => {
    expect(communityRef('night-owl')).toBe('community:night-owl');
    expect(communityId(communityRef('night-owl'))).toBe('night-owl');
  });

  it('names none by anything else, or by what is not a document id', () => {
    for (const ref of ['qwerty', 'custom:mine', 'inline:abc', 'community:', 'community:../x']) {
      expect(communityId(ref)).toBeNull();
    }
  });
});
