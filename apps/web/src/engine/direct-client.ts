import type { CorpusManifest, LayoutJson } from '@layerbench/core';
import type { AnalysisCore } from './analysis-core.js';
import type {
  AnalysisClient,
  AnalyzeRequest,
  CorpusFactsDTO,
  ExplainDTO,
  KeyStatsDTO,
  KeyStatsRequest,
  ProducerDTO,
  Progress,
  RelabelRequest,
  ReportDTO,
} from './protocol.js';

/**
 * Runs the engine on the calling thread. Used by tests, where a worker cannot be constructed, and
 * as a fallback wherever workers are unavailable.
 */
export class DirectClient implements AnalysisClient {
  constructor(private readonly core: AnalysisCore) {}

  listCorpora(): Promise<CorpusManifest[]> {
    return this.core.listCorpora();
  }

  loadCorpus(corpusId: string): Promise<CorpusManifest> {
    return this.core.loadCorpus(corpusId);
  }

  async registerCorpus(corpus: {
    id: string;
    name: string;
    language: string;
    sample: string;
  }): Promise<CorpusManifest> {
    return this.core.registerCorpus(corpus);
  }

  mixCorpora(a: string, b: string, mix: number): Promise<CorpusManifest> {
    return this.core.mix(a, b, mix);
  }

  async peek(request: AnalyzeRequest): Promise<ReportDTO | null> {
    return this.core.peek(request);
  }

  async analyze(
    request: AnalyzeRequest,
    opts: { signal?: AbortSignal; onProgress?: (p: Progress) => void } = {},
  ): Promise<ReportDTO> {
    const report = await this.core.analyze(
      request,
      opts.onProgress,
      () => opts.signal?.aborted ?? false,
    );
    if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    return report;
  }

  async relabel(request: RelabelRequest): Promise<ReportDTO | null> {
    return this.core.relabel(request);
  }

  async keyStats(request: KeyStatsRequest): Promise<KeyStatsDTO | null> {
    return this.core.keyStats(request);
  }

  async explain(layout: LayoutJson, text: string, caseMode: 'fold' | 'model'): Promise<ExplainDTO> {
    return this.core.explain(layout, text, caseMode);
  }

  async producers(
    layout: LayoutJson,
    caseMode: 'fold' | 'model',
  ): Promise<Record<string, ProducerDTO[]>> {
    return this.core.producers(layout, caseMode);
  }

  corpusFacts(corpusId: string): Promise<CorpusFactsDTO> {
    return this.core.corpusFacts(corpusId);
  }

  buildCustomCorpus(text: string, name: string, language: string): Promise<CorpusManifest> {
    return this.core.buildCustomCorpus(text, name, language);
  }

  corpusDocument(corpusId: string): Promise<Record<string, unknown>> {
    return this.core.corpusDocument(corpusId);
  }
}
