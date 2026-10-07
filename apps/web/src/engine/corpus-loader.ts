import type { Corpus, CorpusLoader, CorpusManifest } from '@layerbench/core';

/**
 * Loads the shipped corpora over HTTP. The index exists because a browser cannot list a directory;
 * samples are fetched only when an analysis actually needs them.
 */
export function fetchCorpusLoader(baseUrl: string): CorpusLoader {
  const at = (path: string): string => `${baseUrl.replace(/\/$/, '')}/${path}`;

  return {
    async list(): Promise<CorpusManifest[]> {
      const res = await fetch(at('corpora/index.json'));
      if (!res.ok) throw new Error(`cannot list corpora (${res.status})`);
      return res.json() as Promise<CorpusManifest[]>;
    },
    async load(id: string): Promise<Corpus> {
      const [manifestRes, sampleRes] = await Promise.all([
        fetch(at(`corpora/${id}/manifest.json`)),
        fetch(at(`corpora/${id}/sample.txt`)),
      ]);
      if (!manifestRes.ok || !sampleRes.ok) throw new Error(`corpus ${id} not found`);
      const manifest = (await manifestRes.json()) as CorpusManifest;
      return { ...manifest, id, sample: await sampleRes.text(), custom: false };
    },
  };
}
