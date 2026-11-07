import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CodeLanguage, Lexicon } from '@layerbench/core/prepare';

/**
 * `raw/code-sources.json`: what the code and Markdown corpora are made of. Each corpus says how
 * big it is and, for code, how its bytes are shared among the languages; each repository says
 * which corpus it feeds, its language, the commit it is read at and the licence it is under.
 */

export interface CorpusPlan {
  kind: 'code' | 'markdown';
  /** The most bytes of text the corpus holds; the sample's own cap is a megabyte. */
  bytes: number;
  /** For code: each language's share of the bytes, in percent. */
  shares?: Partial<Record<CodeLanguage, number>>;
}

export interface Repo {
  id: string;
  /** `owner/name` on GitHub. */
  repo: string;
  /** The commit read: a repository is never read at a branch, which moves. */
  commit: string;
  corpus: string;
  language?: CodeLanguage;
  /** The licence the files are taken under, as an SPDX id; the licence file must say so. */
  license: string;
  /** Path of the licence file in the repository. */
  licenseFile: string;
  /** Only files under one of these paths. */
  include?: string[];
  /** Files whose path matches this are left out. */
  exclude?: string;
  /** The file extensions read, where the language's own are not right (`.md` for Markdown). */
  extensions?: string[];
}

/**
 * Texts that are not corpora, read only to measure how they compare with them
 * (`pnpm corpora:research`, `docs/research/code-corpora.md`): nothing of them is committed.
 */
export interface ResearchGroup {
  name: string;
  /** How its comments are written. */
  lexicon: Lexicon;
}

export interface ResearchRepo extends Omit<Repo, 'corpus' | 'language' | 'extensions'> {
  group: string;
  /** Read the files kept under `testdata` and `fixtures`, where this group's samples are. */
  keepFixtures?: boolean;
}

export interface CodeSources {
  corpora: Record<string, CorpusPlan>;
  repos: Repo[];
  research: { bytes: number; groups: Record<string, ResearchGroup>; repos: ResearchRepo[] };
}

const here = dirname(fileURLToPath(import.meta.url));
export const RAW_DIR = join(here, '..', 'raw');
export const CACHE_DIR = join(here, '..', '.cache', 'code');

export function readCodeSources(): CodeSources {
  return JSON.parse(readFileSync(join(RAW_DIR, 'code-sources.json'), 'utf8')) as CodeSources;
}

export const tarballUrl = (r: { repo: string; commit: string }): string =>
  `https://codeload.github.com/${r.repo}/tar.gz/${r.commit}`;

export const tarballPath = (r: { id: string }): string => join(CACHE_DIR, `${r.id}.tar.gz`);
