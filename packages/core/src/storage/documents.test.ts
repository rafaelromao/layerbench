import { describe, expect, it } from 'vitest';
import {
  assertDocumentId,
  documentPath,
  indexPath,
  indexSummary,
  StorageConflictError,
  slug,
} from './ids.js';

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
