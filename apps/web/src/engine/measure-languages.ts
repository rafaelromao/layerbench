import {
  LANGUAGE_CORPORA,
  LANGUAGE_PROFILES,
  type LanguageVerdict,
  type Layout,
  measureLayoutLanguages,
  toCanonicalJson,
} from '@layerbench/core';
import { formatValue } from '../components/format.js';
import type { AnalysisClient } from './protocol.js';
import { libraryRanking, summarize } from './use-summaries.js';

/**
 * The languages a layout performs well in, measured in the app: one analysis of the layout in hand
 * for each language it types and is not for yet, on that language's news text, as the Library ranks
 * (the Layouts Doc rules, letters only, 100,000 symbols). Each Effort is counted against the
 * bundled layouts' stored ones; none of them is analyzed here.
 */
export function measureLanguagesOf(
  client: AnalysisClient,
  layout: Layout,
): Promise<LanguageVerdict[]> {
  const written = toCanonicalJson(layout);
  return measureLayoutLanguages(layout, async (tag) => {
    const report = await client.analyze({
      layout: written,
      settings: libraryRanking(LANGUAGE_CORPORA[tag]),
    });
    const { effort } = summarize(report);
    if (effort === null) throw new Error('The rules leave the Effort out, so nothing is measured.');
    return effort;
  });
}

/** What a language's name is, as the editor lists it. */
function nameOf(tag: string): string {
  return LANGUAGE_PROFILES[tag]?.name ?? tag;
}

/** The names of some languages, as a sentence: "English, Español and Italiano". */
function listOf(tags: readonly string[]): string {
  const names = tags.map(nameOf);
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** What was added, in a sentence; and how to take it back. */
export function addedText(verdicts: readonly LanguageVerdict[]): string {
  const added = verdicts.filter((v) => v.kind === 'added').map((v) => v.tag);
  return added.length === 0
    ? 'No language to add.'
    : `Added ${listOf(added)}. Undo takes ${added.length === 1 ? 'it' : 'them'} back.`;
}

/** Why a language was or was not added, as a line; none for one the layout is for already. */
export function verdictText(verdict: LanguageVerdict): string | null {
  const name = nameOf(verdict.tag);
  switch (verdict.kind) {
    case 'already':
      return null;
    case 'lacks':
      return `${name}: not added, it does not type ${verdict.missing.join(' ')}.`;
    case 'added':
      return `${name}: added, its Effort ${formatValue(verdict.effort, 'effort')} is beaten by ${verdict.beaten} of ${verdict.of} bundled layouts.`;
    case 'worse':
      return `${name}: not added, its Effort ${formatValue(verdict.effort, 'effort')} is beaten by ${verdict.beaten} of ${verdict.of} bundled layouts, and fewer than half may beat it.`;
  }
}
