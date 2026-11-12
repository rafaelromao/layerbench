import {
  createMemoryHistory,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { initGitHubSession, signOut } from './auth/github-session.js';
import { AnalysisClientProvider, CustomCorporaProvider } from './engine/client-context.js';
import { createAppRootRoute } from './router.js';
import { IndexedDbAdapter } from './storage/indexeddb.js';
import { StorageProvider } from './storage/use-storage.js';
import { renderRoute, testClient } from './test/render.js';
import type { RawSearch } from './url/params.js';
import { LibraryView } from './views/LibraryView.js';

function renderThrowingRoute(error: Error) {
  const root = createAppRootRoute();
  const broken = createRoute({
    getParentRoute: () => root,
    path: '/broken',
    component: () => {
      throw error;
    },
  });
  const library = createRoute({
    getParentRoute: () => root,
    path: '/library',
    validateSearch: (search: Record<string, unknown>): RawSearch => search as RawSearch,
    component: LibraryView,
  });
  const router = createRouter({
    routeTree: root.addChildren([broken, library]),
    history: createMemoryHistory({ initialEntries: ['/broken'] }),
    basepath: '/',
  });
  render(
    <AnalysisClientProvider client={testClient()}>
      <StorageProvider adapter={new IndexedDbAdapter('layerbench-router-error')}>
        <CustomCorporaProvider>
          <RouterProvider router={router as never} />
        </CustomCorporaProvider>
      </StorageProvider>
    </AnalysisClientProvider>,
  );
  return router;
}

describe('unknown addresses', () => {
  it('shows a not-found screen inside the app shell with a way to the Library', async () => {
    renderRoute('/not-a-layerbench-view');

    await screen.findByRole('heading', { name: 'Page not found' });
    const main = document.getElementById('main');
    expect(main).not.toBeNull();
    expect(
      await within(main as HTMLElement).findByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument();
    expect(within(main as HTMLElement).getByText(/could not find that page/i)).toBeInTheDocument();
    expect(
      within(main as HTMLElement).getByRole('link', { name: 'Back to the Library' }),
    ).toHaveAttribute('href', '/library');
    expect(screen.getAllByRole('banner')).toHaveLength(1);
  });
});

describe('rendering errors', () => {
  it('shows recovery actions and lets the Library open', async () => {
    const user = userEvent.setup();
    const router = renderThrowingRoute(new Error('The view failed to load'));

    await screen.findByRole('heading', { name: 'This page could not be loaded' });
    expect(screen.getAllByRole('banner')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('The view failed to load');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the Library' })).toHaveAttribute(
      'href',
      '/library',
    );
    expect(screen.getByRole('link', { name: 'Open an issue' })).toHaveAttribute(
      'href',
      'https://github.com/rafaelromao/layerbench/issues/new',
    );

    await user.click(screen.getByRole('link', { name: 'Back to the Library' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/library'));
    expect(await screen.findByRole('heading', { name: 'Library' })).toBeInTheDocument();
  });

  it('redacts credentials but keeps diagnostic context', async () => {
    const token = 'ghu_layerbench-test-token';
    const session = 'sealed-session-test-value';
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          JSON.stringify({
            available: true,
            signedIn: true,
            token,
            session,
            login: 'tester',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    await initGitHubSession();

    renderThrowingRoute(
      new Error(
        `Rendering failed. access_token=${token}; session=${session}; diagnostic context remains.`,
      ),
    );

    const message = await screen.findByRole('alert');
    const routeScreen = screen.getByRole('region', { name: 'This page could not be loaded' });
    expect(message).toHaveTextContent('Rendering failed.');
    expect(message).toHaveTextContent('diagnostic context remains.');
    expect(routeScreen).not.toHaveTextContent(token);
    expect(routeScreen).not.toHaveTextContent(session);

    await signOut();
    vi.unstubAllGlobals();
  });
});
