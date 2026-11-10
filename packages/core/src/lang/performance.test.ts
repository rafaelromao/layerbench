import { readFileSync } from 'node:fs';
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
import { bundledEfforts, measureEfforts } from './measure.js';
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
  const qwerty = bundledLayout('qwerty') as Layout;
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
 * layout added as a document carries its own). An English corpus counts as English; a layout whose
 * author states none has none, and the editor's "Measure languages" can add the ones it performs
 * well in.
 */
const STATED: Record<string, string[]> = {
  // The write-up says Portuguese and English, and draws no `à` for Romak 34, which Portuguese needs.
  romak: ['en'],
  'magic-romak': ['en', 'pt'],
  qwerty: [],
  dvorak: ['en'],
  colemak: ['en'],
  'colemak-dh': ['en'],
  graphite: ['en'],
  gallium: ['en'],
  canary: ['en'],
  sturdy: ['en'],
  aptv3: ['en'],
  'hands-down-neu': ['en'],
  night: ['en'],
  dusk: ['en'],
  recurva: ['en'],
  focal: [],
  nerps: ['en'],
  engram: ['en'],
  sunlight: [],
  snth: [],
  aptmak: [],
  bird: [],
  'bird-30': [],
  'hands-down-gold': ['en'],
  'hands-down-promethium': [],
  'hands-down-vibranium': ['en'],
  rsthd: [],
  't-34': [],
  'magic-sturdy': ['en'],
  enthium: ['en'],
  nordrassil: ['en'],
  finch: ['en'],
  caksoylar: [],
  uno: ['en'],
  'ben-vallack-piano': [],
};

describe('bundled layouts’ languages', () => {
  it('are the ones their authors state, for every layout written in code', () => {
    const written = Object.fromEntries(goldenLayouts().map((l) => [l.id, l.languages ?? []]));
    expect(written).toEqual(STATED);
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

  for (const tag of PERFORMANCE_LANGUAGES) {
    // An analysis of every bundled layout, about three times slower under coverage on a CI runner.
    it(`for ${tag}: are what the engine measures`, { timeout: 180_000 }, async () => {
      expect(await measureEfforts(tag), 'run `pnpm languages`').toEqual(BUNDLED_EFFORTS[tag]);
    });

    it(`for ${tag}: put each bundled layout where counting the others puts it`, {
      timeout: 180_000,
    }, async () => {
      const measured = await bundledEfforts(tag);
      for (const [id, effort] of measured) {
        // The rule on the unrounded Efforts of the others, with this layout counted among them.
        const better = [...measured.values()].filter((other) => other < effort).length;
        expect(performsWell(effort, BUNDLED_EFFORTS[tag]), `${id} ${tag}`).toBe(
          better * 2 < measured.size,
        );
      }
    });
  }
});
