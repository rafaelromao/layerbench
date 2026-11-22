import { bundledLayout, compileLayout, type Layout } from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import type { HeatSource } from '../engine/heat.js';
import { analyzeImage, compareImage, type SharedLayout, unsavedVersion } from './share-image.js';

const layout = bundledLayout('qwerty') as Layout;
const compiled = compileLayout(layout);

/** A report of presses on two layers: 8 and 2 on the first layer's keys 0 and 1, 10 on the second's. */
function report(over: Partial<HeatSource> = {}): HeatSource {
  const first = new Array(compiled.keys.length).fill(0);
  first[0] = 8;
  first[1] = 2;
  const second = new Array(compiled.keys.length).fill(0);
  second[0] = 10;
  return {
    usageByLayer: [first, second],
    usageAll: first.map((v, i) => v + second[i]),
    layerTapsByLayer: [],
    results: [],
    ...over,
  };
}

function shared(over: Partial<SharedLayout> = {}): SharedLayout {
  return {
    layout,
    compiled,
    typed: compiled,
    report: report(),
    unsaved: false,
    combos: true,
    ...over,
  };
}

describe('the image of the layout open in Analyze', () => {
  it('is its first layer, with the heat the page gives that layer', () => {
    const image = analyzeImage(shared(), 'usage', 'English · Layouts Doc');
    expect(image.boards).toHaveLength(1);
    const [board] = image.boards;
    expect(board?.tag).toBeNull();
    // One scale for every layer: the busiest key of all is the second layer's, with 10 presses.
    expect(board?.heat[0]).toBeCloseTo(0.8);
    expect(board?.heat[1]).toBeCloseTo(0.2);
    // 10 of the 20 presses are on the first layer.
    expect(board?.share).toBeCloseTo(0.5);
    expect(image.settings).toBe('English · Layouts Doc');
  });

  it('names what the colours measure, as the page does', () => {
    expect(analyzeImage(shared(), 'usage', '').heat).toBe('Usage');
  });

  it('names what is really drawn when the rule set lacks the rule asked for', () => {
    // No Effort rule in the report: the board draws Usage, and so does the image.
    expect(analyzeImage(shared(), 'effort', '').heat).toBe('Usage');
  });

  it('carries whether the version is unsaved, and the combos, as given', () => {
    const [board] = analyzeImage(shared({ unsaved: true, combos: false }), 'usage', '').boards;
    expect(board?.unsaved).toBe(true);
    expect(board?.combos).toBe(false);
  });
});

describe('the image of two layouts in Compare', () => {
  it('tags them A and B and draws both on the one scale given', () => {
    const image = compareImage(shared(), shared(), 'usage', 16, 'English');
    expect(image.boards.map((b) => b.tag)).toEqual(['A', 'B']);
    // The busiest key of either layout is 16, so 8 presses are half the scale on both.
    expect(image.boards[0]?.heat[0]).toBeCloseTo(0.5);
    expect(image.boards[1]?.heat[0]).toBeCloseTo(0.5);
    expect(image.heatNote).toMatch(/one scale for both layouts/);
  });

  it('keeps each side’s own credit and unsaved state', () => {
    const image = compareImage(shared({ unsaved: true }), shared(), 'usage', 10, '');
    expect(image.boards.map((b) => b.unsaved)).toEqual([true, false]);
  });
});

describe('an unsaved version, in Compare', () => {
  it('is a custom layout carried with changes that are not saved in it', () => {
    expect(unsavedVersion({ ref: 'inline:abc', storedId: 'mine', unsaved: true })).toBe(true);
  });

  it('is a layout carried whole that no saved layout is: the edits Analyze sends along', () => {
    expect(unsavedVersion({ ref: 'inline:abc', storedId: null, unsaved: false })).toBe(true);
  });

  it('is not a layout carried whole that is the saved one', () => {
    expect(unsavedVersion({ ref: 'inline:abc', storedId: 'mine', unsaved: false })).toBe(false);
  });

  it('is not a bundled, community or custom layout named by its id', () => {
    expect(unsavedVersion({ ref: 'qwerty', storedId: null, unsaved: false })).toBe(false);
    expect(unsavedVersion({ ref: 'community:ana-1', storedId: null, unsaved: false })).toBe(false);
    expect(unsavedVersion({ ref: 'custom:mine', storedId: 'mine', unsaved: false })).toBe(false);
  });

  it('is not known for a layout not opened yet', () => {
    expect(unsavedVersion({ ref: null, storedId: null, unsaved: false })).toBe(false);
  });
});
