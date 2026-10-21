import { LANGUAGE_PROFILES } from './profiles.js';

/**
 * Which languages a bundled layout is for. It is for a language when it performs well in it: it
 * types every letter the language needs, and its Effort on the language's news text is in the
 * better half of every bundled layout's. `pnpm languages` measures this and writes it; a test fails
 * when what is written drifts from what is measured.
 */

/** The languages measured: every one with a profile, in the profiles' order. */
export const PERFORMANCE_LANGUAGES: readonly string[] = Object.keys(LANGUAGE_PROFILES);

/** The text each language is measured on: its Leipzig news corpus, as the app serves it. */
export const LANGUAGE_CORPORA: Readonly<Record<string, string>> = {
  en: 'en-general',
  pt: 'pt-br-general',
  es: 'es-general',
  fr: 'fr-general',
  it: 'it-general',
  de: 'de-general',
};

/** The rules a bare visit to the Library ranks on (the web's `DEFAULT_PARAMS.preset`). */
export const LANGUAGES_PRESET = 'layouts_doc';

/** One bundled layout on one language's text. */
export interface LanguageEntry {
  id: string;
  effort: number;
  /** Whether it types every letter the language needs. */
  covers: boolean;
}

/**
 * The layouts that perform well in a language: those that type it and that fewer than half of all
 * the layouts beat on Effort. Layouts of equal Effort are in or out together, and the middle one of
 * an odd number is in. A layout that cannot type the language still counts among the whole, since
 * the half is of every bundled layout.
 */
export function performsWell(entries: readonly LanguageEntry[]): Set<string> {
  // No Effort is beaten by nothing, and would pass for the best.
  const unscored = entries.find((e) => !Number.isFinite(e.effort));
  if (unscored) throw new Error(`${unscored.id} has no Effort`);
  const out = new Set<string>();
  for (const e of entries) {
    if (!e.covers) continue;
    const better = entries.filter((o) => o.effort < e.effort).length;
    if (better * 2 < entries.length) out.add(e.id);
  }
  return out;
}

/** Languages in the order the profiles give them, as a layout lists them. */
export function orderedLanguages(tags: ReadonlySet<string>): string[] {
  return PERFORMANCE_LANGUAGES.filter((t) => tags.has(t));
}

/**
 * `layouts/languages.json` as `pnpm languages` writes it: one layout a line, in the order given, as
 * the formatter keeps it.
 */
export function languagesFileText(
  entries: readonly (readonly [string, readonly string[]])[],
): string {
  const lines = entries.map(
    ([id, tags]) => `  ${JSON.stringify(id)}: ${JSON.stringify(tags).replaceAll(',', ', ')}`,
  );
  return `{\n${lines.join(',\n')}\n}\n`;
}
