import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { CODE_TAG, languageProfile } from '@layerbench/core';
import { isAllowedLicense } from '@layerbench/core/prepare';
import { describe, expect, it } from 'vitest';

/**
 * The texts that come with the app: `packages/corpora/raw/sources.json` says what each is, and
 * `pnpm corpora` builds what the app serves from it. A text joins them by pull request (README →
 * Bundled corpora); these are what such a pull request is held to, before anyone reads it.
 */

interface Source {
  file: string;
  name: string;
  language: string;
  license: string;
  source: string;
  description: string;
  retrieved?: string;
}

/** Resolved from the working directory, as the test corpora are: a jsdom module has an http URL. */
const RAW = resolve(process.cwd(), '../../packages/corpora/raw');
const BUILT = resolve(process.cwd(), 'public/corpora');
const sources = JSON.parse(readFileSync(resolve(RAW, 'sources.json'), 'utf8')) as Record<
  string,
  Source
>;
const index = JSON.parse(readFileSync(resolve(BUILT, 'index.json'), 'utf8')) as (Source & {
  id: string;
})[];

/** Licences that let the text be published with the app, as long as it is credited. */
const OPEN = /^(CC0|CC BY(-SA)? \d\.\d|Public domain)\b/;

/**
 * Whether a text's licence is open: one of those above, or, for a text made of many projects, a list
 * of the SPDX ids of the open source licences they are under, `MIT, Apache-2.0 (per project: …)`.
 */
function isOpen(license: string): boolean {
  if (OPEN.test(license)) return true;
  return license
    .replace(/\s*\(.*\)\s*$/, '')
    .split(', ')
    .every((id) => isAllowedLicense(id));
}
/** A raw text larger than this belongs in its source, not in the repository. */
const MAX_RAW_BYTES = 10_000_000;

describe('the texts that come with the app', () => {
  it.each(Object.entries(sources))(
    '%s says what it is, where it comes from, and its licence',
    (id, s) => {
      expect(id, 'an id is lower case words and hyphens').toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(s.name.trim(), 'a name').not.toBe('');
      expect(s.description.trim(), 'a description').not.toBe('');
      expect(
        s.language === CODE_TAG || languageProfile(s.language) !== undefined,
        `a language LayerBench has a profile for, or code: ${s.language}`,
      ).toBe(true);
      expect(s.source, 'a link to where it comes from').toMatch(/https?:\/\/\S/);
      expect(isOpen(s.license), `an open licence that allows publishing it: ${s.license}`).toBe(
        true,
      );
    },
  );

  it('keeps each raw text to a size the repository can carry', () => {
    for (const s of Object.values(sources)) {
      const file = resolve(RAW, s.file);
      if (existsSync(file)) expect(statSync(file).size, s.file).toBeLessThanOrEqual(MAX_RAW_BYTES);
    }
  });

  it('serves every text whose raw file is here, and nothing else', () => {
    const present = Object.entries(sources)
      .filter(([, s]) => existsSync(resolve(RAW, s.file)))
      .map(([id]) => id)
      .sort();
    expect(index.map((m) => m.id).sort()).toEqual(present);
  });

  it('serves each as its source says, so a change to sources.json is built before it lands', () => {
    for (const m of index) {
      const s = sources[m.id];
      expect(
        {
          name: m.name,
          language: m.language,
          license: m.license,
          source: m.source,
          description: m.description,
          retrieved: m.retrieved,
        },
        m.id,
      ).toEqual({
        name: s.name,
        language: s.language,
        license: s.license,
        source: s.source,
        description: s.description,
        retrieved: s.retrieved,
      });
      const manifest = JSON.parse(readFileSync(resolve(BUILT, m.id, 'manifest.json'), 'utf8'));
      expect(manifest, `${m.id}/manifest.json`).toEqual(m);
      expect(existsSync(resolve(BUILT, m.id, 'sample.txt')), `${m.id}/sample.txt`).toBe(true);
    }
  });
});

/**
 * The code and Markdown texts are made of many projects: `raw/code-sources.json` names each one at
 * the commit it is read at, and `pnpm corpora:extract` checks its licence file before reading it.
 */
interface CodeRepo {
  id: string;
  repo: string;
  commit: string;
  corpus: string;
  language?: string;
  license: string;
  licenseFile: string;
}

describe('the code and Markdown texts', () => {
  const code = JSON.parse(readFileSync(resolve(RAW, 'code-sources.json'), 'utf8')) as {
    corpora: Record<string, { kind: string; shares?: Record<string, number> }>;
    repos: CodeRepo[];
  };
  const report = readFileSync(resolve(RAW, 'CODE-SOURCES.md'), 'utf8');

  it('are texts the app serves, each made of projects', () => {
    for (const id of Object.keys(code.corpora)) {
      expect(sources[id], `${id} in sources.json`).toBeDefined();
      expect(code.repos.filter((r) => r.corpus === id).length, `${id}: projects`).toBeGreaterThan(
        2,
      );
    }
  });

  it('read each project at a commit, under an open licence, from a file that is named', () => {
    const ids = new Set<string>();
    for (const r of code.repos) {
      expect(ids.has(r.id), `${r.id} is listed twice`).toBe(false);
      ids.add(r.id);
      expect(r.commit, `${r.id}: a commit, not a branch`).toMatch(/^[0-9a-f]{40}$/);
      expect(r.repo, r.id).toMatch(/^[\w.-]+\/[\w.-]+$/);
      expect(isAllowedLicense(r.license), `${r.id}: ${r.license}`).toBe(true);
      expect(r.licenseFile.trim(), `${r.id}: its licence file`).not.toBe('');
      expect(code.corpora[r.corpus], `${r.id}: its corpus`).toBeDefined();
      expect(r.language !== undefined, `${r.id}: a language, for code`).toBe(
        code.corpora[r.corpus].kind === 'code',
      );
    }
  });

  it('say in their licence the licences of their projects, no more and no fewer', () => {
    for (const id of Object.keys(code.corpora)) {
      const used = [...new Set(code.repos.filter((r) => r.corpus === id).map((r) => r.license))];
      const said = sources[id].license.replace(/\s*\(.*\)\s*$/, '').split(', ');
      expect(said.sort(), id).toEqual(used.sort());
    }
  });

  it('are credited, project by project, in the file next to the data', () => {
    for (const r of code.repos) {
      expect(report, `${r.repo} in CODE-SOURCES.md`).toContain(
        `[${r.repo}](https://github.com/${r.repo}/tree/${r.commit})`,
      );
      expect(report, `${r.repo}: its licence`).toContain(
        `[${r.license}](https://github.com/${r.repo}/blob/${r.commit}/${r.licenseFile})`,
      );
    }
  });
});
