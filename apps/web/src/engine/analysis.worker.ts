/// <reference lib="webworker" />
import { AnalysisCore } from './analysis-core.js';
import { fetchCorpusLoader } from './corpus-loader.js';
import type { Request, Response } from './protocol.js';
import { createRequestHandler } from './worker-handler.js';

/**
 * The engine's home in the browser. Analyses hold megabyte-sized n-gram tables and run for seconds,
 * so they stay off the thread that paints.
 */
const core = new AnalysisCore(fetchCorpusLoader(import.meta.env.BASE_URL));

const handle = createRequestHandler(core, (message: Response) => self.postMessage(message));

self.onmessage = (e: MessageEvent<Request>) => handle(e.data);
