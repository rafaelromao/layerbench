import type {
  AnalysisSettings,
  CorpusManifest,
  FocusRule,
  LayoutJson,
  RuleItemNext,
  RuleResult,
  Score,
} from '@layerbench/core';

/**
 * What crosses the worker boundary. Tables, the registry and the compiled layout stay inside the
 * worker: only numbers keyed by position index come out, which keeps a report small enough to clone
 * on every parameter change.
 */

export interface AnalyzeRequest {
  /** The layout as written: the engine types it without the features the settings leave out. */
  layout: LayoutJson;
  settings: AnalysisSettings;
}

export interface RelabelRequest {
  /** Key of the report to estimate from, as returned in `ReportDTO.key`. */
  baseKey: string;
  /** The layout after the swap, as written. */
  layout: LayoutJson;
  settings: AnalysisSettings;
  layerIdx: number;
  posA: number;
  posB: number;
}

/** A closer look at one key of an analysis already made. */
export interface KeyStatsRequest {
  /** Key of the report, as returned in `ReportDTO.key`. */
  reportKey: string;
  /** Physical key index, and the layer it was pressed on. */
  key: number;
  layer: number;
  /** How many n-grams to list per rule; the rule set's own count when absent. */
  limit?: number;
}

/** What one key, pressed on one layer, takes part in. */
export interface KeyStatsDTO {
  reportKey: string;
  key: number;
  layer: number;
  /** Each rule over pairs or trigrams with n-grams through the key, and the busiest of them. */
  rules: FocusRule[];
  /** For a layer key: what it was pressed for, the keys pressed right after it. */
  next: RuleItemNext[];
}

export interface CoverageDTO {
  /** Symbols the layout cannot type, most frequent first. */
  unproducible: [string, number][];
  /** Punctuation dropped without counting as a coverage failure. */
  softDropped: [string, number][];
  excludedByCase: string[];
}

export interface StatsDTO {
  symbols: number;
  words: number;
  keystrokes: number;
  space_presses: number;
  layer_taps: number;
  one_shot_activations: number;
  wasted_one_shots: number;
  hold_presses: number;
  chords: number;
  macro_presses: number;
  adaptive_presses: number;
  adaptive_trigger_hits: number;
  repeat_presses: number;
  per_layer: number[];
}

export interface ReportDTO {
  key: string;
  provisional: boolean;
  elapsedMs: number;
  results: RuleResult[];
  score: Score;
  globals: Record<string, unknown>;
  coverage: CoverageDTO;
  stats: StatsDTO;
  /**
   * Keystrokes per position on each layer, counted on the layer whose key was pressed. Space
   * presses count only when the rule set counts space.
   */
  usageByLayer: number[][];
  /** Keystrokes per position across every layer. */
  usageAll: number[];
  /** Presses whose only purpose is reaching a layer, per position, on the layer pressed. */
  layerTapsByLayer: number[][];
  /** Physical keys behind each position, so chord positions can be highlighted. */
  members: number[][];
}

export interface ExplainStepDTO {
  key: string;
  layer: string;
  finger: string;
  kind: string;
  keyKind: string;
  label: string;
  symbols: string;
  wastedOneShot: boolean;
}

export interface ExplainDTO {
  steps: ExplainStepDTO[];
  presses: number;
  coverage: CoverageDTO;
}

export interface ProducerDTO {
  id: string;
  kind: string;
  cost: number;
}

export interface CorpusFactsDTO {
  symbols: number;
  words: number;
  letters: [string, number][];
  bigrams: [string, number][];
  trigrams: [string, number][];
  topWords: [string, number][];
}

export interface Progress {
  done: number;
  total: number;
}

export type Request =
  | { id: number; type: 'listCorpora' }
  | { id: number; type: 'loadCorpus'; corpusId: string }
  | { id: number; type: 'registerCorpus'; corpusId: string; doc: Record<string, unknown> }
  | { id: number; type: 'peek'; request: AnalyzeRequest }
  | { id: number; type: 'analyze'; request: AnalyzeRequest }
  | { id: number; type: 'relabel'; request: RelabelRequest }
  | { id: number; type: 'keyStats'; request: KeyStatsRequest }
  | { id: number; type: 'explain'; layout: LayoutJson; text: string; settings: AnalysisSettings }
  | { id: number; type: 'producers'; layout: LayoutJson; caseMode: 'fold' | 'model' }
  | { id: number; type: 'corpusFacts'; corpusId: string }
  | { id: number; type: 'corpusDocument'; corpusId: string }
  | { id: number; type: 'buildCustomCorpus'; text: string; name: string; language: string }
  | { id: number; type: 'cancel' };

export type Response =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
  | { id: number; progress: Progress };

/** The engine, however it is reached: in a worker, or directly on this thread for tests. */
export interface AnalysisClient {
  listCorpora(): Promise<CorpusManifest[]>;
  loadCorpus(corpusId: string): Promise<CorpusManifest>;
  /** Take a corpus saved as `doc`, to be known by `corpusId`. */
  registerCorpus(corpusId: string, doc: Record<string, unknown>): Promise<CorpusManifest>;
  /**
   * Returns null rather than typing the corpus. A layout already typed under other rules, or with
   * space counted differently, is only re-scored, which takes milliseconds.
   */
  peek(request: AnalyzeRequest): Promise<ReportDTO | null>;
  analyze(
    request: AnalyzeRequest,
    opts?: { signal?: AbortSignal; onProgress?: (p: Progress) => void },
  ): Promise<ReportDTO>;
  relabel(request: RelabelRequest): Promise<ReportDTO | null>;
  /** Null when the report is no longer kept, or was an estimate, which never is. */
  keyStats(request: KeyStatsRequest): Promise<KeyStatsDTO | null>;
  /** How a short text is typed on the layout as written, with the analysis's settings. */
  explain(layout: LayoutJson, text: string, settings: AnalysisSettings): Promise<ExplainDTO>;
  producers(layout: LayoutJson, caseMode: 'fold' | 'model'): Promise<Record<string, ProducerDTO[]>>;
  corpusFacts(corpusId: string): Promise<CorpusFactsDTO>;
  /** The storage document for a corpus, including its sample text. */
  corpusDocument(corpusId: string): Promise<Record<string, unknown>>;
  buildCustomCorpus(text: string, name: string, language: string): Promise<CorpusManifest>;
}
