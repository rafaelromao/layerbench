import {
  createMemoryHistory,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';
import { AnalysisClientProvider, CustomCorporaProvider } from '../src/engine/client-context.js';
import '../src/index.css';
import { createAppRootRoute } from '../src/router.js';
import { IndexedDbAdapter } from '../src/storage/indexeddb.js';
import { StorageProvider } from '../src/storage/use-storage.js';
import type { RawSearch } from '../src/url/params.js';
import { LibraryView } from '../src/views/LibraryView.js';

const rootRoute = createAppRootRoute();
const brokenRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/broken',
  component: () => {
    throw new Error('A view crashed while rendering.');
  },
});
const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library',
  validateSearch: (search: Record<string, unknown>): RawSearch => search as RawSearch,
  component: LibraryView,
});
const router = createRouter({
  routeTree: rootRoute.addChildren([brokenRoute, libraryRoute]),
  history: createMemoryHistory({ initialEntries: ['/broken'] }),
  basepath: '/',
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <AnalysisClientProvider>
    <StorageProvider adapter={new IndexedDbAdapter('layerbench-route-error-e2e')}>
      <CustomCorporaProvider>
        <RouterProvider router={router as never} />
      </CustomCorporaProvider>
    </StorageProvider>
  </AnalysisClientProvider>,
);
