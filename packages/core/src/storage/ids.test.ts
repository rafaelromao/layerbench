import { describe, expect, it } from 'vitest';
import {
  assertDocumentId,
  documentPath,
  freeId,
  idForName,
  indexPath,
  indexSummary,
  isDocumentId,
  StorageConflictError,
  slug,
  unusedId,
} from './ids.js';

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

describe('an unused id', () => {
  it('is the base while nothing has it, then the base numbered from 2', () => {
    expect(unusedId('nav', new Set())).toBe('nav');
    expect(unusedId('nav', new Set(['nav']))).toBe('nav-2');
    expect(unusedId('nav', new Set(['nav', 'nav-2']))).toBe('nav-3');
  });

  // Numbering by how many there are lands on a number already in use once one has gone.
  it('skips every number in use, not just the count', () => {
    expect(unusedId('nav', new Set(['nav', 'sym', 'nav-3', 'nav-2']))).toBe('nav-4');
    expect(unusedId('lhm-lhi', new Set(['lhm-lhi', 'lhm-lhi-3']))).toBe('lhm-lhi-2');
  });
});

describe('document paths and guards', () => {
  it('lays a document out under its collection', () => {
    expect(documentPath('layouts', 'qwerty')).toBe('layouts/qwerty.json');
    expect(indexPath('corpora')).toBe('corpora/index.json');
  });

  it('refuses an id that is not a plain word', () => {
    expect(() => assertDocumentId('../etc')).toThrow('invalid document id');
    expect(() => assertDocumentId('index')).toThrow('invalid document id');
    expect(() => assertDocumentId('ok-id')).not.toThrow();
  });

  it('makes up an id for a name with nothing to slug', () => {
    expect(slug('!!!')).toMatch(/^item-[A-Za-z0-9_-]+$/);
  });

  it('is an error that says why it was thrown', () => {
    const e = new StorageConflictError();
    expect(e.name).toBe('StorageConflictError');
    expect(e.message).toContain('changed');
    expect(new StorageConflictError('mine').message).toBe('mine');
  });
});

describe('an index row', () => {
  it('summarises a layout by its author, languages, geometry and layer count', () => {
    const row = indexSummary('layouts', 'x', {
      name: 'X',
      author: 'me',
      languages: ['en'],
      geometry: { preset: 'ortho' },
      layers: [{}, {}],
    });
    expect(row).toMatchObject({
      id: 'x',
      name: 'X',
      author: 'me',
      languages: ['en'],
      geometry: 'ortho',
      layers: 2,
    });
  });

  it('summarises a rule set and a text, and skips what is missing', () => {
    expect(
      indexSummary('rulesets', 'r', { name: 'R', description: 'd', rules: [1] }),
    ).toMatchObject({
      description: 'd',
      rules: 1,
    });
    const text = indexSummary('corpora', 'c', { language: 'en', words: 5 });
    expect(text).toMatchObject({ name: 'c', language: 'en', words: 5 });
    expect(text).not.toHaveProperty('license');
  });
});
