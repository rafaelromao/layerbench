import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { goldenPath } from '../golden/paths.js';
import { DOCUMENT_LAYOUTS, documentLayout } from './documents.js';
import { BUNDLED_LAYOUTS } from './index.js';

const DOCUMENTS = fileURLToPath(new URL('./documents/', import.meta.url));

/** A layout as LayerBench saves it, with an author and a linked source: Night's checked-in document. */
function saved(): Record<string, unknown> {
  return JSON.parse(readFileSync(goldenPath('layouts/night.json'), 'utf8'));
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

  it('turns away a layout that names no author, or no source', () => {
    expect(() => documentLayout('night', { ...saved(), author: '' })).toThrow('no author');
    expect(() => documentLayout('night', { ...saved(), description: 'Mine.' })).toThrow(
      'gives no link',
    );
  });
});
