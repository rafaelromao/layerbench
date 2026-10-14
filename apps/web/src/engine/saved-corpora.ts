import {
  type AnalysisSettings,
  type CorpusManifest,
  fnv1a,
  type IndexEntry,
  type StorageAdapter,
} from '@layerbench/core';
import { readSaved, savedError } from '../saved/read.js';
import { savedId, savedRef } from '../saved/ref.js';
import type { AnalysisClient } from './protocol.js';

/** The engine's copy of a saved text, which it knows as `saved:<id>@<hash of its sample>`. */
function isEngineCopy(corpusId: string): boolean {
  const at = corpusId.lastIndexOf('@');
  return at > 0 && savedId(corpusId.slice(0, at)) !== null;
}

/** What a picker shows for a saved text before it is read: the index has all but its symbols. */
function listed(entry: IndexEntry): CorpusManifest {
  return {
    id: savedRef(entry.id),
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

  const engineManifest = (ref: string, id: string): Promise<CorpusManifest> =>
    given.get(ref) ??
    give(
      ref,
      readSaved(storage, 'corpora', id).then((read) => {
        if (read.status !== 'read') throw new Error(savedError('corpora', id, read));
        return read.doc;
      }),
    );

  /** The id the engine knows a corpus by. */
  const inEngine = async (corpusId: string): Promise<string> => {
    const id = savedId(corpusId);
    return id === null ? corpusId : (await engineManifest(corpusId, id)).id;
  };

  /** The settings with their texts named as the engine knows them, a mix's two included. */
  const inEngineSettings = async (settings: AnalysisSettings): Promise<AnalysisSettings> => {
    const [corpus, corpus2] = await Promise.all([
      inEngine(settings.corpus),
      settings.corpus2 === null ? null : inEngine(settings.corpus2),
    ]);
    return { ...settings, corpus, corpus2 };
  };

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
          const ref = savedRef(entry.id);
          const manifest = await given.get(ref)?.catch(() => null);
          return manifest ? asSaved(ref, manifest) : listed(entry);
        }),
      );
      return [...engine.filter((m) => !isEngineCopy(m.id)), ...read];
    },
    async loadCorpus(corpusId) {
      const id = savedId(corpusId);
      return id === null
        ? client.loadCorpus(corpusId)
        : asSaved(corpusId, await engineManifest(corpusId, id));
    },
    async registerCorpus(corpusId, doc) {
      return savedId(corpusId) !== null
        ? asSaved(corpusId, await give(corpusId, Promise.resolve(doc)))
        : client.registerCorpus(corpusId, doc);
    },
    async peek(request) {
      return client.peek({ ...request, settings: await inEngineSettings(request.settings) });
    },
    async analyze(request, opts) {
      return client.analyze(
        { ...request, settings: await inEngineSettings(request.settings) },
        opts,
      );
    },
    // An estimate and an explanation read no text: they wait on nothing in storage.
    relabel: (request) => client.relabel(request),
    keyStats: (request) => client.keyStats(request),
    explain: (layout, text, settings) => client.explain(layout, text, settings),
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
