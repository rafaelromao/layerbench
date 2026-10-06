import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Shell } from './components/Shell.js';
import { ENGLISH_CORPUS, type RawSearch, savedRef } from './url/params.js';
import { AnalyzeView } from './views/AnalyzeView.js';
import { CompareView } from './views/CompareView.js';
import { CorpusView } from './views/CorpusView.js';
import { GuideView } from './views/GuideView.js';
import { LibraryView } from './views/LibraryView.js';
import { RulesView } from './views/RulesView.js';

/**
 * Search parameters stay strings from end to end. The router must not coerce them: what a value
 * means is decided by `parseParams` alone.
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

/**
 * The front door is the Library. Analyze lived here before it had a path of its own, and a link to
 * an analysis always names its layout, so one that does still opens that analysis.
 */
const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>): RawSearch => search as RawSearch,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: search.layout === undefined ? '/library' : '/analyze',
      search,
      replace: true,
    });
  },
  component: () => null,
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

const analyzeRoute = view('/analyze', AnalyzeView);
/**
 * Edit was joined into Analyze, where a layout is edited now. A link to it still opens its layout
 * there, on English news when it names no text, as Edit opened it.
 */
const editRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/edit',
  validateSearch: (search: Record<string, unknown>): RawSearch => search as RawSearch,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: '/analyze',
      search: { ...search, corpus: search.corpus || ENGLISH_CORPUS },
      replace: true,
    });
  },
  component: () => null,
});
const rulesRoute = view('/rules', RulesView);
const compareRoute = view('/compare', CompareView);
const corpusRoute = view('/corpus', CorpusView);
const libraryRoute = view('/library', LibraryView);
const guideRoute = view('/guide', GuideView);
const guidePageRoute = view('/guide/$page', GuideView);

/** Short link to a saved layout. */
const savedLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/l/$id',
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/analyze', search: { layout: savedRef(params.id) } });
  },
  component: () => null,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
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
