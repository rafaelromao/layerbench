import type { CorpusManifest, LayoutJson } from '@layerbench/core';
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
  Request,
  Response,
} from './protocol.js';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  onProgress?: (p: Progress) => void;
}

/** Distributes over the union, so each request keeps its own fields once the id is removed. */
type RequestBody = Request extends infer R
  ? R extends { id: number }
    ? Omit<R, 'id'>
    : never
  : never;

/**
 * Talks to the engine worker. Every call carries an id so replies can be matched, and an aborted
 * call rejects immediately rather than waiting for work that no longer matters.
 */
export class WorkerClient implements AnalysisClient {
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;

  constructor(private readonly worker: Worker) {
    this.worker.onmessage = (e: MessageEvent<Response>) => {
      const msg = e.data;
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      if ('progress' in msg) {
        entry.onProgress?.(msg.progress);
        return;
      }
      this.pending.delete(msg.id);
      if (msg.ok) entry.resolve(msg.result);
      else entry.reject(new Error(msg.error));
    };
    this.worker.onerror = (e) => {
      for (const [, entry] of this.pending) entry.reject(new Error(e.message));
      this.pending.clear();
    };
  }

  private send<T>(
    request: RequestBody,
    opts: { signal?: AbortSignal; onProgress?: (p: Progress) => void } = {},
  ): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        onProgress: opts.onProgress,
      });
      opts.signal?.addEventListener(
        'abort',
        () => {
          if (!this.pending.delete(id)) return;
          reject(new DOMException('aborted', 'AbortError'));
          // The worker drops it too: an analysis nobody waits for stops at its next pause.
          this.worker.postMessage({ id, type: 'cancel' } satisfies Request);
        },
        { once: true },
      );
      this.worker.postMessage({ ...request, id } as Request);
    });
  }

  listCorpora(): Promise<CorpusManifest[]> {
    return this.send({ type: 'listCorpora' });
  }

  loadCorpus(corpusId: string): Promise<CorpusManifest> {
    return this.send({ type: 'loadCorpus', corpusId });
  }

  registerCorpus(corpus: {
    id: string;
    name: string;
    language: string;
    sample: string;
  }): Promise<CorpusManifest> {
    return this.send({ type: 'registerCorpus', corpus });
  }

  mixCorpora(a: string, b: string, mix: number): Promise<CorpusManifest> {
    return this.send({ type: 'mixCorpora', a, b, mix });
  }

  peek(request: AnalyzeRequest): Promise<ReportDTO | null> {
    return this.send({ type: 'peek', request });
  }

  analyze(
    request: AnalyzeRequest,
    opts: { signal?: AbortSignal; onProgress?: (p: Progress) => void } = {},
  ): Promise<ReportDTO> {
    return this.send({ type: 'analyze', request }, opts);
  }

  relabel(request: RelabelRequest): Promise<ReportDTO | null> {
    return this.send({ type: 'relabel', request });
  }

  keyStats(request: KeyStatsRequest): Promise<KeyStatsDTO | null> {
    return this.send({ type: 'keyStats', request });
  }

  explain(layout: LayoutJson, text: string, caseMode: 'fold' | 'model'): Promise<ExplainDTO> {
    return this.send({ type: 'explain', layout, text, caseMode });
  }

  producers(
    layout: LayoutJson,
    caseMode: 'fold' | 'model',
  ): Promise<Record<string, ProducerDTO[]>> {
    return this.send({ type: 'producers', layout, caseMode });
  }

  corpusFacts(corpusId: string): Promise<CorpusFactsDTO> {
    return this.send({ type: 'corpusFacts', corpusId });
  }

  buildCustomCorpus(text: string, name: string, language: string): Promise<CorpusManifest> {
    return this.send({ type: 'buildCustomCorpus', text, name, language });
  }

  corpusDocument(corpusId: string): Promise<Record<string, unknown>> {
    return this.send({ type: 'corpusDocument', corpusId });
  }
}

/** Spawn the engine worker and wrap it. */
export function createWorkerClient(): WorkerClient {
  const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
  return new WorkerClient(worker);
}
