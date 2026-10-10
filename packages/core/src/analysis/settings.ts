import { type Corpus, corpusStream, mixCorpora, mixId } from '../corpus/corpus.js';
import { type CaseMode, DEFAULT_SOFT, type TextClass } from '../corpus/normalize.js';
import { languageSoft } from '../lang/profiles.js';
import { type CompiledLayout, compileLayout } from '../layout/compile.js';
import type { Layout } from '../layout/types.js';
import { FEATURE_KINDS, type FeatureKind, withoutFeatures } from '../layout/without.js';
import type { Globals, RuleSet } from '../rules/types.js';
import type { AnalyzeOptions } from './analyze.js';
import { fnv1a, stableStringify, structureHash } from './hash.js';

/**
 * What a layout is analyzed on: the text, how it is read, how much of it, the features the layout
 * is typed without, the rules and whether space is counted. Every view, the generator and the
 * reports analyze a layout on these and nothing else, so the same settings give the same numbers
 * wherever they are used.
 *
 * `AnalysisSettings<string>` names the rules by their reference, as a link does (a preset id or
 * `saved:<id>`), which is known before a saved set is read; the engine is given them resolved.
 */
export interface AnalysisSettings<Rules = RuleSet> {
  /** The corpus typed, by the id the engine knows it by. */
  corpus: string;
  /** A second corpus mixed in, or null for the first alone. */
  corpus2: string | null;
  /** The first corpus's share of a mix, in percent; read only when there is a second. */
  share: number;
  caseMode: CaseMode;
  textClass: TextClass;
  /** How many symbols of the text are typed, at most. */
  sample: number;
  /** Special features the layout is typed without. */
  without: readonly FeatureKind[];
  rules: Rules;
  /** Whether the space bar's presses count, whatever the rule set says. */
  universe: Globals['universe'];
}

/** Everything but the text and the rules, as a bare visit has them. */
export const DEFAULT_SETTINGS: Omit<AnalysisSettings<never>, 'corpus' | 'rules'> = {
  corpus2: null,
  share: 50,
  caseMode: 'fold',
  textClass: 'letters',
  sample: 100_000,
  without: [],
  universe: 'no_space',
};

/**
 * The most symbols the Library ranks on. It scores twenty-odd layouts one after another, and a
 * million symbols each would keep the list unsorted for minutes.
 */
export const RANKING_SAMPLE = 100_000;

/** The settings the Library ranks on: these, with the sample capped. */
export function forRanking<R>(settings: AnalysisSettings<R>): AnalysisSettings<R> {
  return settings.sample <= RANKING_SAMPLE ? settings : { ...settings, sample: RANKING_SAMPLE };
}

/**
 * The layout as it is typed: without the features the settings leave out. Views draw it this way
 * too, so a board's heat lands on the keys it was measured on. With nothing left out it is the
 * layout given, not a copy, so nothing is compiled twice.
 */
export function typedLayout(
  authored: CompiledLayout,
  without: readonly FeatureKind[],
): CompiledLayout {
  return without.length === 0 ? authored : compileLayout(withoutFeatures(authored.layout, without));
}

/**
 * What the engine is told, short of the layout and the text itself: plain data, so two plans can be
 * compared and hashed.
 */
export interface AnalysisPlan {
  /** The text's id: the corpus's, or the mix's, which names both and their shares. */
  text: string;
  caseMode: CaseMode;
  textClass: TextClass;
  maxSymbols: number;
  /** Whether a pair may span two words, as the rule set says: it changes what is typed. */
  crossWord: Globals['cross_word'];
  /** The rule set, with space counted as the settings say. */
  ruleSet: RuleSet;
  /** Each feature left out once, in the order they are listed. */
  without: FeatureKind[];
}

function mixOf(settings: AnalysisSettings<unknown>): [string, number][] | null {
  return settings.corpus2 === null
    ? null
    : [
        [settings.corpus, settings.share],
        [settings.corpus2, 100 - settings.share],
      ];
}

export function analysisPlan(settings: AnalysisSettings): AnalysisPlan {
  const mix = mixOf(settings);
  const rules = settings.rules;
  return {
    text: mix ? mixId(mix) : settings.corpus,
    caseMode: settings.caseMode,
    textClass: settings.textClass,
    maxSymbols: settings.sample,
    crossWord: rules.globals.cross_word ?? 'reset',
    ruleSet:
      rules.globals.universe === settings.universe
        ? rules
        : { ...rules, globals: { ...rules.globals, universe: settings.universe } },
    without: FEATURE_KINDS.filter((k) => settings.without.includes(k)),
  };
}

/** Rule sets hashed already: the Library asks for the identity of twenty-odd layouts at a time. */
const ruleHashes = new WeakMap<RuleSet, string>();

function ruleHash(ruleSet: RuleSet): string {
  let hash = ruleHashes.get(ruleSet);
  if (hash === undefined) {
    hash = fnv1a(stableStringify(ruleSet));
    ruleHashes.set(ruleSet, hash);
  }
  return hash;
}

/**
 * The identity of an analysis. `typing` is the same for every analysis that types the same presses
 * — the layout, the text and how it is read — whatever rules then score them, or whether space is
 * counted; `key` adds the rules. Two analyses with the same key give the same numbers.
 */
export function analysisKey(
  layout: Layout,
  settings: AnalysisSettings,
): { typing: string; key: string } {
  const { ruleSet, ...typed } = analysisPlan(settings);
  const typing = fnv1a(stableStringify({ layout: structureHash(layout), ...typed }));
  return { typing, key: `${typing}|${ruleHash(ruleSet)}` };
}

/** The text the settings name: the corpus, or the mix of the two, made from what `load` gives. */
export async function loadText(
  settings: AnalysisSettings<unknown>,
  load: (id: string) => Promise<Corpus>,
): Promise<Corpus> {
  const mix = mixOf(settings);
  if (!mix) return load(settings.corpus);
  const corpora = await Promise.all(mix.map(([id]) => load(id)));
  return mixCorpora(mix.map(([, share], i) => [corpora[i], share]));
}

/** What `analyze` is given for these settings on this text: the stream typed, and how. */
export function analysisRun(
  settings: AnalysisSettings,
  text: Corpus,
): { stream: string; options: AnalyzeOptions } {
  const plan = analysisPlan(settings);
  return {
    stream: corpusStream(text, plan.caseMode, plan.textClass),
    options: {
      caseMode: plan.caseMode,
      maxSymbols: plan.maxSymbols,
      ruleSet: plan.ruleSet,
      // The text's own punctuation is punctuation, not a letter the layout is failing to write.
      softSymbols: [...DEFAULT_SOFT, ...languageSoft(text.language)],
    },
  };
}
