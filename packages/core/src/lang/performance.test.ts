import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { corporaRoot } from '../golden/paths.js';
import { toCanonicalJson } from '../layout/json.js';
import {
  BUNDLED_LAYOUTS,
  DOCUMENT_LAYOUTS,
  documentLayout,
  goldenLayouts,
} from '../layouts/index.js';
import stored from '../layouts/languages.json';
import { measureLanguage } from './measure.js';
import {
  LANGUAGE_CORPORA,
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

  it('refuses a layout with no Effort, which nothing would beat', () => {
    expect(() => performsWell([entry('a', Number.NaN), entry('b', 2)])).toThrow('a has no Effort');
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
});

/**
 * The languages each bundled layout is for are measured, not chosen: `pnpm languages` writes them.
 * Any change that moves a layout's Effort, or adds a layout, can move them, and this says so.
 */
describe('bundled layouts’ languages', () => {
  it('are stored for every layout written in code, and only those', () => {
    expect(Object.keys(stored)).toEqual(goldenLayouts().map((l) => l.id));
  });

  it('name only measured languages, each once, in the profiles’ order', () => {
    const lists = [
      ...Object.values(stored as Record<string, string[]>),
      ...DOCUMENT_LAYOUTS.map((l) => l.languages ?? []),
    ];
    for (const list of lists) expect(list).toEqual(orderedLanguages(new Set(list)));
  });

  it('can be none: a document for no language is written without them, and reads back so', () => {
    const [layout] = DOCUMENT_LAYOUTS;
    const doc = toCanonicalJson({ ...layout, languages: [] });
    expect(documentLayout(layout.id as string, doc).languages ?? []).toEqual([]);
  });

  for (const tag of PERFORMANCE_LANGUAGES) {
    // An analysis of every bundled layout, about three times slower under coverage on a CI runner.
    it(`for ${tag}: the layouts that type it and are in the better half by Effort`, {
      timeout: 180_000,
    }, async () => {
      const measured = await measureLanguage(tag);
      const declared = BUNDLED_LAYOUTS.filter((l) => l.languages?.includes(tag)).map((l) => l.id);
      expect(declared, 'run `pnpm languages`').toEqual(
        BUNDLED_LAYOUTS.filter((l) => measured.has(l.id as string)).map((l) => l.id),
      );
    });
  }
});
