import {
  type AnalysisSettings,
  type CorpusManifest,
  fnv1a,
  type IndexEntry,
  type StorageAdapter,
} from '@layerbench/core';
import { customError, readCustom } from '../custom/read.js';
import { customId, customRef } from '../custom/ref.js';
import type { AnalysisClient } from './protocol.js';

/** The engine's copy of a custom text, which it knows as `custom:<id>@<hash of its sample>`. */
function isEngineCopy(corpusId: string): boolean {
  const at = corpusId.lastIndexOf('@');
  return at > 0 && customId(corpusId.slice(0, at)) !== null;
}

/** What a picker shows for a custom text before it is read: the index has all but its symbols. */
function listed(entry: IndexEntry): CorpusManifest {
  return {
    id: customRef(entry.id),
    name: entry.name,
    language: entry.language ?? 'custom',
    license: entry.license,
    symbols: 0,
    words: entry.words ?? 0,
  };
}

/**
 * The engine, with the custom texts in `storage` offered beside the bundled ones. A custom text is
 * read the first time it is used and handed to the engine, which knows it by its name and a hash of
 * its sample: saved again under the same name, it is a new text there, and nothing worked out from
 * the old one is taken for it. Everything else goes through unchanged.
 */
export function withCustomCorpora(client: AnalysisClient, storage: StorageAdapter): AnalysisClient {
  /** What the engine was given for each custom text this session, by the name views use. */
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
      readCustom(storage, 'corpora', id).then((read) => {
        if (read.status !== 'read') throw new Error(customError('corpora', id, read));
        return read.doc;
      }),
    );

  /** The id the engine knows a corpus by. */
  const inEngine = async (corpusId: string): Promise<string> => {
    const id = customId(corpusId);
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

  const asCustom = (ref: string, manifest: CorpusManifest): CorpusManifest => ({
    ...manifest,
    id: ref,
  });

  return {
    async listCorpora() {
      const [engine, custom] = await Promise.all([
        client.listCorpora(),
        storage.list('corpora').catch(() => [] as IndexEntry[]),
      ]);
      const read = await Promise.all(
        custom.map(async (entry) => {
          const ref = customRef(entry.id);
          const manifest = await given.get(ref)?.catch(() => null);
          return manifest ? asCustom(ref, manifest) : listed(entry);
        }),
      );
      return [...engine.filter((m) => !isEngineCopy(m.id)), ...read];
    },
    async loadCorpus(corpusId) {
      const id = customId(corpusId);
      return id === null
        ? client.loadCorpus(corpusId)
        : asCustom(corpusId, await engineManifest(corpusId, id));
    },
    async registerCorpus(corpusId, doc) {
      return customId(corpusId) !== null
        ? asCustom(corpusId, await give(corpusId, Promise.resolve(doc)))
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
