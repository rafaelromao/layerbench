import type { CorpusManifest } from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import { CUSTOM_TEXTS, firstCorpus, orderCorpora } from './corpus-groups.js';

const text = (id: string, name: string, language: string) =>
  ({ id, name, language }) as CorpusManifest;

const CORPORA = [
  text('pt-br-general', 'Português — notícias', 'pt-BR'),
  text('custom:zeta', 'Zeta notes', 'custom'),
  text('es-general', 'Español — noticias', 'es'),
  text('en-general', 'English — news', 'en'),
  text('custom:alpha', 'alpha notes', 'custom'),
  text('fr-general', 'Français — actualités', 'fr'),
];

describe('the order of a corpus picker', () => {
  it('puts English first, the rest by name, and custom texts after them', () => {
    const { texts, custom } = orderCorpora(CORPORA);
    expect(texts.map((c) => c.id)).toEqual([
      'en-general',
      'es-general',
      'fr-general',
      'pt-br-general',
    ]);
    expect(custom.map((c) => c.id)).toEqual(['custom:alpha', 'custom:zeta']);
    expect(CUSTOM_TEXTS).toBe('Custom');
  });

  it('opens on English, or on what there is', () => {
    expect(firstCorpus(CORPORA)?.id).toBe('en-general');
    expect(firstCorpus([CORPORA[1]])?.id).toBe('custom:zeta');
    expect(firstCorpus([])).toBeUndefined();
    // A text built and not saved, or a blend, is not listed on the Corpus page, so it is never
    // the one it opens on, however its name sorts.
    const unsaved = text('custom-abc123', 'A draft', 'en');
    const blend = text('mix-en-general-es-general-50', 'A blend', 'en');
    expect(firstCorpus([unsaved, blend, ...CORPORA])?.id).toBe('en-general');
    expect(firstCorpus([unsaved, blend])).toBeUndefined();
  });
});
