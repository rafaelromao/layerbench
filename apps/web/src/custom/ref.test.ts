import { describe, expect, it } from 'vitest';
import { customId, customRef } from './ref.js';

describe('the reference to a custom document', () => {
  it('names a custom document by its id, and reads the id back', () => {
    expect(customRef('magic-breeze')).toBe('custom:magic-breeze');
    expect(customId(customRef('magic-breeze'))).toBe('magic-breeze');
  });

  it('names no custom document when there is none to name', () => {
    // A preset, a bundled layout or text, a layout carried whole, an id alone.
    for (const ref of ['layouts_doc', 'qwerty', 'en-general', 'inline:abc', 'mine']) {
      expect(customId(ref)).toBeNull();
    }
  });

  it('no longer reads `saved:`, the spelling links had before documents were called custom', () => {
    expect(customId('saved:mine')).toBeNull();
  });

  it('names no custom document by anything that is not a document id', () => {
    // A path, the name of an index, or the engine's copy of a custom text.
    for (const ref of ['custom:', 'custom:../../x', 'custom:index', 'custom:mine@1a2b3c']) {
      expect(customId(ref)).toBeNull();
    }
  });
});
