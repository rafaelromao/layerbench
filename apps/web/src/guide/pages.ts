import { GLOSSARY_URL } from '@layerbench/core';

/**
 * The guide's pages. They are the Markdown files in `docs/`, read at build time, so the guide in
 * the app and the one in the repository are the same text and cannot drift apart.
 */
export interface GuidePage {
  /** The page's address under `/guide`; the index is the empty one. */
  slug: string;
  /** Where the file is in the repository, which its relative links are read against. */
  path: string;
  /** What the page is called in the list of pages. */
  title: string;
  /** The Markdown is its own chunk, loaded only when this page is opened. */
  load: () => Promise<string>;
}

export const GUIDE_PAGES: readonly GuidePage[] = [
  {
    slug: '',
    path: 'docs/guide/README.md',
    title: 'Start here',
    load: () => import('../../../../docs/guide/README.md?raw').then(({ default: page }) => page),
  },
  {
    slug: 'analyzing',
    path: 'docs/guide/analyzing.md',
    title: 'Analyzing',
    load: () => import('../../../../docs/guide/analyzing.md?raw').then(({ default: page }) => page),
  },
  {
    slug: 'editing',
    path: 'docs/guide/editing.md',
    title: 'Editing',
    load: () => import('../../../../docs/guide/editing.md?raw').then(({ default: page }) => page),
  },
  {
    slug: 'special-keys',
    path: 'docs/guide/special-keys.md',
    title: 'Special keys',
    load: () =>
      import('../../../../docs/guide/special-keys.md?raw').then(({ default: page }) => page),
  },
  {
    slug: 'importing',
    path: 'docs/guide/importing.md',
    title: 'Importing and exporting',
    load: () => import('../../../../docs/guide/importing.md?raw').then(({ default: page }) => page),
  },
  {
    slug: 'saving',
    path: 'docs/guide/saving.md',
    title: 'Saving and sharing',
    load: () => import('../../../../docs/guide/saving.md?raw').then(({ default: page }) => page),
  },
  {
    slug: 'metrics',
    path: 'docs/METRICS.md',
    title: 'Metric glossary',
    load: () => import('../../../../docs/METRICS.md?raw').then(({ default: page }) => page),
  },
];

export function guidePage(slug: string): GuidePage | undefined {
  return GUIDE_PAGES.find((p) => p.slug === slug);
}

/** The repository's files on GitHub, which the glossary's own address is one of. */
const REPOSITORY_FILES = new URL('../', GLOSSARY_URL).href;

export type LinkTarget =
  | { kind: 'page'; slug: string; hash?: string }
  | { kind: 'external'; href: string };

/** A path inside the repository, from a link written in the file at `from`. */
function repositoryPath(href: string, from: string): string {
  const parts = from.split('/').slice(0, -1);
  for (const part of href.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.' && part !== '') parts.push(part);
  }
  return parts.join('/');
}

/**
 * Where a link written in a page goes. A link to another page of the guide stays in the app; a link
 * to any other file of the repository goes to it on GitHub; the web is the web.
 */
export function resolveLink(href: string, from: GuidePage): LinkTarget {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { kind: 'external', href };
  const [file, hash] = href.split('#', 2) as [string, string | undefined];
  if (file === '') return { kind: 'page', slug: from.slug, hash };
  const path = repositoryPath(file, from.path);
  const page = GUIDE_PAGES.find((p) => p.path === path);
  if (page) return { kind: 'page', slug: page.slug, hash };
  return { kind: 'external', href: `${REPOSITORY_FILES}${path}${hash ? `#${hash}` : ''}` };
}
