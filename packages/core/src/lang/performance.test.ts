import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { corporaRoot } from '../golden/paths.js';
import { BUNDLED_LAYOUTS, DOCUMENT_LAYOUTS, goldenLayouts } from '../layouts/index.js';
import stored from '../layouts/languages.json';
import { measureLanguage } from './measure.js';
import {
  LANGUAGE_CORPORA,
  LANGUAGES_PRESET,
  orderedLanguages,
  PERFORMANCE_LANGUAGES,
  performsWell,
} from './performance.js';
import { LANGUAGE_PROFILES } from './profiles.js';

const entry = (id: string, effort: number, covers = true) => ({ id, effort, covers });

describe('performing well in a language', () => {
  it('takes the better half by Effort, lowest first', () => {
    const got = performsWell([entry('a', 300), entry('b', 250), entry('c', 400), entry('d', 280)]);
    expect([...got].sort()).toEqual(['b', 'd']);
  });

  it('takes the middle layout of an odd number, which fewer than half beat', () => {
    const got = performsWell([entry('a', 1), entry('b', 2), entry('c', 3)]);
    expect([...got].sort()).toEqual(['a', 'b']);
  });

  it('counts a tie once: layouts of equal Effort are in or out together', () => {
    const got = performsWell([entry('a', 1), entry('b', 2), entry('c', 2), entry('d', 3)]);
    expect([...got].sort()).toEqual(['a', 'b', 'c']);
  });

  it('leaves out a layout that cannot type the language, however low its Effort', () => {
    const got = performsWell([entry('a', 1, false), entry('b', 2), entry('c', 3), entry('d', 4)]);
    expect([...got].sort()).toEqual(['b']);
  });

  it('lists a layout’s languages in the order the profiles give them', () => {
    expect(orderedLanguages(new Set(['de', 'en', 'pt-BR']))).toEqual(['en', 'pt-BR', 'de']);
  });
});

describe('what each language is measured on', () => {
  it('is every language with a profile', () => {
    expect([...PERFORMANCE_LANGUAGES]).toEqual(Object.keys(LANGUAGE_PROFILES));
  });

  it('is a shipped corpus of that language', () => {
    for (const tag of PERFORMANCE_LANGUAGES) {
      const manifest = JSON.parse(
        readFileSync(`${corporaRoot()}/${LANGUAGE_CORPORA[tag]}/manifest.json`, 'utf8'),
      );
      expect(manifest.language, tag).toBe(tag);
      expect(manifest.source, tag).toMatch(/Leipzig|wortschatz/i);
    }
  });

  it('uses the rules a bare visit to the Library ranks on', () => {
    expect(LANGUAGES_PRESET).toBe('layouts_doc');
  });
});

/**
 * The languages each bundled layout is for are measured, not chosen: `pnpm languages` writes them.
 * Any change that moves a layout's Effort, or adds a layout, can move them, and this says so.
 */
describe('bundled layouts’ languages', () => {
  it('are stored for every layout written in code, and only those', () => {
    expect(Object.keys(stored)).toEqual(goldenLayouts().map((l) => l.id));
  });

  it('are what each layout carries', () => {
    const want = stored as Record<string, string[]>;
    for (const layout of goldenLayouts()) {
      expect(layout.languages, layout.id).toEqual(want[layout.id as string]);
    }
  });

  for (const tag of PERFORMANCE_LANGUAGES) {
    it(`for ${tag}: the layouts that type it and are in the better half by Effort`, async () => {
      const measured = await measureLanguage(tag);
      const declared = BUNDLED_LAYOUTS.filter((l) => l.languages?.includes(tag)).map((l) => l.id);
      expect(declared, 'run `pnpm languages`').toEqual(
        BUNDLED_LAYOUTS.filter((l) => measured.has(l.id as string)).map((l) => l.id),
      );
    });
  }

  it('cover a document layout too, as its own file says', () => {
    for (const layout of DOCUMENT_LAYOUTS) {
      expect(layout.languages, layout.id).toEqual(orderedLanguages(new Set(layout.languages)));
    }
  });
});
