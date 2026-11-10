import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { corporaRoot } from '../golden/paths.js';
import { compileLayout } from '../layout/compile.js';
import { toCanonicalJson } from '../layout/json.js';
import type { Layout } from '../layout/types.js';
import {
  BUNDLED_LAYOUTS,
  bundledLayout,
  DEFAULT_LAYOUT_ID,
  DOCUMENT_LAYOUTS,
  documentLayout,
  goldenLayouts,
} from '../layouts/index.js';
import { layoutLanguageCoverage } from './coverage.js';
import {
  BUNDLED_EFFORTS,
  beatenBy,
  effortsFileText,
  LANGUAGE_CORPORA,
  measureLayoutLanguages,
  orderedLanguages,
  PERFORMANCE_LANGUAGES,
  performsWell,
  withAddedLanguages,
} from './performance.js';
import { LANGUAGE_PROFILES } from './profiles.js';

/** The languages measured by a `performance-<tag>.test.ts` of their own, as the files say. */
const measuringFiles = (): string[] => {
  const dir = new URL('.', import.meta.url);
  return readdirSync(dir)
    .flatMap((name) => {
      const tag = /^performance-(\w+)\.test\.ts$/.exec(name)?.[1];
      if (tag === undefined) return [];
      const text = readFileSync(new URL(name, dir), 'utf8');
      return text.includes(`measuresEfforts('${tag}')`) ? [tag] : [];
    })
    .sort();
};

describe('performing well in a language', () => {
  // The Efforts of four bundled layouts: fewer than half of them must beat a layout's Effort.
  const four = [250, 280, 300, 400];

  it('is being beaten by fewer than half of the bundled layouts', () => {
    expect(four.map((e) => performsWell(e, four))).toEqual([true, true, false, false]);
    expect(performsWell(270, four)).toBe(true);
    expect(performsWell(290, four)).toBe(false);
    expect(performsWell(100, four)).toBe(true);
    expect(performsWell(900, four)).toBe(false);
  });

  it('takes the middle layout of an odd number, which fewer than half beat', () => {
    expect([1, 2, 3].map((e) => performsWell(e, [1, 2, 3]))).toEqual([true, true, false]);
  });

  it('counts a tie once: layouts of equal Effort are in or out together', () => {
    expect([1, 2, 2, 3].map((e) => performsWell(e, [1, 2, 2, 3]))).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it('compares Efforts at the decimals they are stored at', () => {
    expect(beatenBy(2.0004, [1, 2, 2, 3])).toBe(1);
    expect(beatenBy(1.9996, [1, 2, 2, 3])).toBe(1);
    expect(beatenBy(2.001, [1, 2, 2, 3])).toBe(3);
  });

  it('refuses a layout with no Effort, which nothing would beat', () => {
    expect(() => performsWell(Number.NaN, four)).toThrow('no Effort');
  });

  it('lists a layout’s languages in the order the profiles give them', () => {
    expect(orderedLanguages(new Set(['de', 'en', 'pt']))).toEqual(['en', 'pt', 'de']);
  });
});

describe('measuring a layout’s languages', () => {
  const efforts = Object.fromEntries(
    PERFORMANCE_LANGUAGES.map((tag) => [tag, [250, 280, 300, 400]]),
  );
  // Qwerty as a layout for no language yet: bundled, it is for English.
  const qwerty: Layout = { ...(bundledLayout('qwerty') as Layout), languages: [] };
  const kinds = (layout: Layout, effort: (tag: string) => number) =>
    measureLayoutLanguages(layout, async (tag) => effort(tag), efforts).then((verdicts) =>
      Object.fromEntries(verdicts.map((v) => [v.tag, v.kind])),
    );

  it('adds a language it types and performs well in, and leaves out one it types and does not', async () => {
    const verdicts = await measureLayoutLanguages(qwerty, async () => 270, efforts);
    expect(verdicts.find((v) => v.tag === 'en')).toEqual({
      tag: 'en',
      kind: 'added',
      effort: 270,
      beaten: 1,
      of: 4,
    });
    expect(await kinds(qwerty, () => 290)).toMatchObject({ en: 'worse' });
    const worse = await measureLayoutLanguages(qwerty, async () => 290, efforts);
    expect(worse.find((v) => v.tag === 'en')).toMatchObject({ kind: 'worse', beaten: 2, of: 4 });
  });

  it('names the letters of a language it cannot write, and does not analyze that language', async () => {
    const effortOn = vi.fn(async (_tag: string) => 100);
    const verdicts = await measureLayoutLanguages(qwerty, effortOn, efforts);
    const pt = verdicts.find((v) => v.tag === 'pt');
    expect(pt).toMatchObject({ kind: 'lacks' });
    expect((pt as { missing: string[] }).missing).toEqual(
      expect.arrayContaining(['á', 'à', 'ã', 'ç']),
    );
    expect(effortOn.mock.calls.map(([tag]) => tag)).toEqual(['en']);
  });

  it('leaves a language the layout is for as it is, without analyzing it', async () => {
    const magic = bundledLayout('magic-romak') as Layout;
    const effortOn = vi.fn(async (_tag: string) => 100);
    const verdicts = await measureLayoutLanguages(magic, effortOn, efforts);
    expect(verdicts.filter((v) => v.kind === 'already').map((v) => v.tag)).toEqual(['en', 'pt']);
    expect(effortOn.mock.calls.map(([tag]) => tag)).not.toContain('en');
    expect(effortOn.mock.calls.map(([tag]) => tag)).not.toContain('pt');
  });

  it('is the same for a copy of a bundled layout as for a layout of the user’s', async () => {
    const copy = { ...qwerty, id: undefined, name: 'My Qwerty' } as Layout;
    expect(await kinds(copy, () => 270)).toEqual(await kinds(qwerty, () => 270));
  });

  it('adds what it found to the languages the layout has, in the profiles’ order', async () => {
    const verdicts = await measureLayoutLanguages(qwerty, async () => 270, efforts);
    expect(withAddedLanguages([], verdicts)).toEqual(['en']);
    expect(withAddedLanguages(['de'], verdicts)).toEqual(['en', 'de']);
    // A tag the profiles do not know is kept, after those they do.
    expect(withAddedLanguages(['xx', 'en'], verdicts)).toEqual(['en', 'xx']);
    expect(withAddedLanguages(['pt'], [])).toEqual(['pt']);
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
 * The languages each bundled layout is for are the ones its author states, in its definition (a
 * layout added as a document carries its own): a text in a language, or a corpus of one, that the
 * author's page or keymap names. A layout whose author states none is for English, and the editor's
 * "Measure languages" can add the others it performs well in.
 */
const STATED: Record<string, string[]> = {
  // Both write Portuguese and English: Romak types `à` with the combo of `á` and `é` on Alpha 2.
  romak: ['en', 'pt'],
  'magic-romak': ['en', 'pt'],
  ...Object.fromEntries(
    [
      'qwerty',
      'dvorak',
      'colemak',
      'colemak-dh',
      'graphite',
      'gallium',
      'canary',
      'sturdy',
      'aptv3',
      'hands-down-neu',
      'night',
      'dusk',
      'recurva',
      'focal',
      'nerps',
      'engram',
      'sunlight',
      'snth',
      'aptmak',
      'bird',
      'bird-30',
      'hands-down-gold',
      'hands-down-promethium',
      'hands-down-vibranium',
      'rsthd',
      't-34',
      'magic-sturdy',
      'enthium',
      'nordrassil',
      'finch',
      'caksoylar',
      'uno',
      'ben-vallack-piano',
    ].map((id) => [id, ['en']]),
  ),
};

describe('bundled layouts’ languages', () => {
  it('are the ones their authors state, for every layout written in code', () => {
    const written = Object.fromEntries(goldenLayouts().map((l) => [l.id, l.languages ?? []]));
    expect(written).toEqual(STATED);
  });

  // Not one is left without: a layout whose author states none is for English.
  it('are at least one for every bundled layout, documents too', () => {
    for (const layout of BUNDLED_LAYOUTS) {
      expect(
        layout.languages?.length ?? 0,
        `${layout.id} names no language: give its document "languages", ["en"] when its author states none`,
      ).toBeGreaterThan(0);
    }
  });

  it('name only languages the app knows, each once, in the profiles’ order', () => {
    for (const layout of BUNDLED_LAYOUTS) {
      const list = layout.languages ?? [];
      expect(list, layout.id).toEqual(orderedLanguages(new Set(list)));
    }
  });

  it('are ones the layout types: every letter the language needs', () => {
    for (const layout of BUNDLED_LAYOUTS) {
      const compiled = compileLayout(layout);
      for (const tag of layout.languages ?? []) {
        expect(
          layoutLanguageCoverage(compiled, tag)?.missingRequired,
          `${layout.id} ${tag}`,
        ).toEqual([]);
      }
    }
  });

  it('can be fewer than those a layout types: Magic Romak types Spanish and Italian, and is for English and Portuguese', () => {
    // His keymap has no `¿` or `¡`, and he writes English and Portuguese.
    const magic = bundledLayout('magic-romak') as Layout;
    expect(magic.languages).toEqual(['en', 'pt']);
    const compiled = compileLayout(magic);
    for (const tag of ['es', 'it'])
      expect(layoutLanguageCoverage(compiled, tag)?.missingRequired, tag).toEqual([]);
  });

  it('can be none: a document for no language is written without them, and reads back so', () => {
    // Any layout that names its author, as a document must: the Library always keeps this one.
    const layout = bundledLayout(DEFAULT_LAYOUT_ID) as Layout;
    const doc = toCanonicalJson({ ...layout, languages: [] });
    expect(documentLayout(layout.id as string, doc).languages ?? []).toEqual([]);
  });

  it('are carried by a layout added as a document, as saved', () => {
    for (const layout of DOCUMENT_LAYOUTS) {
      expect(layout.languages ?? []).toEqual(orderedLanguages(new Set(layout.languages ?? [])));
    }
  });
});

/**
 * The Efforts the editor measures a layout against are the bundled layouts' own, stored by
 * `pnpm languages`. Any change that moves a layout's Effort on a language, or adds or removes a
 * layout, moves them, and this says so.
 */
describe('the bundled layouts’ Efforts on each language', () => {
  it('are stored for every language, one Effort for each bundled layout, lowest first', () => {
    expect(Object.keys(BUNDLED_EFFORTS)).toEqual([...PERFORMANCE_LANGUAGES]);
    for (const [tag, list] of Object.entries(BUNDLED_EFFORTS)) {
      expect(list, tag).toHaveLength(BUNDLED_LAYOUTS.length);
      expect(list, tag).toEqual([...list].sort((a, b) => a - b));
    }
  });

  it('are written as the formatter keeps them', () => {
    const text = readFileSync(new URL('./efforts.json', import.meta.url), 'utf8');
    expect(effortsFileText(BUNDLED_EFFORTS), 'run `pnpm languages`').toBe(text);
  });

  // The analyses of every bundled layout, per language, are one file each
  // (performance-<tag>.test.ts): a file's tests run one after another, and these take close to a
  // minute each on a CI runner.
  it('are measured by one file for each language', () => {
    expect(measuringFiles()).toEqual([...PERFORMANCE_LANGUAGES].sort());
  });
});
