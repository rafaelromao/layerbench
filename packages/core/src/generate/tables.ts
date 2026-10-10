import {
  type AnalysisSettings,
  analysisRun,
  DEFAULT_SETTINGS,
  forRanking,
  loadText,
} from '../analysis/settings.js';
import type { Corpus } from '../corpus/corpus.js';
import { nodeCorpusLoader } from '../corpus/node-loader.js';
import { corporaRoot } from '../golden/paths.js';
import { getPreset } from '../rules/presets.js';

/**
 * The text as the Library types it, reduced to the counts the generator's fast scorer needs.
 *
 * The Library ranks on the first `sample` non-space characters of the normalized text, typed or
 * not (`sim/resolver.ts`, the `maxSymbols` loop), so the cut is taken the same way here and every
 * count below is of that cut only.
 */

/**
 * What the Library ranks on, the generator's numbers included: English news unless another text is
 * named, with the cyanophage-like rules, as the generator has always been scored.
 */
export function librarySettings(corpus = 'en-general', preset = 'cyanophage'): AnalysisSettings {
  return forRanking({ ...DEFAULT_SETTINGS, corpus, rules: getPreset(preset) });
}

/** Besides letters, what the `letters` text class keeps (`corpus/normalize.ts`): all of it is placed. */
export const PUNCTUATION: readonly string[] = [',', '.', "'", '-', ';', '/', '?', '!'];
export const LETTERS: readonly string[] = [...'abcdefghijklmnopqrstuvwxyz'];
/** The symbols a generated layout places: everything the sample can hold, bar exotic letters. */
export const SYMBOLS: readonly string[] = [...LETTERS, ...PUNCTUATION];

/** Token of a space in `Sample.tokens`. */
export const SPACE = -1;
/** Token of a character outside the sample's symbols: skipped by the engine, a hard boundary. */
export const UNTYPEABLE = -2;

export interface Sample {
  /** What the sample is of: the settings the Library ranks on, and their text. */
  settings: AnalysisSettings;
  text: Corpus;
  /** The normalized text, whole: the engine applies the sample's cut itself. */
  stream: string;
  symbols: readonly string[];
  /** One entry per character of the cut: a symbol index, `SPACE` or `UNTYPEABLE`. */
  tokens: Int16Array;
  /** Typed characters, spaces processed and words as the engine counts them, over the cut. */
  chars: number;
  spaces: number;
  words: number;
  /** Per symbol: how often it is typed. */
  count: Float64Array;
  /** `bigram[a * S + b]`: ordered pairs `ab` inside one run of typed characters. */
  bigram: Float64Array;
  /** Per symbol: how often it is the second of a doubled pair `cc`. */
  doubles: Float64Array;
  /** `doubleBefore[c * S + y]`: a doubled `cc` followed by `y` in the same run. */
  doubleBefore: Float64Array;
  /** `doubleAfter[t * S + c]`: `t` followed by a doubled `cc` in the same run. */
  doubleAfter: Float64Array;
}

export interface SampleOptions {
  settings?: AnalysisSettings;
  symbols?: readonly string[];
}

/** The shipped text the settings name, normalized as the Library normalizes it. */
export async function loadSample(opts: SampleOptions & { root?: string } = {}): Promise<Sample> {
  const settings = opts.settings ?? librarySettings();
  const loader = nodeCorpusLoader(opts.root ?? corporaRoot());
  const text = await loadText(settings, (id) => loader.load(id));
  return buildSample(text, settings, opts.symbols);
}

export function buildSample(
  text: Corpus,
  settings: AnalysisSettings,
  symbols: readonly string[] = SYMBOLS,
): Sample {
  const { stream } = analysisRun(settings, text);
  const maxSymbols = settings.sample;
  const S = symbols.length;
  const index = new Map(symbols.map((s, i) => [s, i] as const));

  const toks: number[] = [];
  let n = 0;
  for (const ch of stream) {
    if (n >= maxSymbols) break;
    if (ch === ' ') {
      toks.push(SPACE);
      continue;
    }
    n++;
    const k = index.get(ch);
    toks.push(k === undefined ? UNTYPEABLE : k);
  }
  const tokens = Int16Array.from(toks);

  const count = new Float64Array(S);
  const bigram = new Float64Array(S * S);
  const doubles = new Float64Array(S);
  const doubleBefore = new Float64Array(S * S);
  const doubleAfter = new Float64Array(S * S);
  let chars = 0;
  let spaces = 0;
  let words = 0;
  let run = 0;
  // The last two typed symbols of the run; -1 past a boundary.
  let prev = -1;
  let prev2 = -1;
  for (const t of tokens) {
    if (t < 0) {
      if (t === SPACE) spaces++;
      if (run > 0) words++;
      run = 0;
      prev = -1;
      prev2 = -1;
      continue;
    }
    chars++;
    run++;
    count[t]++;
    if (prev >= 0) {
      bigram[prev * S + t]++;
      if (prev === t) {
        doubles[t]++;
        if (prev2 >= 0) doubleAfter[prev2 * S + t]++;
      } else if (prev2 === prev) {
        doubleBefore[prev * S + t]++;
      }
    }
    prev2 = prev;
    prev = t;
  }
  if (run > 0) words++;

  return {
    settings,
    text,
    stream,
    symbols,
    tokens,
    chars,
    spaces,
    words,
    count,
    bigram,
    doubles,
    doubleBefore,
    doubleAfter,
  };
}
