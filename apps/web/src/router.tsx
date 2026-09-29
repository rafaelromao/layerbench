import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Shell } from './components/Shell.js';
import { type RawSearch, savedRef } from './url/params.js';
import { AnalyzeView } from './views/AnalyzeView.js';
import { CompareView } from './views/CompareView.js';
import { CorpusView } from './views/CorpusView.js';
import { EditView } from './views/EditView.js';
import { GuideView } from './views/GuideView.js';
import { LibraryView } from './views/LibraryView.js';
import { RulesView } from './views/RulesView.js';

/**
 * Search parameters stay strings from end to end. The router must not coerce them: what a value
 * means is decided by `parseParams`, which mirrors the reference implementation exactly.
 */
function parseSearch(searchStr: string): RawSearch {
  const out: RawSearch = {};
  for (const [k, v] of new URLSearchParams(searchStr)) out[k] = v;
  return out;
}

/** Keys are sorted and empty values dropped, so the same state always produces the same link. */
function stringifySearch(search: RawSearch): string {
  const sp = new URLSearchParams();
  for (const key of Object.keys(search).sort()) {
    const value = search[key];
    if (value !== undefined && value !== null && value !== '') sp.set(key, String(value));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

const rootRoute = createRootRoute({
  component: () => (
    <Shell>
      <Outlet />
    </Shell>
  ),
});

const analyzeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>): RawSearch => search as RawSearch,
  component: AnalyzeView,
});

/** Every view route reads the same raw search object; each view parses what it needs. */
function view(path: string, component: () => ReactNode) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path,
    validateSearch: (search: Record<string, unknown>): RawSearch => search as RawSearch,
    component,
  });
}

const editRoute = view('/edit', EditView);
const rulesRoute = view('/rules', RulesView);
const compareRoute = view('/compare', CompareView);
const corpusRoute = view('/corpus', CorpusView);
const libraryRoute = view('/library', LibraryView);
const guideRoute = view('/guide', GuideView);
const guidePageRoute = view('/guide/$page', GuideView);

/** Short link to a saved layout, kept from the reference application. */
const savedLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/l/$id',
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/', search: { layout: savedRef(params.id) } });
  },
  component: () => null,
});

const routeTree = rootRoute.addChildren([
  analyzeRoute,
  editRoute,
  compareRoute,
  rulesRoute,
  corpusRoute,
  libraryRoute,
  guideRoute,
  guidePageRoute,
  savedLayoutRoute,
]);

export function createAppRouter(
  options: Parameters<typeof createRouter>[0] extends never
    ? never
    : Partial<Parameters<typeof createRouter>[0]> = {},
) {
  return createRouter({
    routeTree,
    basepath: import.meta.env.BASE_URL,
    parseSearch,
    stringifySearch,
    defaultPreload: false,
    ...options,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
