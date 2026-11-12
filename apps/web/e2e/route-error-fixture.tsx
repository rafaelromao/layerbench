import {
  createMemoryHistory,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';
import { createAppRootRoute } from '../src/router.js';
import { IndexedDbAdapter } from '../src/storage/indexeddb.js';
import { StorageProvider } from '../src/storage/use-storage.js';

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
  component: () => <h1>Library destination</h1>,
});
const router = createRouter({
  routeTree: rootRoute.addChildren([brokenRoute, libraryRoute]),
  history: createMemoryHistory({ initialEntries: ['/broken'] }),
  basepath: '/',
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StorageProvider adapter={new IndexedDbAdapter('layerbench-route-error-e2e')}>
    <RouterProvider router={router as never} />
  </StorageProvider>,
);
