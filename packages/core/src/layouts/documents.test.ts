import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toCanonicalJson } from '../layout/json.js';
import { BUNDLED_IDS } from './bundled-ids.js';
import { classicLayout } from './classic.js';
import { DOCUMENT_LAYOUTS, documentLayout, documentMissing } from './documents.js';
import { BUNDLED_LAYOUTS } from './index.js';

const DOCUMENTS = fileURLToPath(new URL('./documents/', import.meta.url));

/**
 * A layout as LayerBench saves it, with an author and a link. Built here rather than read from a
 * bundled layout's document, which a maintainer may take out of the Library.
 */
function saved(): Record<string, unknown> {
  const night = classicLayout({
    id: 'night',
    name: 'Night',
    author: 'Someone',
    rows: "b f l k q p g o u .\nn s h t m y c a e i\nx v j d z ' w / ; ,",
    link: 'https://example.com/night',
  });
  return JSON.parse(JSON.stringify(toCanonicalJson(night)));
}

describe('bundled layouts added as documents', () => {
  it('loads every file in documents/, each under its own name', () => {
    const files = existsSync(DOCUMENTS)
      ? readdirSync(DOCUMENTS)
          .filter((f) => f.endsWith('.json'))
          .map((f) => f.slice(0, -'.json'.length))
      : [];
    expect(DOCUMENT_LAYOUTS.map((l) => l.id).sort()).toEqual(files.sort());
  });

  it('lists the id of every bundled layout apart, for the sign-in server', () => {
    expect([...BUNDLED_IDS].sort()).toEqual(BUNDLED_LAYOUTS.map((l) => l.id).sort());
  });

  it('gives every bundled layout an id of its own', () => {
    const ids = BUNDLED_LAYOUTS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('takes a layout exactly as LayerBench saves it', () => {
    expect(documentLayout('night', saved()).name).toBe('Night');
  });

  it('turns away a file named for another layout', () => {
    expect(() => documentLayout('day', saved())).toThrow('name the file by its id');
  });

  it('turns away a document that is not as LayerBench saves it', () => {
    const { name, ...rest } = saved();
    // The same layout, its fields in another order: not what the editor's JSON panel gives.
    expect(() => documentLayout('night', { name, ...rest })).toThrow('as LayerBench saves it');
  });

  it('turns away a layout that names no author', () => {
    expect(() => documentLayout('night', { ...saved(), author: '' })).toThrow('no author');
  });

  it('takes a layout with no link', () => {
    const { link, ...unlinked } = saved();
    expect(link).toMatch(/^https:/);
    expect(documentLayout('night', unlinked).link).toBeUndefined();
  });

  it('turns away a link that is no http(s) URL', () => {
    expect(() => documentLayout('night', { ...saved(), link: 'night.example' })).toThrow(
      'is not a layout',
    );
  });
});

describe('what a layout lacks to be a document', () => {
  it('wants an author; a link is not needed', () => {
    expect(documentMissing({ author: ' ' })).toEqual(['author']);
    expect(documentMissing({ author: 'Ana' })).toEqual([]);
    expect(documentMissing({})).toEqual(['author']);
  });
});
