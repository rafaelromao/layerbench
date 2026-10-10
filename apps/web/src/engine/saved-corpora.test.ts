import {
  bundledLayout,
  DEFAULT_SETTINGS,
  getPreset,
  type Layout,
  type StorageAdapter,
  toCanonicalJson,
} from '@layerbench/core';
import { nodeCorpusLoader } from '@layerbench/core/node';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '../storage/indexeddb.js';
import { testCorporaRoot } from '../test/render.js';
import { AnalysisCore } from './analysis-core.js';
import { DirectClient } from './direct-client.js';
import type { AnalyzeRequest } from './protocol.js';
import { withSavedCorpora } from './saved-corpora.js';

const FOX = Array.from(
  { length: 60 },
  (_, i) => `The quick brown fox ${['jumps', 'leaps', 'runs'][i % 3]} over the lazy dog.`,
).join(' ');
const JUGS = Array.from({ length: 60 }, () => 'Pack my box with five dozen liquor jugs.').join(' ');

let counter = 0;

/** An engine on this thread, a fresh browser store, and the engine as the views see it. */
function setup() {
  const engine = new DirectClient(new AnalysisCore(nodeCorpusLoader(testCorporaRoot())));
  const local = new IndexedDbAdapter(`layerbench-saved-corpora-${++counter}`);
  const reads: string[] = [];
  const storage: StorageAdapter = new Proxy(local, {
    get(target, prop) {
      const member = Reflect.get(target, prop);
      if (prop !== 'get' || typeof member !== 'function') return member;
      return (...args: [string, string]) => {
        reads.push(args[1]);
        return member.apply(target, args);
      };
    },
  });
  return { engine, storage, reads, client: withSavedCorpora(engine, storage) };
}

/** Build a text as the Corpus view does, and save it under `id`. */
async function save(
  engine: DirectClient,
  storage: StorageAdapter,
  id: string,
  text: string,
  name = 'My notes',
) {
  const built = await engine.buildCustomCorpus(text, name, 'en');
  await storage.put('corpora', id, await engine.corpusDocument(built.id));
  return built;
}

function onQwerty(corpus: string, corpus2: string | null = null): AnalyzeRequest {
  return {
    layout: toCanonicalJson(bundledLayout('qwerty') as Layout),
    settings: {
      ...DEFAULT_SETTINGS,
      corpus,
      corpus2,
      sample: 10_000,
      rules: getPreset('layouts_doc'),
    },
  };
}

describe('saved texts', () => {
  it('are offered after the bundled ones, by `saved:` and their id', async () => {
    const { engine, storage, client } = setup();
    const built = await save(engine, storage, 'my-notes', FOX);

    const listed = await client.listCorpora();
    expect(listed.map((c) => c.id)).toContain('en-general');
    expect(listed.at(-1)).toMatchObject({
      id: 'saved:my-notes',
      name: 'My notes',
      language: 'en',
      words: built.words,
    });
    // Read, it has its size too.
    expect(await client.loadCorpus('saved:my-notes')).toMatchObject({
      id: 'saved:my-notes',
      symbols: built.symbols,
      words: built.words,
    });
  });

  it('are analyzed as the text they were built from', async () => {
    const { engine, storage, client } = setup();
    const built = await save(engine, storage, 'my-notes', FOX);

    const saved = await client.analyze(onQwerty('saved:my-notes'));
    const fresh = await engine.analyze(onQwerty(built.id));
    expect(saved.results).toEqual(fresh.results);
    expect(saved.score).toEqual(fresh.score);
    expect(await client.corpusFacts('saved:my-notes')).toEqual(await engine.corpusFacts(built.id));
  });

  it('are read from storage once, however many ask at the same time', async () => {
    const { engine, storage, reads, client } = setup();
    await save(engine, storage, 'my-notes', FOX);

    await Promise.all([
      client.corpusFacts('saved:my-notes'),
      client.analyze(onQwerty('saved:my-notes')),
      client.analyze(onQwerty('saved:my-notes', 'en-general')),
    ]);
    await client.analyze(onQwerty('saved:my-notes'));
    expect(reads).toEqual(['my-notes']);
  });

  it('are mixed in as the text they were built from', async () => {
    const { engine, storage, client } = setup();
    const built = await save(engine, storage, 'my-notes', FOX);

    const saved = await client.analyze(onQwerty('en-general', 'saved:my-notes'));
    const fresh = await engine.analyze(onQwerty('en-general', built.id));
    expect(saved.results).toEqual(fresh.results);
  });

  it('are a new text when saved again under the same name', async () => {
    const { engine, storage, client } = setup();
    await save(engine, storage, 'my-notes', FOX);
    const before = await client.analyze(onQwerty('saved:my-notes'));

    // As the Corpus view does after saving: the engine is given the new text by the same name.
    const built = await engine.buildCustomCorpus(JUGS, 'My notes', 'en');
    const doc = await engine.corpusDocument(built.id);
    await storage.put('corpora', 'my-notes', doc);
    await client.registerCorpus('saved:my-notes', doc);

    const after = await client.analyze(onQwerty('saved:my-notes'));
    expect(after.results).not.toEqual(before.results);
    expect(after.results).toEqual((await engine.analyze(onQwerty(built.id))).results);
    expect((await client.loadCorpus('saved:my-notes')).words).toBe(built.words);
  });

  it('say so when one is not here, and are looked for again next time', async () => {
    const { engine, storage, client } = setup();
    await expect(client.loadCorpus('saved:my-notes')).rejects.toThrow(
      'There is no saved text my-notes',
    );

    await save(engine, storage, 'my-notes', FOX);
    expect((await client.loadCorpus('saved:my-notes')).name).toBe('My notes');
  });

  it('leave the rest of the engine as it is', async () => {
    const { engine, client } = setup();
    expect(await client.listCorpora()).toEqual(await engine.listCorpora());
    expect(await client.loadCorpus('en-general')).toEqual(await engine.loadCorpus('en-general'));
  });
});
