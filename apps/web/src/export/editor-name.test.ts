import { afterEach, describe, expect, it, vi } from 'vitest';
import { rememberEditor, rememberedEditor } from './editor-name.js';

afterEach(() => vi.restoreAllMocks());

describe('the name kept for whoever made the edits', () => {
  it('is none until one is typed', () => {
    expect(rememberedEditor()).toBeNull();
  });

  it('is what was typed last, an empty name too', () => {
    rememberEditor('@ana');
    expect(rememberedEditor()).toBe('@ana');
    rememberEditor('');
    expect(rememberedEditor()).toBe('');
  });

  it('is none where storage cannot be read, and is not lost to one that cannot be written', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(rememberedEditor()).toBeNull();
    expect(() => rememberEditor('@ana')).not.toThrow();
  });
});
