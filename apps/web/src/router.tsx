import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { Shell } from './components/Shell.js';
import { type RawSearch, savedRef } from './url/params.js';
import { AnalyzeView } from './views/AnalyzeView.js';
import { PlaceholderView } from './views/PlaceholderView.js';

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

function placeholder(path: string, title: string, note: string) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path,
    validateSearch: (search: Record<string, unknown>): RawSearch => search as RawSearch,
    component: () => <PlaceholderView title={title} note={note} />,
  });
}

const editRoute = placeholder(
  '/edit',
  'Edit',
  'The layout editor arrives with the editing milestone.',
);
const compareRoute = placeholder(
  '/compare',
  'Compare',
  'Side-by-side comparison arrives with the library milestone.',
);
const rulesRoute = placeholder(
  '/rules',
  'Rules',
  'The rule editor arrives with the rules milestone.',
);
const corpusRoute = placeholder(
  '/corpus',
  'Corpus',
  'Corpus browsing arrives with the library milestone.',
);
const libraryRoute = placeholder(
  '/library',
  'Library',
  'The layout library arrives with the library milestone.',
);

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
