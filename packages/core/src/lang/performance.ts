import { compileLayout } from '../layout/compile.js';
import type { Layout } from '../layout/types.js';
import { layoutLanguageCoverage } from './coverage.js';
import EFFORTS from './efforts.json';
import { LANGUAGE_PROFILES } from './profiles.js';

/**
 * Which languages a layout performs well in. It performs well in a language when it types every
 * letter the language needs, and its Effort on the language's news text is in the better half of
 * the bundled layouts': fewer than half of them beat it. The editor measures this for the layout in
 * hand, against the Efforts of the bundled layouts that `pnpm languages` writes to `efforts.json`,
 * so it runs one analysis a language and never the bundled layouts'.
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

/**
 * The Effort of every bundled layout on each language's text, lowest first, as `pnpm languages`
 * writes them: the half is of every bundled layout, one that cannot type the language included.
 */
export const BUNDLED_EFFORTS: Readonly<Record<string, readonly number[]>> = EFFORTS;

/** Decimals an Effort is kept and compared at, so the same layout is the same number everywhere. */
const EFFORT_DECIMALS = 3;

export function storedEffort(effort: number): number {
  const scale = 10 ** EFFORT_DECIMALS;
  return Math.round(effort * scale) / scale;
}

/** How many of the Efforts are lower than this one. */
export function beatenBy(effort: number, efforts: readonly number[]): number {
  const mine = storedEffort(effort);
  return efforts.filter((other) => other < mine).length;
}

/**
 * Whether an Effort performs well among those of the bundled layouts: fewer than half of them beat
 * it. Layouts of equal Effort are in or out together, and the middle one of an odd number is in.
 */
export function performsWell(effort: number, efforts: readonly number[]): boolean {
  if (!Number.isFinite(effort)) throw new Error('A layout with no Effort is beaten by nothing');
  return beatenBy(effort, efforts) * 2 < efforts.length;
}

/** What measuring one language found for a layout, and so why it was or was not added. */
export type LanguageVerdict = { tag: string } & (
  | { kind: 'already' }
  /** It lacks letters the language cannot be written without. */
  | { kind: 'lacks'; missing: string[] }
  | { kind: 'added' | 'worse'; effort: number; beaten: number; of: number }
);

/**
 * What each language comes to for a layout: one it is for already is left as it is; one it cannot
 * type is not added, naming the letters it lacks; and for each other, `effortOn` is asked for the
 * layout's Effort on that language's text, and it is added when that performs well. The layout is
 * judged as it is, whether it is a layout of the user's or a copy of a bundled one.
 */
export async function measureLayoutLanguages(
  layout: Layout,
  effortOn: (tag: string) => Promise<number>,
  efforts: Readonly<Record<string, readonly number[]>> = BUNDLED_EFFORTS,
): Promise<LanguageVerdict[]> {
  const compiled = compileLayout(layout);
  const verdicts: LanguageVerdict[] = [];
  for (const tag of PERFORMANCE_LANGUAGES) {
    if (layout.languages?.includes(tag)) {
      verdicts.push({ tag, kind: 'already' });
      continue;
    }
    const missing = layoutLanguageCoverage(compiled, tag)?.missingRequired ?? [];
    if (missing.length > 0) {
      verdicts.push({ tag, kind: 'lacks', missing });
      continue;
    }
    const effort = await effortOn(tag);
    const among = efforts[tag] ?? [];
    verdicts.push({
      tag,
      kind: performsWell(effort, among) ? 'added' : 'worse',
      effort,
      beaten: beatenBy(effort, among),
      of: among.length,
    });
  }
  return verdicts;
}

/**
 * The layout's languages with those a measurement added: those the profiles know in their order,
 * then any other tag it carries, as the editor's own choice keeps them.
 */
export function withAddedLanguages(
  languages: readonly string[],
  verdicts: readonly LanguageVerdict[],
): string[] {
  const added = new Set(verdicts.filter((v) => v.kind === 'added').map((v) => v.tag));
  const known = PERFORMANCE_LANGUAGES.filter((t) => languages.includes(t) || added.has(t));
  return [...known, ...languages.filter((t) => !PERFORMANCE_LANGUAGES.includes(t))];
}

/** Languages in the order the profiles give them, as a layout lists them. */
export function orderedLanguages(tags: ReadonlySet<string>): string[] {
  return PERFORMANCE_LANGUAGES.filter((t) => tags.has(t));
}

/** The widest a line of `efforts.json` goes, as the formatter fills it. */
const FILE_WIDTH = 100;

/**
 * `efforts.json` as `pnpm languages` writes it, as the formatter keeps it: each language's Efforts
 * filled into lines of the file's width.
 */
export function effortsFileText(efforts: Readonly<Record<string, readonly number[]>>): string {
  const blocks = Object.entries(efforts).map(([tag, values]) => {
    const lines: string[] = [];
    let line = '';
    values.forEach((value, i) => {
      const token = i < values.length - 1 ? `${value},` : `${value}`;
      if (line && `    ${line} ${token}`.length > FILE_WIDTH) {
        lines.push(`    ${line}`);
        line = '';
      }
      line = line ? `${line} ${token}` : token;
    });
    if (line) lines.push(`    ${line}`);
    return `  ${JSON.stringify(tag)}: [\n${lines.join('\n')}\n  ]`;
  });
  return `{\n${blocks.join(',\n')}\n}\n`;
}
