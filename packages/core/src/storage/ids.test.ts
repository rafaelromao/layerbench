import { describe, expect, it } from 'vitest';
import { freeId, idForName, isDocumentId, slug } from './ids.js';

describe('document ids', () => {
  it('makes an id of a name: lowercase ASCII words joined by dashes', () => {
    expect(slug('Magic Romak')).toBe('magic-romak');
    expect(slug('  Ação & Reação! ')).toBe('acao-reacao');
  });

  it('takes the slug of the name while no other document has it', () => {
    expect(freeId('Qwerty copy', new Set())).toBe('qwerty-copy');
    expect(freeId('Qwerty copy', new Set(['qwerty']))).toBe('qwerty-copy');
  });

  it('numbers the slug rather than taking an id in use', () => {
    expect(freeId('Qwerty', new Set(['qwerty']))).toBe('qwerty-2');
    expect(freeId('Qwerty', new Set(['qwerty', 'qwerty-2', 'qwerty-3']))).toBe('qwerty-4');
  });

  // `layouts/index.json` is the index itself; a layout called Index must not overwrite it.
  it('never gives a document the id of the index file', () => {
    expect(freeId('Index', new Set())).toBe('index-2');
    expect(isDocumentId('index')).toBe(false);
    expect(isDocumentId('Index')).toBe(false);
    expect(isDocumentId('index-2')).toBe(true);
  });

  it('accepts only the ids it can make itself', () => {
    expect(isDocumentId('magic-romak')).toBe(true);
    expect(isDocumentId('item-Ab3_')).toBe(true);
    expect(isDocumentId('')).toBe(false);
    expect(isDocumentId('../../user')).toBe(false);
    expect(isDocumentId('a/b')).toBe(false);
    expect(isDocumentId('mine#')).toBe(false);
    expect(isDocumentId('mine?x')).toBe(false);
    expect(isDocumentId('mine.json')).toBe(false);
  });
});

describe('the id of a renamed document', () => {
  const taken = new Set(['qwerty', 'qwerty-2', 'qwerty-copy', 'my-layout']);

  it('stays while it matches the name, numbered or not, so saving again never moves it', () => {
    expect(idForName('Qwerty copy', 'qwerty-copy', taken)).toBe('qwerty-copy');
    // Saved beside another Qwerty, it keeps its number even once that one is gone.
    expect(idForName('Qwerty', 'qwerty-2', taken)).toBe('qwerty-2');
    expect(idForName('Qwerty', 'qwerty-2', new Set(['qwerty-2']))).toBe('qwerty-2');
  });

  it('follows a new name', () => {
    expect(idForName('Colemak mine', 'qwerty-copy', taken)).toBe('colemak-mine');
    // A slug its own old id shares does not count as taken.
    expect(idForName('Qwerty copy 2', 'qwerty-copy', taken)).toBe('qwerty-copy-2');
  });

  it('numbers around a name another document already has', () => {
    expect(idForName('My layout', 'qwerty-copy', taken)).toBe('my-layout-2');
  });

  it('keeps the id of a name with nothing to slug, rather than making one up each time', () => {
    expect(idForName('Ρωμαϊκό', 'qwerty-copy', taken)).toBe('qwerty-copy');
    expect(idForName('!!!', 'qwerty-copy', taken)).toBe('qwerty-copy');
  });

  // The current id came from the link, so a crafted one must not survive a save.
  it('replaces an id that could not have been made here', () => {
    expect(idForName('Qwerty', '../../../user', taken)).toBe('qwerty-3');
    expect(idForName('Ρωμαϊκό', '../../../user', taken)).toMatch(/^item-[A-Za-z0-9_-]+$/);
  });
});
