import { type AnalysisSettings, type CorpusManifest, mixLanguage } from '@layerbench/core';

/** What the text of these settings is called: a corpus's name, or the mix of two with its share. */
export function textName(settings: AnalysisSettings<unknown>, corpora: CorpusManifest[]): string {
  const name = (id: string) => corpora.find((c) => c.id === id)?.name ?? id;
  return settings.corpus2 === null
    ? name(settings.corpus)
    : `${name(settings.corpus)} ${settings.share}% with ${name(settings.corpus2)}`;
}

/**
 * The language of the text, a mix's being both of its corpora's, as the mix itself declares it.
 * Unknown until the corpora are listed.
 */
export function textLanguage(
  settings: AnalysisSettings<unknown>,
  corpora: CorpusManifest[],
): string | undefined {
  const language = (id: string) => corpora.find((c) => c.id === id)?.language;
  const first = language(settings.corpus);
  if (settings.corpus2 === null) return first;
  const second = language(settings.corpus2);
  return first && second ? mixLanguage([first, second]) : undefined;
}
