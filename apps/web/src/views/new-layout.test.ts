import { describe, expect, it } from 'vitest';
import { newLayout } from './new-layout.js';

describe('a new layout', () => {
  // Its maker states no language yet: it is for English until they do, as an import is.
  it('is for English, empty or from Qwerty, with the default layers or without', () => {
    for (const start of ['empty', 'qwerty'] as const) {
      for (const defaultLayers of [false, true]) {
        const layout = newLayout({ name: 'Mine', geometry: '3x5+2', start, defaultLayers });
        expect(layout.languages, `${start} ${defaultLayers}`).toEqual(['en']);
      }
    }
  });
});
