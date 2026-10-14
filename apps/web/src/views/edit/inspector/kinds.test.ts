import { describe, expect, it } from 'vitest';
import { PART_KINDS, TAP_KINDS } from './kinds.js';

describe('the kinds of key a part can be', () => {
  it('offers an adaptive key and an alt repeat for the tap of a tap-hold, and not for any part', () => {
    expect(TAP_KINDS).toEqual([...PART_KINDS, 'adaptive', 'altrepeat']);
    expect(PART_KINDS).not.toContain('adaptive');
  });
});
