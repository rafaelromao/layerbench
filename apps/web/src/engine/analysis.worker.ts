/// <reference lib="webworker" />
import { AnalysisCore } from './analysis-core.js';
import { fetchCorpusLoader } from './corpus-loader.js';
import type { Request, Response } from './protocol.js';

/**
 * The engine's home in the browser. Analyses hold megabyte-sized n-gram tables and run for seconds,
 * so they stay off the thread that paints.
 */
const core = new AnalysisCore(fetchCorpusLoader(import.meta.env.BASE_URL));

function post(message: Response): void {
  self.postMessage(message);
}

async function handle(req: Request): Promise<unknown> {
  switch (req.type) {
    case 'listCorpora':
      return core.listCorpora();
    case 'loadCorpus':
      return core.loadCorpus(req.corpusId);
    case 'registerCorpus':
      return core.registerCorpus(req.corpus);
    case 'mixCorpora':
      return core.mix(req.a, req.b, req.mix);
    case 'peek':
      return core.peek(req.request);
    case 'analyze':
      return core.analyze(req.request, (progress) => post({ id: req.id, progress }));
    case 'relabel':
      return core.relabel(req.request);
    case 'explain':
      return core.explain(req.layout, req.text, req.caseMode);
    case 'producers':
      return core.producers(req.layout, req.caseMode);
    case 'corpusFacts':
      return core.corpusFacts(req.corpusId);
    case 'buildCustomCorpus':
      return core.buildCustomCorpus(req.text, req.name, req.language);
    default:
      throw new Error(`unknown request: ${(req as { type: string }).type}`);
  }
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const req = e.data;
  try {
    post({ id: req.id, ok: true, result: await handle(req) });
  } catch (error) {
    post({ id: req.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
