import { describe, expect, it } from 'vitest';
import { savedId, savedRef } from './ref.js';

describe('the reference to a saved document', () => {
  it('names a saved document by its id, and reads the id back', () => {
    expect(savedRef('magic-breeze')).toBe('saved:magic-breeze');
    expect(savedId(savedRef('magic-breeze'))).toBe('magic-breeze');
  });

  it('names no saved document when there is none to name', () => {
    // A preset, a bundled layout or text, a layout carried whole, an id alone.
    for (const ref of ['layouts_doc', 'qwerty', 'en-general', 'inline:abc', 'mine']) {
      expect(savedId(ref)).toBeNull();
    }
  });

  it('names no saved document by anything that is not a document id', () => {
    // A path, the name of an index, or the engine's copy of a saved text.
    for (const ref of ['saved:', 'saved:../../x', 'saved:index', 'saved:mine@1a2b3c']) {
      expect(savedId(ref)).toBeNull();
    }
  });
});
