import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { languageProfile } from '@layerbench/core';
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
  generated?: boolean;
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
        languageProfile(s.language),
        `a language LayerBench has a profile for: ${s.language}`,
      ).toBeDefined();
      expect(s.source, 'a link to where it comes from').toMatch(/https?:\/\/\S/);
      expect(s.license, 'an open licence that allows publishing it with credit').toMatch(OPEN);
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
          generated: m.generated,
          retrieved: m.retrieved,
        },
        m.id,
      ).toEqual({
        name: s.name,
        language: s.language,
        license: s.license,
        source: s.source,
        description: s.description,
        generated: s.generated,
        retrieved: s.retrieved,
      });
      const manifest = JSON.parse(readFileSync(resolve(BUILT, m.id, 'manifest.json'), 'utf8'));
      expect(manifest, `${m.id}/manifest.json`).toEqual(m);
      expect(existsSync(resolve(BUILT, m.id, 'sample.txt')), `${m.id}/sample.txt`).toBe(true);
    }
  });
});
