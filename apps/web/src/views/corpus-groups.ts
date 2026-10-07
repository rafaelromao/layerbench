import type { CorpusManifest } from '@layerbench/core';
import { languageProfile } from '@layerbench/core';
import { isSavedCorpus } from '../engine/saved-corpora.js';

/** The group a picker lists the user's own saved texts in, after the languages. */
export const SAVED_TEXTS = 'Saved texts';

/**
 * Corpora grouped by language, for a picker, and the user's saved texts on their own after them.
 *
 * Ten corpora in one flat list is a wall; grouped by language it reads at a glance. The order is
 * the order the languages first appear in the index, so it stays stable as corpora are added.
 */
export function groupByLanguage(
  corpora: CorpusManifest[],
): { label: string; items: CorpusManifest[] }[] {
  const groups = new Map<string, CorpusManifest[]>();
  const saved = corpora.filter((c) => isSavedCorpus(c.id));
  for (const c of corpora) {
    if (isSavedCorpus(c.id)) continue;
    const label = languageProfile(c.language)?.name ?? c.language;
    const list = groups.get(label);
    if (list) list.push(c);
    else groups.set(label, [c]);
  }
  if (saved.length > 0) groups.set(SAVED_TEXTS, saved);
  return [...groups.entries()].map(([label, items]) => ({ label, items }));
}
