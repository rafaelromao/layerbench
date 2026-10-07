import { type CorpusManifest, fnv1a, type IndexEntry, type StorageAdapter } from '@layerbench/core';
import type { AnalysisClient } from './protocol.js';

/** How a view, or a link, names a saved text: `saved:<id>`, as it names a saved rule set. */
const SAVED = 'saved:';

export function savedCorpusRef(id: string): string {
  return `${SAVED}${id}`;
}

export function isSavedCorpus(corpusId: string): boolean {
  return corpusId.startsWith(SAVED);
}

/** What a picker shows for a saved text before it is read: the index has all but its symbols. */
function listed(entry: IndexEntry): CorpusManifest {
  return {
    id: savedCorpusRef(entry.id),
    name: entry.name,
    language: entry.language ?? 'custom',
    license: entry.license,
    symbols: 0,
    words: entry.words ?? 0,
  };
}

/**
 * The engine, with the texts saved in `storage` offered beside the bundled ones. A saved text is
 * read the first time it is used and handed to the engine, which knows it by its name and a hash of
 * its sample: saved again under the same name, it is a new text there, and nothing worked out from
 * the old one is taken for it. Everything else goes through unchanged.
 */
export function withSavedCorpora(client: AnalysisClient, storage: StorageAdapter): AnalysisClient {
  /** What the engine was given for each saved text this session, by the name views use. */
  const given = new Map<string, Promise<CorpusManifest>>();

  const give = (ref: string, doc: Promise<Record<string, unknown>>): Promise<CorpusManifest> => {
    const manifest = doc.then((d) =>
      client.registerCorpus(`${ref}@${fnv1a(String(d.sample ?? ''))}`, d),
    );
    given.set(ref, manifest);
    // A text that could not be read is tried again next time, as it may have been saved since.
    manifest.catch(() => {
      if (given.get(ref) === manifest) given.delete(ref);
    });
    return manifest;
  };

  const engineManifest = (ref: string): Promise<CorpusManifest> =>
    given.get(ref) ??
    give(
      ref,
      storage.get('corpora', ref.slice(SAVED.length)).then((stored) => {
        if (!stored) throw new Error(`There is no saved text ${ref.slice(SAVED.length)}`);
        return stored.doc;
      }),
    );

  /** The id the engine knows a corpus by. */
  const inEngine = async (corpusId: string): Promise<string> =>
    isSavedCorpus(corpusId) ? (await engineManifest(corpusId)).id : corpusId;

  const asSaved = (ref: string, manifest: CorpusManifest): CorpusManifest => ({
    ...manifest,
    id: ref,
  });

  return {
    async listCorpora() {
      const [engine, saved] = await Promise.all([
        client.listCorpora(),
        storage.list('corpora').catch(() => [] as IndexEntry[]),
      ]);
      const read = await Promise.all(
        saved.map(async (entry) => {
          const ref = savedCorpusRef(entry.id);
          const manifest = await given.get(ref)?.catch(() => null);
          return manifest ? asSaved(ref, manifest) : listed(entry);
        }),
      );
      return [...engine.filter((m) => !isSavedCorpus(m.id)), ...read];
    },
    async loadCorpus(corpusId) {
      return isSavedCorpus(corpusId)
        ? asSaved(corpusId, await engineManifest(corpusId))
        : client.loadCorpus(corpusId);
    },
    async registerCorpus(corpusId, doc) {
      return isSavedCorpus(corpusId)
        ? asSaved(corpusId, await give(corpusId, Promise.resolve(doc)))
        : client.registerCorpus(corpusId, doc);
    },
    async mixCorpora(a, b, mix) {
      return client.mixCorpora(await inEngine(a), await inEngine(b), mix);
    },
    async peek(request) {
      return client.peek({ ...request, corpusId: await inEngine(request.corpusId) });
    },
    async analyze(request, opts) {
      return client.analyze({ ...request, corpusId: await inEngine(request.corpusId) }, opts);
    },
    relabel: (request) => client.relabel(request),
    keyStats: (request) => client.keyStats(request),
    explain: (layout, text, caseMode) => client.explain(layout, text, caseMode),
    producers: (layout, caseMode) => client.producers(layout, caseMode),
    async corpusFacts(corpusId) {
      return client.corpusFacts(await inEngine(corpusId));
    },
    async corpusDocument(corpusId) {
      return client.corpusDocument(await inEngine(corpusId));
    },
    buildCustomCorpus: (text, name, language) => client.buildCustomCorpus(text, name, language),
  };
}
