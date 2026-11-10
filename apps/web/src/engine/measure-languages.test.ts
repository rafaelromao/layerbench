import {
  BUNDLED_EFFORTS,
  bundledLayout,
  type LanguageVerdict,
  type Layout,
  storedEffort,
} from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import { testClient } from '../test/render.js';
import { addedText, measureLanguagesOf, verdictText } from './measure-languages.js';

const bundled = (id: string) => bundledLayout(id) as Layout;

/** What a measurement found, by language. */
const byTag = (verdicts: LanguageVerdict[]) => new Map(verdicts.map((v) => [v.tag, v]));

describe('measuring a layout’s languages in the app', () => {
  it('finds the Effort the bundled layouts were stored with, for a copy that is for no language yet', async () => {
    // Magic Romak types English, Portuguese, Spanish and Italian: its own Effort on each of their
    // texts is one of those stored, so the analysis here and the one `pnpm languages` ran agree.
    const copy: Layout = { ...bundled('magic-romak'), id: undefined, languages: [] };
    const found = byTag(await measureLanguagesOf(testClient(), copy));
    for (const tag of ['en', 'pt', 'es', 'it']) {
      const verdict = found.get(tag);
      if (verdict?.kind !== 'added' && verdict?.kind !== 'worse')
        throw new Error(`${tag} was not measured`);
      expect(BUNDLED_EFFORTS[tag], tag).toContain(storedEffort(verdict.effort));
      expect(verdict.of, tag).toBe(BUNDLED_EFFORTS[tag].length);
    }
    // The same layout as the bundled one, so it is where that one is among the others.
    expect(found.get('en')?.kind).toBe('added');
    expect(found.get('pt')?.kind).toBe('added');
    // It lacks what French and German need, and does not analyze them.
    expect(found.get('fr')).toMatchObject({ kind: 'lacks' });
    expect(found.get('de')).toMatchObject({ kind: 'lacks' });
  }, 120_000);

  it('adds nothing a layout cannot type, and names what it lacks', async () => {
    const found = byTag(await measureLanguagesOf(testClient(), bundled('qwerty')));
    expect(found.get('en')).toMatchObject({ kind: 'worse', beaten: BUNDLED_EFFORTS.en.length - 1 });
    expect(found.get('pt')).toMatchObject({ kind: 'lacks' });
    expect(verdictText(found.get('pt') as LanguageVerdict)).toMatch(
      /^Português: not added, it does not type á à ã/,
    );
  }, 120_000);
});

describe('saying what was found', () => {
  const added: LanguageVerdict = { tag: 'en', kind: 'added', effort: 454.7, beaten: 7, of: 35 };
  const worse: LanguageVerdict = { tag: 'de', kind: 'worse', effort: 801.1, beaten: 20, of: 35 };
  const lacks: LanguageVerdict = { tag: 'fr', kind: 'lacks', missing: ['à', 'œ'] };

  it('says why each language was or was not added, and nothing of one the layout is for', () => {
    expect(verdictText(added)).toBe(
      'English: added, its Effort 454.70 is beaten by 7 of 35 bundled layouts.',
    );
    expect(verdictText(worse)).toBe(
      'Deutsch: not added, its Effort 801.10 is beaten by 20 of 35 bundled layouts, and fewer than half may beat it.',
    );
    expect(verdictText(lacks)).toBe('Français: not added, it does not type à œ.');
    expect(verdictText({ tag: 'pt', kind: 'already' })).toBeNull();
  });

  it('names what was added, and how to take it back', () => {
    expect(addedText([worse, lacks])).toBe('No language to add.');
    expect(addedText([added, worse])).toBe('Added English. Undo takes it back.');
    expect(addedText([added, { ...added, tag: 'pt' }, { ...added, tag: 'es' }])).toBe(
      'Added English, Português and Español. Undo takes them back.',
    );
  });
});
