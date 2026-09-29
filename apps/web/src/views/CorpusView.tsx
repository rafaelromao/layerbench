import { type CorpusManifest, slug } from '@layoutmaster/core';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HelpLink } from '../components/HelpLink.js';
import { useAnalysisClient } from '../engine/client-context.js';
import type { CorpusFactsDTO } from '../engine/protocol.js';
import { HELP } from '../guide/help.js';
import { toast } from '../state/toasts.js';
import { useCollection, useStorage } from '../storage/use-storage.js';
import type { RawSearch } from '../url/params.js';

const MIN_CUSTOM_CHARS = 1_000;
const MAX_SAVED_SAMPLE_BYTES = 900_000;
const MAX_UPLOAD_BYTES = 5_000_000;

function FactsColumn({
  title,
  entries,
  total,
}: {
  title: string;
  entries: [string, number][];
  total: number;
}) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wide opacity-60 mb-1">{title}</h3>
      <ol className="space-y-0.5">
        {entries.map(([symbol, count]) => (
          <li key={symbol} className="flex justify-between font-mono text-xs">
            <span>{symbol === ' ' ? '␣' : symbol}</span>
            <span className="opacity-70 tabular-nums">
              {total > 0 ? ((count / total) * 100).toFixed(2) : '0.00'}%
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Facts({ facts }: { facts: CorpusFactsDTO }) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <FactsColumn title="Letters" entries={facts.letters} total={facts.symbols} />
      <FactsColumn title="Bigrams" entries={facts.bigrams} total={facts.symbols} />
      <FactsColumn title="Trigrams" entries={facts.trigrams} total={facts.symbols} />
      <FactsColumn title="Words" entries={facts.topWords} total={facts.words} />
    </div>
  );
}

export function CorpusView() {
  const search = useSearch({ strict: false }) as RawSearch;
  const navigate = useNavigate();
  const client = useAnalysisClient();
  const storage = useStorage();
  const savedCorpora = useCollection('corpora');

  const [corpora, setCorpora] = useState<CorpusManifest[]>([]);
  const [facts, setFacts] = useState<CorpusFactsDTO | null>(null);
  const [customText, setCustomText] = useState('');
  const [customName, setCustomName] = useState('My corpus');
  const [customLanguage, setCustomLanguage] = useState('custom');
  const [custom, setCustom] = useState<CorpusManifest | null>(null);
  const [customFacts, setCustomFacts] = useState<CorpusFactsDTO | null>(null);

  useEffect(() => {
    client
      .listCorpora()
      .then(setCorpora)
      .catch(() => setCorpora([]));
  }, [client]);

  const selectedId = search.id ?? corpora[0]?.id ?? null;
  const selected = useMemo(
    () => corpora.find((c) => c.id === selectedId) ?? null,
    [corpora, selectedId],
  );

  useEffect(() => {
    let cancelled = false;
    if (!selectedId) return;
    setFacts(null);
    client
      .corpusFacts(selectedId)
      .then((f) => {
        if (!cancelled) setFacts(f);
      })
      .catch(() => {
        if (!cancelled) setFacts(null);
      });
    return () => {
      cancelled = true;
    };
  }, [client, selectedId]);

  const build = useCallback(
    async (text: string) => {
      if (text.length < MIN_CUSTOM_CHARS) {
        toast.error(
          `Custom corpus needs at least ${MIN_CUSTOM_CHARS.toLocaleString('en-US')} characters`,
        );
        return;
      }
      const manifest = await client.buildCustomCorpus(text, customName, customLanguage);
      setCustom(manifest);
      setCustomFacts(await client.corpusFacts(manifest.id));
      setCustomText('');
      const list = await client.listCorpora();
      setCorpora(list);
    },
    [client, customName, customLanguage],
  );

  const onUpload = useCallback(
    async (file: File) => {
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error('That file is larger than 5 MB');
        return;
      }
      await build(await file.text());
    },
    [build],
  );

  const save = useCallback(async () => {
    if (!custom) return;
    const doc = await client.corpusDocument(custom.id);
    const bytes = new TextEncoder().encode(String(doc.sample ?? '')).length;
    if (bytes > MAX_SAVED_SAMPLE_BYTES) {
      toast.error(
        `Sample too large to save (limit ${MAX_SAVED_SAMPLE_BYTES / 1000} kB); it still works in this session`,
      );
      return;
    }
    const id = slug(custom.name);
    try {
      await storage.put('corpora', id, doc, { message: `Save corpus ${custom.name}` });
      toast.info(`Saved corpus ${id}`);
      savedCorpora.refresh();
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [custom, client, storage, savedCorpora]);

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="space-y-3">
        <div className="flex items-center gap-2">
          <h1 className="text-sm uppercase tracking-wide opacity-60">Corpora</h1>
          <HelpLink help={HELP.corpus} />
        </div>
        <ul className="menu bg-base-100 border border-base-300 rounded-box p-2">
          {corpora.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={c.id === selectedId ? 'active' : ''}
                onClick={() => navigate({ to: '/corpus', search: { id: c.id } as never })}
              >
                <span className="flex flex-col items-start">
                  <span className="text-sm">{c.name}</span>
                  <span className="text-[11px] opacity-60">
                    {c.language} · {c.words.toLocaleString('en-US')} words
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {selectedId && (
          <Link
            to="/"
            search={{ corpus: selectedId } as never}
            className="btn btn-primary btn-sm w-full"
          >
            Analyze with this corpus
          </Link>
        )}
      </aside>

      <div className="space-y-4">
        {selected && (
          <section className="card bg-base-100 border border-base-300">
            <div className="card-body gap-3 p-4">
              <h2 className="font-semibold text-sm">{selected.name}</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                <dt className="opacity-60">Language</dt>
                <dd>{selected.language}</dd>
                {selected.license && (
                  <>
                    <dt className="opacity-60">License</dt>
                    <dd>{selected.license}</dd>
                  </>
                )}
                {selected.source && (
                  <>
                    <dt className="opacity-60">Source</dt>
                    <dd className="break-all">{selected.source}</dd>
                  </>
                )}
                {selected.description && (
                  <>
                    <dt className="opacity-60">Description</dt>
                    <dd>{selected.description}</dd>
                  </>
                )}
                <dt className="opacity-60">Size</dt>
                <dd>
                  {selected.words.toLocaleString('en-US')} words ·{' '}
                  {selected.symbols.toLocaleString('en-US')} symbols
                </dd>
              </dl>
              {facts ? (
                <Facts facts={facts} />
              ) : (
                <div className="flex items-center gap-2 py-4">
                  <span className="loading loading-dots loading-xs" />
                  <span className="text-sm opacity-70">counting…</span>
                </div>
              )}
            </div>
          </section>
        )}

        <section className="card bg-base-100 border border-base-300">
          <div className="card-body gap-3 p-4">
            <div>
              <h2 className="font-semibold text-sm">Custom corpus</h2>
              <p className="text-xs opacity-70">
                Paste or upload your own text. It is normalized the same way the shipped corpora
                are, and stays in this browser.
              </p>
            </div>

            <form
              id="custom-corpus-form"
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void build(customText);
              }}
            >
              <div className="flex flex-wrap gap-2">
                <label className="form-control">
                  <span className="label-text text-xs">Name</span>
                  <input
                    aria-label="Corpus name"
                    className="input input-sm input-bordered"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                  />
                </label>
                <label className="form-control">
                  <span className="label-text text-xs">Language</span>
                  <select
                    aria-label="Language"
                    className="select select-sm select-bordered"
                    value={customLanguage}
                    onChange={(e) => setCustomLanguage(e.target.value)}
                  >
                    <option value="en">en</option>
                    <option value="pt-BR">pt-BR</option>
                    <option value="custom">custom</option>
                  </select>
                </label>
                <label className="form-control">
                  <span className="label-text text-xs">Upload</span>
                  <input
                    type="file"
                    accept=".txt,.md"
                    aria-label="Upload a text file"
                    className="file-input file-input-sm file-input-bordered"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void onUpload(file);
                    }}
                  />
                </label>
              </div>

              <textarea
                aria-label="Corpus text"
                rows={6}
                className="textarea textarea-bordered w-full font-mono text-xs"
                placeholder="Paste text here…"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
              />

              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn btn-sm btn-primary">
                  Build corpus
                </button>
                {custom && (
                  <>
                    <button type="button" className="btn btn-sm" onClick={save}>
                      Save to library
                    </button>
                    <Link
                      to="/"
                      search={{ corpus: custom.id } as never}
                      className="btn btn-sm btn-ghost"
                    >
                      Analyze with it
                    </Link>
                  </>
                )}
              </div>
            </form>

            {custom && (
              <>
                <p className="text-xs opacity-70 font-mono">
                  {custom.name} · {custom.words.toLocaleString('en-US')} words · id {custom.id}
                </p>
                {customFacts && <Facts facts={customFacts} />}
              </>
            )}

            {savedCorpora.entries.length > 0 && (
              <p className="text-xs opacity-60">
                Saved corpora: {savedCorpora.entries.map((e) => e.name).join(', ')}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export { MAX_SAVED_SAMPLE_BYTES };
