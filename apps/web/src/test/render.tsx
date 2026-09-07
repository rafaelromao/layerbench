import { resolve } from 'node:path';
import type { StorageAdapter } from '@layoutmaster/core';
import { nodeCorpusLoader } from '@layoutmaster/core/node';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { type RenderResult, render } from '@testing-library/react';
import { AnalysisCore } from '../engine/analysis-core.js';
import { AnalysisClientProvider } from '../engine/client-context.js';
import { DirectClient } from '../engine/direct-client.js';
import type { AnalysisClient } from '../engine/protocol.js';
import { createAppRouter } from '../router.js';
import { StorageProvider } from '../storage/use-storage.js';

/**
 * The corpora the built site serves, read straight from disk in tests. Resolved from the working
 * directory because a jsdom module has an http URL, not a file one.
 */
export function testCorporaRoot(): string {
  return resolve(process.cwd(), 'public/corpora');
}

export function testClient(): AnalysisClient {
  return new DirectClient(new AnalysisCore(nodeCorpusLoader(testCorporaRoot())));
}

/**
 * Render the application at a route, with the engine running on the same thread. A worker cannot be
 * constructed under jsdom, and running in-thread also keeps assertions deterministic.
 */
export function renderRoute(
  path: string,
  opts: { client?: AnalysisClient; storage?: StorageAdapter } = {},
): RenderResult & { client: AnalysisClient; currentSearch: () => string } {
  const client = opts.client ?? testClient();
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    basepath: '/',
  });
  const result = render(
    <AnalysisClientProvider client={client}>
      <StorageProvider adapter={opts.storage}>
        <RouterProvider router={router} />
      </StorageProvider>
    </AnalysisClientProvider>,
  );
  // Memory history never touches window.location, so the router is the source of truth for links.
  return { ...result, client, currentSearch: () => router.state.location.searchStr };
}
