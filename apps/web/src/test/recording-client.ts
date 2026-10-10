import type { AnalysisSettings, CorpusManifest, LayoutJson } from '@layerbench/core';
import type {
  AnalysisClient,
  AnalyzeRequest,
  CorpusFactsDTO,
  ExplainDTO,
  KeyStatsDTO,
  ProducerDTO,
  Progress,
  RelabelRequest,
  ReportDTO,
} from '../engine/protocol.js';
import { testClient } from './render.js';

/**
 * The engine as a test listens to it: every analysis and explanation a view asks for is recorded,
 * and corpora come from the real engine. Unless told to `answer`, it never types a text: each
 * analysis waits until the view gives it up, so a test about what was asked spends nothing on the
 * answer.
 */
export class RecordingClient implements AnalysisClient {
  /** The analyses asked for, in order. A peek is not one: it only looks for a report kept. */
  readonly analyses: AnalyzeRequest[] = [];
  readonly explained: { layout: LayoutJson; text: string; settings: AnalysisSettings }[] = [];

  constructor(
    private readonly engine: AnalysisClient = testClient(),
    private readonly answer = false,
  ) {}

  listCorpora(): Promise<CorpusManifest[]> {
    return this.engine.listCorpora();
  }

  loadCorpus(corpusId: string): Promise<CorpusManifest> {
    return this.engine.loadCorpus(corpusId);
  }

  registerCorpus(corpusId: string, doc: Record<string, unknown>): Promise<CorpusManifest> {
    return this.engine.registerCorpus(corpusId, doc);
  }

  async peek(request: AnalyzeRequest): Promise<ReportDTO | null> {
    return this.answer ? this.engine.peek(request) : null;
  }

  analyze(
    request: AnalyzeRequest,
    opts: { signal?: AbortSignal; onProgress?: (p: Progress) => void } = {},
  ): Promise<ReportDTO> {
    this.analyses.push(request);
    if (this.answer) return this.engine.analyze(request, opts);
    return new Promise((_, reject) => {
      opts.signal?.addEventListener('abort', () =>
        reject(new DOMException('aborted', 'AbortError')),
      );
    });
  }

  async relabel(request: RelabelRequest): Promise<ReportDTO | null> {
    return this.answer ? this.engine.relabel(request) : null;
  }

  async keyStats(): Promise<KeyStatsDTO | null> {
    return null;
  }

  explain(layout: LayoutJson, text: string, settings: AnalysisSettings): Promise<ExplainDTO> {
    this.explained.push({ layout, text, settings });
    return this.engine.explain(layout, text, settings);
  }

  producers(
    layout: LayoutJson,
    caseMode: 'fold' | 'model',
  ): Promise<Record<string, ProducerDTO[]>> {
    return this.engine.producers(layout, caseMode);
  }

  corpusFacts(corpusId: string): Promise<CorpusFactsDTO> {
    return this.engine.corpusFacts(corpusId);
  }

  corpusDocument(corpusId: string): Promise<Record<string, unknown>> {
    return this.engine.corpusDocument(corpusId);
  }

  buildCustomCorpus(text: string, name: string, language: string): Promise<CorpusManifest> {
    return this.engine.buildCustomCorpus(text, name, language);
  }
}
