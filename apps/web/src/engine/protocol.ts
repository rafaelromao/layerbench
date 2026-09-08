import type {
  CorpusManifest,
  LayoutJson,
  RuleResult,
  RuleSet,
  Score,
  TextClass,
} from '@layoutmaster/core';

/**
 * What crosses the worker boundary. Tables, the registry and the compiled layout stay inside the
 * worker: only numbers keyed by position index come out, which keeps a report small enough to clone
 * on every parameter change.
 */

export interface AnalyzeRequest {
  layout: LayoutJson;
  corpusId: string;
  caseMode: 'fold' | 'model';
  /** Which non-letter classes the corpus contributes. Default `letters`, as it always was. */
  textClass: TextClass;
  crossWord: 'reset' | 'bridge';
  maxSymbols: number;
  ruleSet: RuleSet;
}

export interface RelabelRequest {
  /** Key of the report to estimate from, as returned in `ReportDTO.key`. */
  baseKey: string;
  layout: LayoutJson;
  layerIdx: number;
  posA: number;
  posB: number;
  ruleSet: RuleSet;
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
  /** Keystrokes per position, per layer, for the usage heat map. */
  usageByLayer: number[][];
  /** Keystrokes per position across every layer. */
  usageAll: number[];
  /** Presses whose only purpose is reaching a layer, per position. */
  layerTaps: number[];
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
  | {
      id: number;
      type: 'registerCorpus';
      corpus: { id: string; name: string; language: string; sample: string };
    }
  | { id: number; type: 'mixCorpora'; a: string; b: string; mix: number }
  | { id: number; type: 'peek'; request: AnalyzeRequest }
  | { id: number; type: 'analyze'; request: AnalyzeRequest }
  | { id: number; type: 'relabel'; request: RelabelRequest }
  | { id: number; type: 'explain'; layout: LayoutJson; text: string; caseMode: 'fold' | 'model' }
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
  registerCorpus(corpus: {
    id: string;
    name: string;
    language: string;
    sample: string;
  }): Promise<CorpusManifest>;
  mixCorpora(a: string, b: string, mix: number): Promise<CorpusManifest>;
  /** Cache lookup only: returns null rather than starting work. */
  peek(request: AnalyzeRequest): Promise<ReportDTO | null>;
  analyze(
    request: AnalyzeRequest,
    opts?: { signal?: AbortSignal; onProgress?: (p: Progress) => void },
  ): Promise<ReportDTO>;
  relabel(request: RelabelRequest): Promise<ReportDTO | null>;
  explain(layout: LayoutJson, text: string, caseMode: 'fold' | 'model'): Promise<ExplainDTO>;
  producers(layout: LayoutJson, caseMode: 'fold' | 'model'): Promise<Record<string, ProducerDTO[]>>;
  corpusFacts(corpusId: string): Promise<CorpusFactsDTO>;
  /** The storage document for a corpus, including its sample text. */
  corpusDocument(corpusId: string): Promise<Record<string, unknown>>;
  buildCustomCorpus(text: string, name: string, language: string): Promise<CorpusManifest>;
}
