import type { AnalysisCore } from './analysis-core.js';
import type { Request, Response } from './protocol.js';

/**
 * How the worker answers. Analyses run one at a time, in the order asked, as the Library's ranking
 * expects; while one types, the others wait and everything else is answered between its pauses. A
 * `cancel` names a request still in hand: an analysis drops out at its next pause, or before it
 * starts, and a cancelled request gets no answer, since nobody is waiting for one.
 */
export function createRequestHandler(
  core: AnalysisCore,
  post: (message: Response) => void,
): (req: Request) => void {
  const inHand = new Set<number>();
  const cancelled = new Set<number>();
  let analyses: Promise<unknown> = Promise.resolve();

  const handle = (req: Request): Promise<unknown> | unknown => {
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
      case 'analyze': {
        const run = analyses.then(() =>
          core.analyze(
            req.request,
            (progress) => post({ id: req.id, progress }),
            () => cancelled.has(req.id),
          ),
        );
        analyses = run.catch(() => {});
        return run;
      }
      case 'relabel':
        return core.relabel(req.request);
      case 'keyStats':
        return core.keyStats(req.request);
      case 'explain':
        return core.explain(req.layout, req.text, req.caseMode);
      case 'producers':
        return core.producers(req.layout, req.caseMode);
      case 'corpusFacts':
        return core.corpusFacts(req.corpusId);
      case 'corpusDocument':
        return core.corpusDocument(req.corpusId);
      case 'buildCustomCorpus':
        return core.buildCustomCorpus(req.text, req.name, req.language);
      default:
        throw new Error(`unknown request: ${(req as { type: string }).type}`);
    }
  };

  return (req) => {
    if (req.type === 'cancel') {
      if (inHand.has(req.id)) cancelled.add(req.id);
      return;
    }
    inHand.add(req.id);
    Promise.resolve()
      .then(() => handle(req))
      .then(
        (result) => {
          if (!cancelled.has(req.id)) post({ id: req.id, ok: true, result });
        },
        (error) => {
          if (!cancelled.has(req.id))
            post({
              id: req.id,
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            });
        },
      )
      .finally(() => {
        inHand.delete(req.id);
        cancelled.delete(req.id);
      });
  };
}
