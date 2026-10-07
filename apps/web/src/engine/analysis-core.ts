import {
  analyzeSteps,
  type Corpus,
  type CorpusLoader,
  type CorpusManifest,
  cacheKey,
  compileLayout,
  corpusFromDoc,
  corpusSampleFacts,
  corpusStream,
  corpusToDoc,
  customCorpus,
  DEFAULT_SOFT,
  enumerateProducers,
  explain,
  fnv1a,
  keyStats,
  type Layout,
  type LayoutJson,
  languageSoft,
  mixCorpora,
  parseLayout,
  type Report,
  ReportCache,
  reevaluate,
  relabelEligible,
  relabelSwap,
  stableStringify,
  structureHash,
} from '@layerbench/core';
import type {
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
import { toReportDTO } from './report-dto.js';

/** Let a turn of the event loop go by, so messages waiting are handled. */
function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * The engine, with its caches. One instance lives in the worker; tests create one directly. Nothing
 * here touches the DOM, and the only I/O is through the injected corpus loader.
 */
export class AnalysisCore {
  /** Scored reports, one per layout, corpus and rule set. */
  private readonly reports = new ReportCache();
  /**
   * The last report typed for each layout and corpus, whatever it was scored by. Typing is what
   * costs; a different rule set, or counting space, only re-scores the same presses.
   */
  private readonly runs = new ReportCache();
  private readonly corpora = new Map<string, Corpus>();
  /** Corpora on their way in, so two analyses waiting for the same one fetch it once. */
  private readonly loading = new Map<string, Promise<Corpus>>();
  private readonly compiled = new Map<string, ReturnType<typeof compileLayout>>();
  private readonly facts = new Map<string, CorpusFactsDTO>();

  constructor(private readonly loader: CorpusLoader) {}

  async listCorpora(): Promise<CorpusManifest[]> {
    const shipped = await this.loader.list();
    const extra = [...this.corpora.values()]
      .filter((c) => !shipped.some((m) => m.id === c.id))
      .map(({ sample: _sample, custom: _custom, ...manifest }) => manifest);
    return [...shipped, ...extra];
  }

  /** Corpora are fetched once and kept: a 1 MB sample is reused by every subsequent analysis. */
  private async corpus(id: string): Promise<Corpus> {
    const hit = this.corpora.get(id);
    if (hit) return hit;
    let pending = this.loading.get(id);
    if (!pending) {
      pending = this.loader.load(id).finally(() => this.loading.delete(id));
      this.loading.set(id, pending);
    }
    const loaded = await pending;
    this.corpora.set(id, loaded);
    return loaded;
  }

  async loadCorpus(id: string): Promise<CorpusManifest> {
    const { sample: _sample, custom: _custom, ...manifest } = await this.corpus(id);
    return manifest;
  }

  /**
   * Take a corpus the main thread holds: a saved text, read from storage as it was saved. Its id is
   * the caller's to make unique; one made of the text's name alone would let a text saved again
   * under that name be answered with what was worked out from the old one.
   */
  registerCorpus(id: string, doc: Record<string, unknown>): CorpusManifest {
    const corpus = corpusFromDoc(id, doc);
    this.corpora.set(id, corpus);
    const { sample: _sample, custom: _custom, ...manifest } = corpus;
    return manifest;
  }

  async mix(aId: string, bId: string, mix: number): Promise<CorpusManifest> {
    const a = await this.corpus(aId);
    const b = await this.corpus(bId);
    const mixed = mixCorpora([
      [a, mix],
      [b, 100 - mix],
    ]);
    this.corpora.set(mixed.id, mixed);
    const { sample: _sample, custom: _custom, ...manifest } = mixed;
    return manifest;
  }

  async buildCustomCorpus(text: string, name: string, language: string): Promise<CorpusManifest> {
    const c = customCorpus(text, { name, language });
    this.corpora.set(c.id, c);
    const { sample: _sample, custom: _custom, ...manifest } = c;
    return manifest;
  }

  async corpusFacts(id: string): Promise<CorpusFactsDTO> {
    const hit = this.facts.get(id);
    if (hit) return hit;
    const c = await this.corpus(id);
    const f = corpusSampleFacts(c);
    const top = (m: Map<string, number>, n: number): [string, number][] =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
    const dto: CorpusFactsDTO = {
      symbols: f.symbols,
      words: f.words,
      letters: top(f.unigram, 15),
      bigrams: top(f.bigram, 15),
      trigrams: top(f.trigram, 15),
      topWords: top(f.wordFreq, 15),
    };
    this.facts.set(id, dto);
    return dto;
  }

  /** The document a corpus is saved as, sample included. */
  async corpusDocument(id: string): Promise<Record<string, unknown>> {
    return corpusToDoc(await this.corpus(id));
  }

  private layoutOf(json: LayoutJson): Layout {
    return parseLayout(json);
  }

  private compiledFor(json: LayoutJson): ReturnType<typeof compileLayout> {
    const layout = this.layoutOf(json);
    const key = structureHash(layout);
    const hit = this.compiled.get(key);
    if (hit) return hit;
    const c = compileLayout(layout);
    if (this.compiled.size > 16) this.compiled.clear();
    this.compiled.set(key, c);
    return c;
  }

  /** Everything that changes what is typed: the layout, the corpus and how it is read. */
  private runKey(request: AnalyzeRequest): string {
    return cacheKey({
      structureHash: structureHash(this.layoutOf(request.layout), {
        caseMode: request.caseMode,
        textClass: request.textClass,
        crossWord: request.crossWord,
        maxSymbols: request.maxSymbols,
        corpusId: request.corpusId,
      }),
      caseMode: request.caseMode,
      textClass: request.textClass,
      crossWord: request.crossWord,
      maxSymbols: request.maxSymbols,
    });
  }

  /** A report's identity: what was typed, and the rules it was scored by. */
  keyFor(request: AnalyzeRequest): string {
    return `${this.runKey(request)}|${fnv1a(stableStringify(request.ruleSet))}`;
  }

  /**
   * The report for a request if nothing needs typing: already scored, or typed before under other
   * rules and re-scored now, which takes milliseconds.
   */
  private cached(request: AnalyzeRequest, key: string): Report | undefined {
    const hit = this.reports.get(key);
    if (hit) return hit;
    const run = this.runs.get(this.runKey(request));
    if (!run) return undefined;
    const rescored = reevaluate(run, request.ruleSet);
    this.reports.set(key, rescored);
    return rescored;
  }

  peek(request: AnalyzeRequest): ReportDTO | null {
    const key = this.keyFor(request);
    const hit = this.cached(request, key);
    return hit ? toReportDTO(hit, key) : null;
  }

  /**
   * Type and score. The typing stops every so many symbols for a moment, so the worker can answer
   * what came in meanwhile — an estimate after a swap, a word to explain — and give the analysis
   * up once `isCancelled` says nobody waits for it any more; it then throws an `AbortError` and
   * keeps nothing.
   */
  async analyze(
    request: AnalyzeRequest,
    onProgress?: (p: Progress) => void,
    isCancelled: () => boolean = () => false,
  ): Promise<ReportDTO> {
    const key = this.keyFor(request);
    const cached = this.cached(request, key);
    if (cached) return toReportDTO(cached, key);

    const corpus = await this.corpus(request.corpusId);
    const stream = corpusStream(corpus, request.caseMode, request.textClass);
    const total = Math.min(request.maxSymbols, [...stream].length);
    onProgress?.({ done: 0, total });

    const steps = analyzeSteps(this.compiledFor(request.layout), stream, {
      caseMode: request.caseMode,
      crossWord: request.crossWord,
      maxSymbols: request.maxSymbols,
      ruleSet: request.ruleSet,
      // The corpus's own punctuation is punctuation, not a letter the layout is failing to write.
      softSymbols: [...DEFAULT_SOFT, ...languageSoft(corpus.language)],
    });
    let report: Report;
    for (;;) {
      if (isCancelled()) throw new DOMException('aborted', 'AbortError');
      const step = steps.next();
      if (step.done) {
        report = step.value;
        break;
      }
      onProgress?.({ done: step.value, total });
      await pause();
    }
    onProgress?.({ done: total, total });
    this.runs.set(this.runKey(request), report);
    this.reports.set(key, report);
    return toReportDTO(report, key);
  }

  /**
   * Re-score a swap from an existing report. Returns null when the swap is not a pure relabel or
   * the base report is gone, in which case the caller waits for the full analysis.
   */
  relabel(request: RelabelRequest): ReportDTO | null {
    const base: Report | undefined = this.reports.get(request.baseKey);
    if (!base) return null;
    const compiled = this.compiledFor(request.layout);
    if (!relabelEligible(base.compiled, request.layerIdx, request.posA, request.posB)) return null;
    const estimated = relabelSwap(
      base,
      compiled,
      request.layerIdx,
      request.posA,
      request.posB,
      request.ruleSet,
    );
    // Deliberately not cached: an estimate must never stand in for a real analysis.
    return toReportDTO(estimated, `${request.baseKey}~relabel`);
  }

  /**
   * What one key of a kept report takes part in. Null when the report is gone, or never kept — an
   * estimate after a swap is not — or the key or layer is not on the layout.
   */
  keyStats(request: KeyStatsRequest): KeyStatsDTO | null {
    const report = this.reports.get(request.reportKey);
    if (!report) return null;
    const { key, layer } = request;
    if (!report.compiled.keys[key] || !report.compiled.layers[layer]) return null;
    const { rules, next } = keyStats(report, key, layer, { limit: request.limit });
    return { reportKey: request.reportKey, key, layer, rules, next };
  }

  explain(json: LayoutJson, text: string, caseMode: 'fold' | 'model'): ExplainDTO {
    const compiled = this.compiledFor(json);
    const r = explain(compiled, text.slice(0, 80), { caseMode, crossWord: 'reset' });
    return {
      steps: r.steps.map((s) => ({
        key: s.key,
        layer: s.layer,
        finger: String(s.finger),
        kind: s.kind,
        keyKind: s.keyKind,
        label: s.label,
        symbols: s.symbols,
        wastedOneShot: s.wastedOneShot,
      })),
      presses: r.presses,
      coverage: {
        unproducible: [...r.coverage.unproducible.entries()],
        softDropped: [...r.coverage.softDropped.entries()],
        excludedByCase: r.coverage.excludedByCase ?? [],
      },
    };
  }

  producers(json: LayoutJson, caseMode: 'fold' | 'model'): Record<string, ProducerDTO[]> {
    const index = enumerateProducers(this.compiledFor(json), caseMode);
    const out: Record<string, ProducerDTO[]> = {};
    for (const [symbol, list] of index.bySymbol) {
      out[symbol] = list.map((p) => ({ id: p.id, kind: p.kind, cost: p.cost }));
    }
    return out;
  }
}
