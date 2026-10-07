import type { CorpusManifest } from '@layerbench/core';
import { languageProfile } from '@layerbench/core';

/**
 * Corpora grouped by language, for a picker.
 *
 * Ten corpora in one flat list is a wall; grouped by language it reads at a glance. The order is
 * the order the languages first appear in the index, so it stays stable as corpora are added.
 */
export function groupByLanguage(
  corpora: CorpusManifest[],
): { label: string; items: CorpusManifest[] }[] {
  const groups = new Map<string, CorpusManifest[]>();
  for (const c of corpora) {
    const label = languageProfile(c.language)?.name ?? c.language;
    const list = groups.get(label);
    if (list) list.push(c);
    else groups.set(label, [c]);
  }
  return [...groups.entries()].map(([label, items]) => ({ label, items }));
}
