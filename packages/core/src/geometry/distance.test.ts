import { describe, expect, it } from 'vitest';
import { keyDistance, xDistance, yDistance } from './distance.js';
import type { GeometryKey } from './types.js';

const key = (hand: 'L' | 'R', x: number, y: number): GeometryKey => ({
  id: `${hand}${x}${y}`,
  hand,
  finger: hand === 'L' ? 'LI' : 'RI',
  row: 1,
  col: 4,
  x,
  y,
  w: 1,
  h: 1,
  rotation: 0,
  home: false,
  thumb: false,
  inner: false,
});

describe('key distance', () => {
  const a = key('L', 0, 0);
  const b = key('L', 3, 4);

  it('measures in the model asked for', () => {
    expect(keyDistance(a, b)).toBe(5);
    expect(keyDistance(a, b, 'euclid')).toBe(5);
    expect(keyDistance(a, b, 'squared')).toBe(25);
    expect(keyDistance(a, b, 'manhattan')).toBe(7);
  });

  it('measures one axis at a time', () => {
    expect(xDistance(a, b)).toBe(3);
    expect(yDistance(b, a)).toBe(4);
  });

  it('is undefined between hands', () => {
    const other = key('R', 1, 1);
    expect(keyDistance(a, other)).toBeNull();
    expect(xDistance(a, other)).toBeNull();
    expect(yDistance(a, other)).toBeNull();
  });
});
