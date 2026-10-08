import { resolve } from 'node:path';
import type { StorageAdapter } from '@layerbench/core';
import { nodeCorpusLoader } from '@layerbench/core/node';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { type RenderResult, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnalysisCore } from '../engine/analysis-core.js';
import { AnalysisClientProvider, SavedCorporaProvider } from '../engine/client-context.js';
import { DirectClient } from '../engine/direct-client.js';
import type { AnalysisClient } from '../engine/protocol.js';
import { createAppRouter } from '../router.js';
import { StorageProvider } from '../storage/use-storage.js';
import { decodeInline } from '../url/inline.js';

/**
 * The corpora the built site serves, read straight from disk in tests. Resolved from the working
 * directory because a jsdom module has an http URL, not a file one.
 */
export function testCorporaRoot(): string {
  return resolve(process.cwd(), 'public/corpora');
}

/**
 * The saved layout a link opens: `saved:<id>` names it, and once Analyze has it open the link
 * carries it whole, with its id inside. Null for any other layout.
 */
export async function savedInLink(search: string): Promise<string | null> {
  const ref = new URLSearchParams(search).get('layout') ?? '';
  if (ref.startsWith('saved:')) return ref.slice('saved:'.length);
  if (!ref.startsWith('inline:')) return null;
  const decoded = await decodeInline(ref.slice('inline:'.length));
  return decoded.ok ? (decoded.layout.id ?? null) : null;
}

/** The Settings dialog of Analyze or Compare, opened: the text, the rules and the switches. */
export async function openSettings(): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole('button', { name: 'Settings' }));
  return screen.getByRole('dialog', { name: 'Settings' });
}

export function testClient(): AnalysisClient {
  return new DirectClient(new AnalysisCore(nodeCorpusLoader(testCorporaRoot())));
}

/**
 * The Library, for a test about something other than ranking. The Library scores every layout it
 * lists; the app does that in a worker, but here the engine shares the test's thread, so the
 * sample stays tiny rather than twenty-odd full analyses competing with the test for the CPU.
 */
export const LIBRARY = '/library?sample=1000';

/**
 * Wait for the Library's line on its ranking — what it is scoring, or what it ranked on — to read
 * `text`. Only that line is watched: the Library redraws every card as each score comes in, and a
 * query over the whole page after each redraw cost several times the scoring itself.
 */
export async function rankingSays(text: RegExp, timeout?: number): Promise<HTMLElement> {
  const line = await screen.findByText(/^(Scoring layouts|Lower is better|Could not score)/);
  return within(line).findByText(text, undefined, { timeout });
}

/**
 * Render the application at a route, with the engine running on the same thread. A worker cannot be
 * constructed under jsdom, and running in-thread also keeps assertions deterministic.
 */
export function renderRoute(
  path: string,
  opts: { client?: AnalysisClient; storage?: StorageAdapter } = {},
): RenderResult & {
  client: AnalysisClient;
  currentSearch: () => string;
  currentPath: () => string;
} {
  const client = opts.client ?? testClient();
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    basepath: '/',
  });
  const result = render(
    <AnalysisClientProvider client={client}>
      <StorageProvider adapter={opts.storage}>
        <SavedCorporaProvider>
          <RouterProvider router={router} />
        </SavedCorporaProvider>
      </StorageProvider>
    </AnalysisClientProvider>,
  );
  // Memory history never touches window.location, so the router is the source of truth for links.
  return {
    ...result,
    client,
    currentSearch: () => router.state.location.searchStr,
    currentPath: () => router.state.location.pathname,
  };
}
