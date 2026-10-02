import { describe, expect, it } from 'vitest';
import { itemLayer } from './item-layer.js';

describe('the layer an item is shown on', () => {
  it('is the one its keys share', () => {
    expect(itemLayer([0, 0])).toBe(0);
    expect(itemLayer([3, 3, 3])).toBe(3);
  });

  it('is the last layer above the base an item goes to, when it crosses layers', () => {
    // A thumb on the base layer, then a letter on Alpha 2.
    expect(itemLayer([0, 1])).toBe(1);
    expect(itemLayer([1, 0])).toBe(1);
    expect(itemLayer([1, 0, 5])).toBe(5);
  });

  it('is nothing when the item names no layers', () => {
    expect(itemLayer(undefined)).toBeNull();
    expect(itemLayer([])).toBeNull();
  });
});
