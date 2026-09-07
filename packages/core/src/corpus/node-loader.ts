import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Corpus, CorpusLoader, CorpusManifest } from './corpus.js';

/**
 * Reads the built corpora from disk. Used by tests and build tooling; the browser has its own
 * loader that fetches the same files over HTTP.
 */
export function nodeCorpusLoader(root: string): CorpusLoader {
  const manifestOf = (id: string): CorpusManifest =>
    JSON.parse(readFileSync(join(root, id, 'manifest.json'), 'utf8'));

  return {
    async list(): Promise<CorpusManifest[]> {
      return readdirSync(root, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
        .flatMap((id) => {
          try {
            return [manifestOf(id)];
          } catch {
            return [];
          }
        });
    },
    async load(id: string): Promise<Corpus> {
      const manifest = manifestOf(id);
      const sample = readFileSync(join(root, id, 'sample.txt'), 'utf8');
      return { ...manifest, id, sample, custom: false };
    },
  };
}
