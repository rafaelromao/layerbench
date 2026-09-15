import { describe, expect, it } from 'vitest';
import { type NavKey, nearestKey } from './key-nav.js';

// A split three-row board with a gap in the middle and a thumb below, in key units.
const keys: NavKey[] = [
  { x: 1, y: 0 }, // 0  left top
  { x: 2, y: 0 }, // 1
  { x: 1, y: 1 }, // 2  left home
  { x: 2, y: 1 }, // 3
  { x: 1, y: 2 }, // 4  left bottom
  { x: 7, y: 1 }, // 5  right home, across the split gap
  { x: 2.5, y: 3.25 }, // 6  left thumb
];

describe('nearestKey', () => {
  it('moves along a row and a column', () => {
    expect(nearestKey(keys, 0, 'right')).toBe(1);
    expect(nearestKey(keys, 1, 'left')).toBe(0);
    expect(nearestKey(keys, 0, 'down')).toBe(2);
    expect(nearestKey(keys, 2, 'up')).toBe(0);
  });

  it('prefers a straight neighbour over a nearer diagonal', () => {
    // From the left home key, down reaches the key directly below rather than the thumb.
    expect(nearestKey(keys, 2, 'down')).toBe(4);
  });

  it('crosses the split gap when there is nothing nearer', () => {
    expect(nearestKey(keys, 3, 'right')).toBe(5);
  });

  it('stops at the edge of the board', () => {
    expect(nearestKey(keys, 5, 'right')).toBeUndefined();
    expect(nearestKey(keys, 0, 'up')).toBeUndefined();
    expect(nearestKey(keys, 99, 'up')).toBeUndefined();
  });

  it('reaches the thumb from the bottom row', () => {
    expect(nearestKey(keys, 4, 'down')).toBe(6);
  });
});
