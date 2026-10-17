import type { CorpusManifest } from '@layerbench/core';
import { customId } from '../custom/ref.js';

/** The group a picker lists the user's own custom texts in, after the texts that ship. */
export const CUSTOM_TEXTS = 'Custom';

const byName = (a: CorpusManifest, b: CorpusManifest) =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });

/**
 * Corpora in the order every picker lists them: English first, then the rest alphabetically by
 * name, in one list; the user's custom texts on their own after them.
 */
export function orderCorpora(corpora: CorpusManifest[]): {
  texts: CorpusManifest[];
  custom: CorpusManifest[];
} {
  const texts = corpora.filter((c) => customId(c.id) === null);
  const english = texts.filter((c) => c.language === 'en').sort(byName);
  const rest = texts.filter((c) => c.language !== 'en').sort(byName);
  return {
    texts: [...english, ...rest],
    custom: corpora.filter((c) => customId(c.id) !== null).sort(byName),
  };
}

/** The corpus a page opens on when none is asked for: English, the first in every picker. */
export function firstCorpus(corpora: CorpusManifest[]): CorpusManifest | undefined {
  const { texts, custom } = orderCorpora(corpora);
  return texts[0] ?? custom[0];
}
